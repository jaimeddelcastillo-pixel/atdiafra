// Paquete de reporte FOR-VAL-16-02 (PNO-VAL-16).
// SheetJS arma las hojas con VALORES; JSZip agrega estilos, formato condicional y
// gráficas OOXML editables (dispersión con líneas). Todos los cálculos vienen de estadistica-pno.ts.
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { format } from "date-fns";
import type { AreaClasificada, CambioFiltro, Instrumento, SistemaHVAC } from "@/lib/catalogos";
import type { Registro } from "@/lib/semanas";
import { descriptive } from "./statistics";
import {
  capacidad, cartaXbarMRR, CONSTANTES_XR, D2_MR, E2_MR, dictamen, limitesDesdeParametros, normalidad,
  senalesFueraDeControl, TEXTO_INVESTIGAR_CAUSA_ESPECIAL, type DictamenPNO,
} from "./estadistica-pno";
import { esLecturaUtil, fechaRealISO, recortarSemanasPorFecha } from "./fechas-lectura";

// ---------------------------------------------------------------- tipos
type Tipo = "presion" | "filtro" | "thr";
type Fila = (string | number | null)[];

interface SerieGrafica {
  nombre: string; col: string; color: string;
  linea: "solid" | "dash" | "sysDot" | "none"; ancho?: number;
  /** Valores literales (p. ej. línea vertical de cambio de filtro) en lugar de rango de celdas. */
  lit?: { x: number[]; y: number[] };
  marcador?: { simbolo: "circle" | "square" | "diamond" | "triangle"; color: string; tam: number };
}
interface Grafica {
  hoja: string; filaIni: number; filaFin: number; colX: string; series: SerieGrafica[];
  titulo: string[]; tituloY: string; yMin: number; yMax: number; xMin: number; xMax: number;
  cy: number;
}

interface Bloque {
  hoja: string; codigo: string; variable: string; bitacora: string; tipo: Tipo;
  ubicacion: string; iso: string; lie: number | null; lse: number | null; unidad: string;
  n: number; media: number | null; s: number | null; min: number | null; max: number | null;
  LAS: number | null; LAI: number | null; LAcS: number | null; LAcI: number | null;
  Cp: number | null; Cpk: number | null; Pp: number | null; Ppk: number | null;
  normalidad: string; nSenales: number; dict: DictamenPNO | null;
  tablaLimites: Fila[]; filas: Fila[]; encabezado: string[]; graficas: Grafica[];
  saturacion?: number | null; cambios?: CambioFiltro[];
}

export interface PaqueteArgs {
  codigoAT: string;
  sistema: string;
  registros: Registro[];
  instrMap: Map<string, Instrumento>;
  areasMap: Map<string, AreaClasificada>;
  desde: string; // YYYY-MM-DD
  hasta: string;
  hvac?: SistemaHVAC;
  /** Cambios de filtro registrados (todas las fechas; se filtran por periodo). */
  cambiosFiltro?: CambioFiltro[];
}

// ---------------------------------------------------------------- utilidades
const EMU_CM = 360000;
const CX = 16 * EMU_CM; // 5 760 000
const CY = 9 * EMU_CM;  // 3 240 000
const CY_R = 5 * EMU_CM;
const ROW_EMU = 190500; // 15 pt

const xml = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const serial = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};
const fmtDMY = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const r3 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
const col = (i: number) => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

function nombreHoja(base: string, usadas: Set<string>) {
  const limpio = base.replace(/[\\/?*:[\]]/g, " ").slice(0, 31).trim() || "Hoja";
  let n = limpio, i = 2;
  while (usadas.has(n.toLowerCase())) n = `${limpio.slice(0, 27)} ${i++}`;
  usadas.add(n.toLowerCase());
  return n;
}

function escala(vals: (number | null)[]): { min: number; max: number } {
  const v = vals.filter((x): x is number => x != null && Number.isFinite(x));
  if (!v.length) return { min: 0, max: 1 };
  const lo = Math.min(...v), hi = Math.max(...v);
  const pad = hi > lo ? (hi - lo) * 0.05 : Math.max(Math.abs(hi) * 0.05, 1);
  return { min: r3(lo - pad)!, max: r3(hi + pad)! };
}

export function etiquetaPeriodo(desde: string, hasta: string): string {
  const y = desde.slice(0, 4);
  const fin = (m: number) => `${y}-${String(m).padStart(2, "0")}-${String(new Date(+y, m, 0).getDate()).padStart(2, "0")}`;
  if (hasta.slice(0, 4) === y) {
    if (desde === `${y}-01-01` && hasta === `${y}-12-31`) return y;
    if (desde === `${y}-01-01` && hasta === fin(6)) return `S1-${y}`;
    if (desde === `${y}-07-01` && hasta === fin(12)) return `S2-${y}`;
    for (let q = 1; q <= 4; q++) {
      const ini = `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
      if (desde === ini && hasta === fin(q * 3)) return `T${q}-${y}`;
    }
  }
  return `${desde.slice(8, 10)}-${desde.slice(5, 7)}-${desde.slice(0, 4)}_a_${hasta.slice(8, 10)}-${hasta.slice(5, 7)}-${hasta.slice(0, 4)}`;
}

// ---------------------------------------------------------------- datos
/** Agrupa lecturas por fecha real (orden Mañana/Media tarde/Tarde). */
function lecturasPorDia(r: Registro, campo: "lecturas" | "lecturas_hr", desde: string, hasta: string) {
  const orden = ["Mañana", "Media tarde", "Tarde"];
  const dias = new Map<string, { t: number; v: number }[]>();
  for (const s of recortarSemanasPorFecha(r.semanas, desde, hasta)) {
    for (const p of (s[campo] ?? [])) {
      if (!esLecturaUtil(p)) continue;
      const f = fechaRealISO(s.semana_inicio, p.dia);
      const arr = dias.get(f) ?? [];
      arr.push({ t: orden.indexOf(p.turno), v: p.valor as number });
      dias.set(f, arr);
    }
  }
  return [...dias.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, arr]) => ({ fecha, valores: arr.sort((a, b) => a.t - b.t).map((x) => x.v) }));
}

function ubicacionDe(r: Registro, ins: Instrumento | undefined, areasMap: Map<string, AreaClasificada>) {
  const porCodigo = new Map([...areasMap.values()].map((a) => [a.codigo, a]));
  const libre = ins?.area_libre ?? "";
  if (/ vs /i.test(libre)) {
    return libre.split(/ vs /i).map((c) => { const a = porCodigo.get(c.trim()); return a ? `${a.codigo} ${a.nombre}` : c.trim(); }).join(" vs ");
  }
  const a = (ins?.area_id && areasMap.get(ins.area_id)) || (r.area_id && areasMap.get(r.area_id)) || undefined;
  if (a) return `${a.codigo} ${a.nombre}`;
  return libre || r.nombre_area_libre || r.nombre;
}
function isoDe(r: Registro, ins: Instrumento | undefined, areasMap: Map<string, AreaClasificada>) {
  const a = (ins?.area_id && areasMap.get(ins.area_id)) || (r.area_id && areasMap.get(r.area_id)) || undefined;
  return a?.iso ?? r.iso ?? "No clasificada";
}
const specTxt = (lie: number | null, lse: number | null, u: string) =>
  lie != null && lse != null ? `${lie} – ${lse} ${u}` : lse != null ? `≤ ${lse} ${u}` : lie != null ? `≥ ${lie} ${u}` : "Sin especificación";

const dictTxt = (d: DictamenPNO | null) => (d ? `${d.estadoControl} · ${d.cumplimientoEspecificacion}` : "Sin datos");

// ---------------------------------------------------------------- bloques
function bloquePresion(base: Omit<Bloque, "n" | "media" | "s" | "min" | "max" | "LAS" | "LAI" | "LAcS" | "LAcI" | "Cp" | "Cpk" | "Pp" | "Ppk" | "normalidad" | "nSenales" | "dict" | "tablaLimites" | "filas" | "encabezado" | "graficas">,
  dias: { fecha: string; valores: number[] }[], rango: string, hasta: string): Bloque {
  const fechas = dias.map((d) => d.fecha);
  const vals = dias.map((d) => d.valores.reduce((a, b) => a + b, 0) / d.valores.length);
  const fueraLectura = (v: number) => (base.lie != null && v < base.lie) || (base.lse != null && v > base.lse);
  const individuales = dias.flatMap((d) => d.valores);
  const d = descriptive(vals);
  const media = d?.mean ?? null, s = d && d.n > 1 ? d.stdev : null;
  const lim = media != null && s != null ? limitesDesdeParametros(media, s, { lie: base.lie, lse: base.lse }) : null;
  const sen = media != null && s != null ? senalesFueraDeControl(vals, media, s) : [];
  const idxSen = new Set(sen.map((x) => x.index));
  const cap = media != null ? capacidad({ media, sigmaLP: s, lie: base.lie, lse: base.lse }) : null;
  const norm = normalidad(vals);
  // Límites con medias diarias; cumplimiento de especificación con cada lectura suelta.
  let dict = lim ? dictamen({ valores: individuales, spec: { lie: base.lie, lse: base.lse }, limites: lim, senales: sen, cpk: null }) : null;
  if (dict && lim) {
    const dMedias = dictamen({ valores: vals, spec: {}, limites: lim, senales: sen, cpk: null });
    const fueraSpec = individuales.filter(fueraLectura).length;
    const requiere = fueraSpec > 0 || dMedias.estadoControl === "FUERA DE CONTROL";
    const motivos = dMedias.motivos.filter((m) => m !== TEXTO_INVESTIGAR_CAUSA_ESPECIAL);
    if (fueraSpec) motivos.push(`${fueraSpec} lectura(s) individual(es) fuera de especificación`);
    else if (dMedias.estadoControl === "FUERA DE CONTROL") motivos.push(TEXTO_INVESTIGAR_CAUSA_ESPECIAL);
    if (cap?.Ppk != null && cap.Ppk < 1.33) motivos.push("Ppk < 1.33");
    dict = { estadoControl: dMedias.estadoControl, cumplimientoEspecificacion: fueraSpec ? "NO CUMPLE" : "CUMPLE", requiereInvestigacion: requiere, motivos };
  }

  // Filtros: regresión desde el último cambio de filtro, saturación del fabricante y cambios en el periodo.
  const esFiltro = base.tipo === "filtro";
  const sat = esFiltro ? base.saturacion ?? null : null;
  const cambiosPeriodo = esFiltro && fechas.length ? (base.cambios ?? []).filter((c) => c.fecha >= fechas[0] && c.fecha <= fechas[fechas.length - 1]) : [];
  const ultimoCambio = esFiltro ? [...(base.cambios ?? [])].filter((c) => c.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha)).pop() : undefined;
  let tend: ((x: number) => number) | null = null;
  let desdeTend = -Infinity, pendienteDia: number | null = null, diasSat: number | null = null;
  if (esFiltro) {
    desdeTend = ultimoCambio ? serial(ultimoCambio.fecha) : -Infinity;
    const idx = fechas.map((f, i) => [serial(f), vals[i]] as const).filter(([x]) => x >= desdeTend);
    if (idx.length >= 2) {
      const mx = idx.reduce((a, [x]) => a + x, 0) / idx.length, my = idx.reduce((a, [, y]) => a + y, 0) / idx.length;
      const sxx = idx.reduce((a, [x]) => a + (x - mx) ** 2, 0);
      const b = sxx ? idx.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0) / sxx : 0;
      tend = (x) => my + b * (x - mx);
      pendienteDia = b;
      if (sat != null && b > 0) {
        const xUlt = idx[idx.length - 1][0];
        diasSat = Math.max(0, (sat - tend(xUlt)) / b);
      }
    }
  }
  const encabezado = ["Fecha", "Medias", "Media", "LAS", "LAI", "LAcS", "LAcI", "LSE", "LIE", "Fuera de spec", "Señal W.E.",
    ...(tend ? ["Tendencia"] : []), ...(sat != null ? ["Saturación (fabricante)"] : [])];
  const filas: Fila[] = vals.map((v, i) => {
    const fuera = dias[i].valores.some(fueraLectura);
    const x = serial(fechas[i]);
    return [x, r3(v), r3(media), r3(lim?.LAS), r3(lim?.LAI), r3(lim?.LAcS), r3(lim?.LAcI),
      base.lse, base.lie, fuera ? r3(v) : null, idxSen.has(i) ? r3(v) : null,
      ...(tend ? [x >= desdeTend ? r3(tend(x)) : null] : []), ...(sat != null ? [sat] : [])];
  });
  const tablaLimites: Fila[] = esFiltro
    ? [["Alerta sup", "Alerta inf", "Acción sup", "Acción inf", "Pendiente (" + base.unidad + "/mes)", "Días estimados a saturación"],
       [r3(lim?.LAS), r3(lim?.LAI), r3(lim?.LAcS), r3(lim?.LAcI), r3(pendienteDia != null ? pendienteDia * 30.4375 : null),
        diasSat != null ? Math.round(diasSat) : sat == null ? "Sin ΔP fabricante" : pendienteDia == null ? "Datos insuficientes" : "Sin tendencia ascendente"]]
    : [["Alerta sup", "Alerta inf", "Acción sup", "Acción inf"], [r3(lim?.LAS), r3(lim?.LAI), r3(lim?.LAcS), r3(lim?.LAcI)]];

  const series: SerieGrafica[] = [
    { nombre: "Medias", col: "B", color: "1A56DB", linea: "solid", ancho: 15875, marcador: { simbolo: "circle", color: "1A56DB", tam: 4 } },
    { nombre: "Media", col: "C", color: "0D9488", linea: "solid" },
    { nombre: "LAS", col: "D", color: "F59E0B", linea: "dash" },
    { nombre: "LAI", col: "E", color: "F59E0B", linea: "dash" },
    { nombre: "LAcS", col: "F", color: "DC2626", linea: "dash" },
    { nombre: "LAcI", col: "G", color: "DC2626", linea: "dash" },
    ...(base.lse != null ? [{ nombre: "Especificación", col: "H", color: "374151", linea: "solid" as const }] : []),
    ...(base.lie != null ? [{ nombre: base.lse != null ? "Especificación inf" : "Especificación", col: "I", color: "374151", linea: "solid" as const }] : []),
    { nombre: "Fuera de spec", col: "J", color: "DC2626", linea: "none", marcador: { simbolo: "circle", color: "DC2626", tam: 7 } },
    { nombre: "Señal W.E.", col: "K", color: "EA580C", linea: "none", marcador: { simbolo: "diamond", color: "EA580C", tam: 7 } },
    ...(tend ? [{ nombre: "Tendencia", col: "L", color: "6B7280", linea: "sysDot" as const }] : []),
    ...(sat != null ? [{ nombre: "Saturación (fabricante)", col: col(11 + (tend ? 1 : 0)), color: "7C3AED", linea: "solid" as const, ancho: 15875 }] : []),
  ];
  const yVals = filas.flatMap((f) => f.slice(1).map((x) => (typeof x === "number" ? x : null)));
  const esc = escala(yVals);
  cambiosPeriodo.forEach((c, i) => series.push({
    nombre: i === 0 ? "Cambio de filtro" : `Cambio de filtro ${fmtDMY(c.fecha)}`, col: "", color: "111827", linea: "sysDot",
    lit: { x: [serial(c.fecha), serial(c.fecha)], y: [esc.min, esc.max] },
  }));
  return {
    ...base, n: vals.length, media: r3(media), s: r3(s), min: r3(d?.min), max: r3(d?.max),
    LAS: r3(lim?.LAS), LAI: r3(lim?.LAI), LAcS: r3(lim?.LAcS), LAcI: r3(lim?.LAcI),
    Cp: r3(cap?.Cp), Cpk: r3(cap?.Cpk), Pp: r3(cap?.Pp), Ppk: r3(cap?.Ppk),
    normalidad: norm ? `${norm.normal ? "Normal" : "No normal"} (p=${norm.p.toFixed(3)})` : "N/D",
    nSenales: idxSen.size, dict, tablaLimites, filas, encabezado,
    graficas: filas.length ? [{
      hoja: base.hoja, filaIni: 0, filaFin: 0, colX: "A", series,
      titulo: [base.codigo, base.ubicacion, `${base.iso} · ${rango}`],
      tituloY: "Presión diferencial (Pa)", yMin: esc.min, yMax: esc.max,
      xMin: serial(fechas[0]), xMax: serial(fechas[fechas.length - 1]), cy: CY,
    }] : [],
  };
}

function bloqueTHR(base: Parameters<typeof bloquePresion>[0], dias: { fecha: string; valores: number[] }[], rango: string, esHR: boolean): Bloque {
  const carta = cartaXbarMRR(dias.map((d) => d.valores));
  const todos = carta ? carta.subgrupos.flatMap((g) => dias[g.indice].valores) : [];
  const d = descriptive(todos);
  const s = d && d.n > 1 ? d.stdev : null;
  const xbars = carta?.subgrupos.map((g) => g.xbar) ?? [];
  const fechas = carta?.subgrupos.map((g) => dias[g.indice].fecha) ?? [];
  const c = carta ? CONSTANTES_XR[carta.tamano] : null;
  const LCSr = carta?.LCSr ?? null;
  // Reglas W.E./Nelson sobre la carta X̄ con σ entre días = MR̄/1.128
  const sen = carta ? senalesFueraDeControl(xbars, carta.xbarbar, carta.sigmaEntreDias) : [];
  const idxSen = new Set(sen.map((x) => x.index));
  const cap = carta ? capacidad({ media: carta.xbarbar, sigmaCP: carta.sigmaCortoPlazo, sigmaLP: s, lie: base.lie, lse: base.lse }) : null;
  const lim = d && s != null ? limitesDesdeParametros(d.mean, s, { lie: base.lie, lse: base.lse }) : null;
  const norm = normalidad(todos);
  let dict = carta && lim ? dictamen({
    valores: xbars, spec: { lie: base.lie, lse: base.lse }, limites: lim, senales: sen, cpk: null,
    control: { LCS: carta.LCSxMR, LCI: carta.LCIxMR },
  }) : null;
  if (dict && cap?.Ppk != null && cap.Ppk < 1.33) dict = { ...dict, motivos: [...dict.motivos, "Ppk < 1.33"] };
  const fueraInd = todos.filter((v) => (base.lie != null && v < base.lie) || (base.lse != null && v > base.lse)).length;
  if (dict && fueraInd && dict.cumplimientoEspecificacion === "CUMPLE") {
    dict = { ...dict, cumplimientoEspecificacion: "NO CUMPLE", requiereInvestigacion: true,
      motivos: [...dict.motivos.filter((m) => !m.startsWith("Fuera de control estadístico sin")), `${fueraInd} lectura(s) individual(es) fuera de especificación`] };
  }
  const encabezado = ["Fecha", "X̄", "R", "LC", "LCS", "LCI", "LSE", "LIE", "Fuera de spec", "Señal W.E.", "R̄", "LCS_R"];
  const filas: Fila[] = (carta?.subgrupos ?? []).map((g, i) => {
    const vs = dias[g.indice].valores;
    const fuera = vs.some((v) => (base.lie != null && v < base.lie) || (base.lse != null && v > base.lse));
    return [serial(fechas[i]), r3(g.xbar), r3(g.R), r3(carta!.xbarbar), r3(carta!.LCSxMR), r3(carta!.LCIxMR), base.lse, base.lie,
      fuera ? r3(g.xbar) : null, idxSen.has(i) ? r3(g.xbar) : null, r3(carta!.Rbar), r3(LCSr)];
  });
  const tablaLimites: Fila[] = [
    ["X̄", "R̄", "MR̄", "σ global", "σ corto plazo (R̄/d2)", "σ entre días (MR̄/1.128)", "LSE", "LIE", "LCS", "LCI"],
    [r3(carta?.xbarbar), r3(carta?.Rbar), r3(carta?.MRbar), r3(s), r3(carta?.sigmaCortoPlazo), r3(carta?.sigmaEntreDias), base.lse, base.lie, r3(carta?.LCSxMR), r3(carta?.LCIxMR)],
    ["Pp", "Ppk (dictamen)", "Capacidad (Ppk)", "Cp ref.", "Cps ref.", "Cpi ref.", "Cpk ref.", "Referencia", "", ""],
    [r3(cap?.Pp), r3(cap?.Ppk), cap?.etiquetaPpk ?? "N/D", r3(cap?.Cp), r3(cap?.Cps), r3(cap?.Cpi), r3(cap?.Cpk), "Cp/Cpk: variación dentro del día", null, null],
  ];
  const sX: SerieGrafica[] = [
    { nombre: "X̄", col: "B", color: "1A56DB", linea: "solid", ancho: 15875, marcador: { simbolo: "circle", color: "1A56DB", tam: 4 } },
    { nombre: "LC", col: "D", color: "0D9488", linea: "solid" },
    { nombre: "LCS", col: "E", color: "DC2626", linea: "dash" },
    { nombre: "LCI", col: "F", color: "DC2626", linea: "dash" },
    ...(base.lse != null ? [{ nombre: "LSE", col: "G", color: "374151", linea: "solid" as const }] : []),
    ...(base.lie != null ? [{ nombre: "LIE", col: "H", color: "374151", linea: "solid" as const }] : []),
    { nombre: "Fuera de spec", col: "I", color: "DC2626", linea: "none", marcador: { simbolo: "circle", color: "DC2626", tam: 7 } },
    { nombre: "Señal W.E.", col: "J", color: "EA580C", linea: "none", marcador: { simbolo: "diamond", color: "EA580C", tam: 7 } },
  ];
  const sR: SerieGrafica[] = [
    { nombre: "R", col: "C", color: "1A56DB", linea: "solid", ancho: 12700, marcador: { simbolo: "circle", color: "1A56DB", tam: 3 } },
    { nombre: "R̄", col: "K", color: "0D9488", linea: "solid" },
    { nombre: "LCS_R", col: "L", color: "DC2626", linea: "dash" },
  ];
  const num = (cols: number[]) => filas.flatMap((f) => cols.map((i) => (typeof f[i] === "number" ? (f[i] as number) : null)));
  const eX = escala(num([1, 3, 4, 5, 6, 7])), eR = escala([0, ...num([2, 10, 11])]);
  const tituloY = esHR ? "% Humedad relativa" : "Temperatura (°C)";
  const x0 = fechas.length ? serial(fechas[0]) : 0, x1 = fechas.length ? serial(fechas[fechas.length - 1]) : 1;
  const tit = [base.codigo, base.ubicacion, `${base.iso} · ${rango}`];
  return {
    ...base, n: todos.length, media: r3(d?.mean), s: r3(s), min: r3(d?.min), max: r3(d?.max),
    LAS: r3(lim?.LAS), LAI: r3(lim?.LAI), LAcS: r3(lim?.LAcS), LAcI: r3(lim?.LAcI),
    Cp: r3(cap?.Cp), Cpk: r3(cap?.Cpk), Pp: r3(cap?.Pp), Ppk: r3(cap?.Ppk),
    normalidad: norm ? `${norm.normal ? "Normal" : "No normal"} (p=${norm.p.toFixed(3)})` : "N/D",
    nSenales: idxSen.size, dict, tablaLimites, filas, encabezado,
    graficas: filas.length && c ? [
      { hoja: base.hoja, filaIni: 0, filaFin: 0, colX: "A", series: sX, titulo: tit, tituloY, yMin: eX.min, yMax: eX.max, xMin: x0, xMax: x1, cy: CY },
      { hoja: base.hoja, filaIni: 0, filaFin: 0, colX: "A", series: sR, titulo: [`${base.codigo} — Rangos (R)`], tituloY: `R ${esHR ? "(%HR)" : "(°C)"}`, yMin: Math.max(0, eR.min), yMax: eR.max, xMin: x0, xMax: x1, cy: CY_R },
    ] : [],
  };
}

// ---------------------------------------------------------------- gráficas OOXML
function chartXml(g: Grafica): string {
  const sh = `'${g.hoja.replaceAll("'", "''")}'`;
  const rng = (c: string) => `${sh}!$${c}$${g.filaIni}:$${c}$${g.filaFin}`;
  const font = (sz: number, b = false) => `<a:defRPr sz="${sz}" b="${b ? 1 : 0}"><a:latin typeface="Calibri"/></a:defRPr>`;
  const txPr = (sz: number) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>${font(sz)}</a:pPr><a:endParaRPr lang="es-MX"/></a:p></c:txPr>`;
  const series = g.series.map((s, i) => {
    const ln = s.linea === "none"
      ? `<a:ln><a:noFill/></a:ln>`
      : `<a:ln w="${s.ancho ?? 12700}" cap="flat"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill>${s.linea !== "solid" ? `<a:prstDash val="${s.linea}"/>` : ""}</a:ln>`;
    const mk = s.marcador
      ? `<c:marker><c:symbol val="${s.marcador.simbolo}"/><c:size val="${s.marcador.tam}"/><c:spPr><a:solidFill><a:srgbClr val="${s.marcador.color}"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="${s.marcador.color}"/></a:solidFill></a:ln></c:spPr></c:marker>`
      : `<c:marker><c:symbol val="none"/></c:marker>`;
    const lit = (v: number[]) => `<c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${v.length}"/>${v.map((x, k) => `<c:pt idx="${k}"><c:v>${x}</c:v></c:pt>`).join("")}</c:numLit>`;
    const xv = s.lit ? lit(s.lit.x) : `<c:numRef><c:f>${xml(rng(g.colX))}</c:f></c:numRef>`;
    const yv = s.lit ? lit(s.lit.y) : `<c:numRef><c:f>${xml(rng(s.col))}</c:f></c:numRef>`;
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${xml(s.nombre)}</c:v></c:tx><c:spPr>${ln}</c:spPr>${mk}<c:xVal>${xv}</c:xVal><c:yVal>${yv}</c:yVal><c:smooth val="0"/></c:ser>`;
  }).join("");
  const titulo = g.titulo.map((t, i) => `<a:p><a:pPr>${font(900, i === 0)}</a:pPr><a:r><a:rPr lang="es-MX" sz="900" b="${i === 0 ? 1 : 0}"><a:latin typeface="Calibri"/></a:rPr><a:t>${xml(t)}</a:t></a:r></a:p>`).join("");
  const axTitle = (t: string, rot = false) => `<c:title><c:tx><c:rich><a:bodyPr${rot ? ' rot="-5400000" vert="horz"' : ""}/><a:lstStyle/><a:p><a:pPr>${font(900)}</a:pPr><a:r><a:rPr lang="es-MX" sz="900" b="0"><a:latin typeface="Calibri"/></a:rPr><a:t>${xml(t)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
  const gris = `<c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:ln></c:spPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:date1904 val="0"/><c:lang val="es-MX"/><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>${titulo}</c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea>${g.cy === CY ? '<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.1"/><c:y val="0.24"/><c:w val="0.86"/><c:h val="0.42"/></c:manualLayout></c:layout>' : "<c:layout/>"}<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${series}<c:axId val="510001"/><c:axId val="510002"/></c:scatterChart><c:valAx><c:axId val="510001"/><c:scaling><c:orientation val="minMax"/><c:max val="${g.xMax}"/><c:min val="${g.xMin}"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${axTitle("Días")}<c:numFmt formatCode="dd/mmm" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${gris}${txPr(900)}<c:crossAx val="510002"/><c:crosses val="min"/><c:crossBetween val="midCat"/></c:valAx><c:valAx><c:axId val="510002"/><c:scaling><c:orientation val="minMax"/><c:max val="${g.yMax}"/><c:min val="${g.yMin}"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="3175"><a:solidFill><a:srgbClr val="E5E7EB"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>${axTitle(g.tituloY, true)}<c:numFmt formatCode="0.0" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${gris}${txPr(900)}<c:crossAx val="510001"/><c:crosses val="min"/><c:crossBetween val="midCat"/></c:valAx><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr(900)}</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr>${txPr(900)}</c:chartSpace>`;
}

function drawingXml(anclas: { col: number; row: number; cy: number; rid: string; id: number }[]): string {
  const a = anclas.map((x) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${x.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${x.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${CX}" cy="${x.cy}"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${x.id + 1}" name="Gráfica ${x.id}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${x.rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${a}</xdr:wsDr>`;
}

// ---------------------------------------------------------------- estilos
// cellXfs: 0 normal · 1 encabezado azul claro · 2 número 0.000 con borde · 3 fecha · 4 título · 5 negrita · 6 texto con borde · 7 nota
const ST = { normal: 0, head: 1, num: 2, fecha: 3, titulo: 4, bold: 5, txt: 6, nota: 7 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.000"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts><fonts count="4"><font><sz val="10"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="10"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><color rgb="FF1F3864"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="9"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDEEAF6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF9DC3E6"/></left><right style="thin"><color rgb="FF9DC3E6"/></right><top style="thin"><color rgb="FF9DC3E6"/></top><bottom style="thin"><color rgb="FF9DC3E6"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="3"><dxf><font><color rgb="FF006100"/></font><fill><patternFill><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf><dxf><font><color rgb="FF9C5700"/></font><fill><patternFill><bgColor rgb="FFFFEB9C"/></patternFill></fill></dxf><dxf><font><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf></dxfs><tableStyles count="0"/></styleSheet>`;

/** Hoja con estilos por celda (aplicados después en el XML). */
class HojaBuilder {
  aoa: Fila[] = [];
  estilos = new Map<string, number>();
  set(r: number, c: number, v: string | number | null, st = ST.normal) {
    while (this.aoa.length <= r) this.aoa.push([]);
    this.aoa[r][c] = v;
    if (st) this.estilos.set(`${col(c)}${r + 1}`, st);
  }
  fila(r: number, c0: number, vals: Fila, st: number | ((v: unknown, i: number) => number)) {
    vals.forEach((v, i) => this.set(r, c0 + i, v, typeof st === "function" ? st(v, i) : st));
  }
}
const stVal = (v: unknown) => (typeof v === "number" ? ST.num : ST.txt);

// ---------------------------------------------------------------- principal
export async function exportarPaqueteForVal16(a: PaqueteArgs): Promise<{ archivo: string; bloques: number }> {
  const rango = `${fmtDMY(a.desde)} – ${fmtDMY(a.hasta)}`;
  const usadas = new Set<string>(["portada", "resumen", "gráficas"]);
  const regs = [...a.registros].sort((x, y) => {
    const cx = (x.instrumento_id && a.instrMap.get(x.instrumento_id)?.codigo) || x.nombre;
    const cy = (y.instrumento_id && a.instrMap.get(y.instrumento_id)?.codigo) || y.nombre;
    return cx.localeCompare(cy);
  });

  const bloques: Bloque[] = [];
  const portadaInst: { codigo: string; bitacora: string; variable: string; n: number }[] = [];
  for (const r of regs) {
    const ins = r.instrumento_id ? a.instrMap.get(r.instrumento_id) : undefined;
    const codigo = ins?.codigo ?? r.nombre;
    const bit = ins?.codigo_bitacora?.trim() || r.nombre;
    const comun = { codigo, bitacora: bit, ubicacion: ubicacionDe(r, ins, a.areasMap), iso: isoDe(r, ins, a.areasMap) };
    if (r.modulo === "temphr") {
      for (const [campo, v, lie, lse, u] of [["lecturas", "T", r.lie_t, r.lse_t, "°C"], ["lecturas_hr", "HR", r.lie_hr, r.lse_hr, "%HR"]] as const) {
        const dias = lecturasPorDia(r, campo, a.desde, a.hasta);
        const n = dias.reduce((s, d) => s + d.valores.length, 0);
        portadaInst.push({ codigo, bitacora: bit, variable: v === "T" ? "Temperatura" : "Humedad relativa", n });
        if (!n) continue;
        const hoja = nombreHoja(`${codigo} ${v}`, usadas);
        bloques.push(bloqueTHR({ ...comun, hoja, variable: v === "T" ? "Temperatura" : "Humedad relativa", tipo: "thr", lie: lie ?? null, lse: lse ?? null, unidad: u }, dias, rango, v === "HR"));
      }
    } else if (r.modulo === "presiones" || r.modulo === "filtros") {
      const dias = lecturasPorDia(r, "lecturas", a.desde, a.hasta);
      const n = dias.reduce((s, d) => s + d.valores.length, 0);
      portadaInst.push({ codigo, bitacora: bit, variable: "Presión diferencial", n });
      if (!n) continue;
      const hoja = nombreHoja(codigo, usadas);
      const unidad = r.semanas.find((s) => s.unidad?.trim())?.unidad || "Pa";
      bloques.push(bloquePresion({
        ...comun, hoja, variable: "Presión diferencial", tipo: r.modulo === "filtros" || ins?.tipo === "manometro_filtro" ? "filtro" : "presion",
        lie: r.lie ?? ins?.lie_pa ?? null, lse: r.lse ?? ins?.lse_pa ?? null, unidad,
        saturacion: ins?.dp_final_fabricante ?? null,
        cambios: (a.cambiosFiltro ?? []).filter((c) => c.instrumento_id === ins?.id),
      }, dias, rango, a.hasta));
    }
  }

  const wb = XLSX.utils.book_new();
  const hojas: { nombre: string; b: HojaBuilder; anclas: { col: number; row: number; g: Grafica }[]; cf?: string; cols: number[] }[] = [];

  // Portada
  {
    const b = new HojaBuilder();
    b.set(0, 0, "DIAFRA, S.A. de C.V.", ST.titulo);
    b.set(1, 0, "FOR-VAL-16-02 · Análisis de tendencias (PNO-VAL-16)", ST.bold);
    const datos: [string, string][] = [["Código de reporte", a.codigoAT], ["Sistema", a.sistema], ["Periodo", rango], ["Fecha de emisión", format(new Date(), "dd/MM/yyyy")]];
    datos.forEach(([k, v], i) => { b.set(3 + i, 0, k, ST.head); b.set(3 + i, 1, v, ST.txt); });
    b.fila(9, 0, ["Instrumento", "Bitácora", "Variable", "n de datos"], ST.head);
    portadaInst.forEach((p, i) => b.fila(10 + i, 0, [p.codigo, p.bitacora, p.variable, p.n], (v) => (typeof v === "number" ? ST.txt : ST.txt)));
    hojas.push({ nombre: "Portada", b, anclas: [], cols: [22, 44, 20, 12] });
  }

  // Resumen
  {
    const b = new HojaBuilder();
    b.set(0, 0, `Resumen estadístico · ${a.codigoAT} · ${a.sistema} · ${rango}`, ST.titulo);
    const head = ["Código", "Bitácora", "Variable", "Ubicación", "Clase ISO", "Especificación", "n", "Media", "s", "Mín", "Máx", "LAS", "LAI", "LAcS", "LAcI", "Cp", "Cpk", "Pp", "Ppk", "Normalidad", "N° señales", "Dictamen", "Requiere investigación", "Motivos"];
    b.fila(2, 0, head, ST.head);
    bloques.forEach((k, i) => b.fila(3 + i, 0, [
      k.codigo, k.bitacora, k.variable, k.ubicacion, k.iso, specTxt(k.lie, k.lse, k.unidad), k.n, k.media, k.s, k.min, k.max,
      k.LAS, k.LAI, k.LAcS, k.LAcI, k.Cp, k.Cpk, k.Pp, k.Ppk, k.normalidad, k.nSenales, dictTxt(k.dict),
      k.dict?.requiereInvestigacion ? "Sí" : "No", (k.dict?.motivos ?? []).join("; "),
    ], (v, j) => (j === 6 || j === 20 ? ST.txt : stVal(v))));
    const last = 3 + bloques.length;
    const notaIni = last + 2;
    const notas = [
      "Notas de cálculo (PNO-VAL-16) — los límites se escriben como valores calculados por la app:",
      "Presiones y filtros: los límites se calculan con las MEDIAS DIARIAS (igual que el reporte normativo). LAS/LAI = μ ± 2s; LAcS/LAcI = μ ± 3s (s muestral, n−1).",
      "Presiones y filtros: el cumplimiento de especificación se evalúa con CADA LECTURA SUELTA; si alguna está fuera, el día se marca en «Fuera de spec» aunque su media cumpla.",
      "Filtros: Tendencia = regresión lineal desde el último cambio de filtro; Pendiente (unidad/mes) = b·30.4375; Días a saturación = (ΔP fabricante − tendencia en el último día)/b. Líneas verticales = cambios de filtro en el periodo.",
      "9.3.7: el límite de acción no rebasa la especificación. 9.3.8: si la alerta queda fuera de su acción, alerta = acción + 0.5·(μ − acción) (y espejo superior).",
      `T/HR: carta de 3 vías X̄-MR-R (PNO 9.3.4.1). Subgrupo = un día (Mañana / Media tarde / Tarde). MR̄ = promedio |X̄ᵢ − X̄ᵢ₋₁|; LCS/LCI = X̄̄ ± ${E2_MR}·MR̄; σ entre días = MR̄/${D2_MR} (reglas W.E./Nelson). LCS_R = D4·R̄; LCI_R = D3·R̄; σ corto plazo = R̄/d2.`,
      `Constantes n=2: A2 ${CONSTANTES_XR[2].A2}, D3 ${CONSTANTES_XR[2].D3}, D4 ${CONSTANTES_XR[2].D4}, d2 ${CONSTANTES_XR[2].d2} · n=3: A2 ${CONSTANTES_XR[3].A2}, D3 ${CONSTANTES_XR[3].D3}, D4 ${CONSTANTES_XR[3].D4}, d2 ${CONSTANTES_XR[3].d2} · n=4: A2 ${CONSTANTES_XR[4].A2}, D4 ${CONSTANTES_XR[4].D4}, d2 ${CONSTANTES_XR[4].d2}.`,
      "Capacidad: dictamen y etiqueta Capaz/Marginal/No capaz con Ppk (s global). Cp/Cpk (σ = R̄/d2) solo como referencia de la variación dentro del día. Presiones: no se calcula Cp/Cpk.",
      "Normalidad: Anderson–Darling (α = 0.05). Señales: Western Electric 1–4 + Nelson 5 (6 puntos en tendencia) y 6 (14 alternados).",
      "Dictamen = estado de control · cumplimiento de especificación. Verde: bajo control y cumple; ámbar: con alertas; rojo: fuera de control o no cumple.",
    ];
    notas.forEach((t, i) => b.set(notaIni + i, 0, t, i === 0 ? ST.bold : ST.nota));
    const ref = `V4:V${Math.max(4, last)}`;
    const cf = `<conditionalFormatting sqref="${ref}"><cfRule type="expression" dxfId="2" priority="1" stopIfTrue="1"><formula>OR(ISNUMBER(SEARCH("FUERA",V4)),ISNUMBER(SEARCH("NO CUMPLE",V4)))</formula></cfRule><cfRule type="expression" dxfId="1" priority="2" stopIfTrue="1"><formula>ISNUMBER(SEARCH("ALERTAS",V4))</formula></cfRule><cfRule type="expression" dxfId="0" priority="3"><formula>ISNUMBER(SEARCH("BAJO CONTROL",V4))</formula></cfRule></conditionalFormatting>`;
    hojas.push({ nombre: "Resumen", b, anclas: [], cf, cols: [14, 16, 16, 34, 12, 16, 6, 9, 9, 9, 9, 9, 9, 9, 9, 8, 8, 8, 8, 20, 9, 34, 12, 60] });
  }

  // Hojas por instrumento/variable
  for (const k of bloques) {
    const b = new HojaBuilder();
    b.set(0, 0, `${k.codigo} — ${k.variable}`, ST.titulo);
    b.set(1, 0, `${k.ubicacion} · ${k.iso} · ${rango} · Especificación ${specTxt(k.lie, k.lse, k.unidad)}`, ST.nota);
    k.tablaLimites.forEach((f, i) => b.fila(3 + i, 0, f, i % 2 === 0 ? ST.head : ST.num));
    const hRow = 3 + k.tablaLimites.length + 1; // 0-based
    b.fila(hRow, 0, k.encabezado, ST.head);
    k.filas.forEach((f, i) => b.fila(hRow + 1 + i, 0, f, (_, j) => (j === 0 ? ST.fecha : ST.num)));
    const ini = hRow + 2, fin = hRow + 1 + k.filas.length;
    const colG = k.encabezado.length + 1;
    let fila = 0;
    const anclas = k.graficas.map((g) => {
      g.filaIni = ini; g.filaFin = fin;
      const an = { col: colG, row: fila, g };
      fila += Math.ceil(g.cy / ROW_EMU) + 1;
      return an;
    });
    hojas.push({ nombre: k.hoja, b, anclas, cols: [12, ...k.encabezado.slice(1).map(() => 10)] });
  }

  // Gráficas apiladas
  {
    const b = new HojaBuilder();
    b.set(0, 0, `Gráficas · ${a.codigoAT} · ${a.sistema} · ${rango}`, ST.titulo);
    let row = 2;
    const anclas: { col: number; row: number; g: Grafica }[] = [];
    for (const k of bloques) {
      for (const g of k.graficas) {
        anclas.push({ col: 0, row, g });
        row += Math.ceil(g.cy / ROW_EMU) + 1;
      }
      k.tablaLimites.forEach((f, i) => b.fila(row + i, 0, f, i % 2 === 0 ? ST.head : ST.num));
      row += k.tablaLimites.length + 3;
    }
    hojas.push({ nombre: "Gráficas", b, anclas, cols: Array(8).fill(13) });
  }

  for (const h of hojas) {
    const ws = XLSX.utils.aoa_to_sheet(h.b.aoa.map((r) => Array.from(r, (v) => (v === undefined ? null : v))));
    ws["!cols"] = h.cols.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, h.nombre);
  }
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const zip = await JSZip.loadAsync(buffer);
  zip.file("xl/styles.xml", STYLES);

  let chartN = 0, drawN = 0;
  const overrides: string[] = [];
  for (let i = 0; i < hojas.length; i++) {
    const h = hojas[i];
    const path = `xl/worksheets/sheet${i + 1}.xml`;
    let x = (await zip.file(path)!.async("string"))
      .replace(/<c r="([A-Z]+\d+)"/g, (m, ref) => { const s = h.b.estilos.get(ref); return s ? `<c r="${ref}" s="${s}"` : m; })
      .replace(/<ignoredErrors>.*?<\/ignoredErrors>/, "");
    if (h.cf) x = x.replace("</sheetData>", `</sheetData>${h.cf}`);
    if (h.anclas.length) {
      drawN++;
      const anc = h.anclas.map((an, j) => {
        chartN++;
        zip.file(`xl/charts/chart${chartN}.xml`, chartXml(an.g));
        overrides.push(`<Override PartName="/xl/charts/chart${chartN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        return { col: an.col, row: an.row, cy: an.g.cy, rid: `rId${j + 1}`, id: chartN, target: `../charts/chart${chartN}.xml` };
      });
      zip.file(`xl/drawings/drawing${drawN}.xml`, drawingXml(anc));
      zip.file(`xl/drawings/_rels/drawing${drawN}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${anc.map((c) => `<Relationship Id="${c.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="${c.target}"/>`).join("")}</Relationships>`);
      zip.file(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawN}.xml"/></Relationships>`);
      overrides.push(`<Override PartName="/xl/drawings/drawing${drawN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      if (!x.includes("xmlns:r=")) x = x.replace("<worksheet ", '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
      x = x.replace("</worksheet>", '<drawing r:id="rIdDr1"/></worksheet>');
    }
    zip.file(path, x);
  }
  const ct = await zip.file("[Content_Types].xml")!.async("string");
  zip.file("[Content_Types].xml", ct.replace("</Types>", `${overrides.join("")}</Types>`));

  const limpio = (s: string) => s.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const archivo = `FOR-VAL-16-02_${limpio(a.codigoAT)}_${limpio(a.sistema)}_${limpio(etiquetaPeriodo(a.desde, a.hasta))}.xlsx`;
  const blob = await zip.generateAsync({ type: typeof window === "undefined" ? "nodebuffer" : "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as JSZip.JSZipGeneratorOptions<"blob">);
  if (typeof window !== "undefined") {
    const url = URL.createObjectURL(blob as Blob);
    const el = document.createElement("a");
    el.href = url; el.download = archivo; el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    (globalThis as { __forval16?: unknown }).__forval16 = blob;
  }
  return { archivo, bloques: bloques.length };
}
