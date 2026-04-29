// Análisis normativo trimestral/anual: cumplimiento ≥90 lecturas, estadísticas y fuera de spec.
import type { Registro, Semana, PuntoLectura } from "./semanas";

export const MINIMO_NORMATIVO = 90;

export type Trimestre = 1 | 2 | 3 | 4;
export type Periodo =
  | { tipo: "trimestre"; anio: number; q: Trimestre }
  | { tipo: "anual"; anio: number }
  | { tipo: "custom"; desde: string; hasta: string };

export function trimestreDeFecha(iso: string): Trimestre {
  const m = parseInt(iso.slice(5, 7), 10);
  return (Math.ceil(m / 3) as Trimestre);
}

function fmtFechaCorta(iso: string): string {
  // iso = YYYY-MM-DD
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function rangoPeriodo(p: Periodo): { desde: string; hasta: string; etiqueta: string } {
  if (p.tipo === "anual") {
    return {
      desde: `${p.anio}-01-01`,
      hasta: `${p.anio}-12-31`,
      etiqueta: `Anual ${p.anio}`,
    };
  }
  if (p.tipo === "custom") {
    return {
      desde: p.desde,
      hasta: p.hasta,
      etiqueta: `${fmtFechaCorta(p.desde)} – ${fmtFechaCorta(p.hasta)}`,
    };
  }
  const startMonth = (p.q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(p.anio, endMonth, 0).getDate();
  return {
    desde: `${p.anio}-${String(startMonth).padStart(2, "0")}-01`,
    hasta: `${p.anio}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    etiqueta: `Q${p.q} ${p.anio}`,
  };
}

export function semanasDelPeriodo(registro: Registro, p: Periodo): Semana[] {
  const { desde, hasta } = rangoPeriodo(p);
  return registro.semanas.filter((s) => s.semana_inicio >= desde && s.semana_inicio <= hasta);
}

/** Días esperados de monitoreo entre dos fechas (lun-vie por defecto). */
export function diasHabilesEntre(desde: string, hasta: string, hoy = new Date()): number {
  const finReal = new Date(Math.min(new Date(hasta + "T23:59:59").getTime(), hoy.getTime()));
  const inicio = new Date(desde + "T00:00:00");
  if (finReal < inicio) return 0;
  let count = 0;
  const cursor = new Date(inicio);
  while (cursor <= finReal) {
    const d = cursor.getDay();
    if (d !== 0 && d !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function lecturasValidas(arr: PuntoLectura[] | undefined): number[] {
  return (arr ?? [])
    .filter((p) => !p._na && p.valor != null && Number.isFinite(p.valor))
    .map((p) => p.valor as number);
}

function percentil(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function statsBasicas(values: number[]) {
  if (values.length === 0) {
    return { n: 0, media: null, sd: null, sdMuestral: null, min: null, max: null, p5: null, p95: null };
  }
  const n = values.length;
  const media = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - media) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  // sd muestral (n-1) — usada para Cp/Cpk
  const sdMuestral = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - media) ** 2, 0) / (n - 1)) : null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n,
    media,
    sd,
    sdMuestral,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p5: percentil(sorted, 5),
    p95: percentil(sorted, 95),
  };
}

function indicesCapacidad(
  media: number | null,
  sdMuestral: number | null,
  lse: number | null | undefined,
  lie: number | null | undefined,
) {
  if (media == null || sdMuestral == null || sdMuestral === 0) {
    return { cp: null, cpk: null, ppk: null };
  }
  const tieneLSE = lse != null;
  const tieneLIE = lie != null;
  let cp: number | null = null;
  if (tieneLSE && tieneLIE) cp = (lse - lie) / (6 * sdMuestral);
  let cpu: number | null = null;
  let cpl: number | null = null;
  if (tieneLSE) cpu = (lse - media) / (3 * sdMuestral);
  if (tieneLIE) cpl = (media - lie) / (3 * sdMuestral);
  const candidatos = [cpu, cpl].filter((v): v is number => v != null);
  const cpk = candidatos.length ? Math.min(...candidatos) : null;
  // Ppk = Cpk en este contexto (mismo sd muestral, sin sub-grupos)
  return { cp, cpk, ppk: cpk };
}

function porcentajeDentroSpec(
  values: number[],
  lse: number | null | undefined,
  lie: number | null | undefined,
): number | null {
  if (values.length === 0) return null;
  let dentro = 0;
  for (const v of values) {
    const okSup = lse == null || v <= lse;
    const okInf = lie == null || v >= lie;
    if (okSup && okInf) dentro++;
  }
  return (dentro / values.length) * 100;
}

function fueraDeSpec(values: number[], lse: number | null | undefined, lie: number | null | undefined) {
  let altos = 0, bajos = 0;
  for (const v of values) {
    if (lse != null && v > lse) altos++;
    if (lie != null && v < lie) bajos++;
  }
  return { altos, bajos, total: altos + bajos };
}

export type EstadisticaSerie = {
  serie: "Temperatura" | "Humedad" | "Valor";
  unidad: string;
  lse: number | null;
  lie: number | null;
  n: number;
  media: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  fueraSpec: { altos: number; bajos: number; total: number };
};

export type AnalisisRegistro = {
  registro: Registro;
  periodo: Periodo;
  rango: { desde: string; hasta: string; etiqueta: string };
  semanasPeriodo: number;
  diasTranscurridos: number;
  diasHabiles: number;
  totalLecturas: number;
  cumpleMinimo: boolean;
  porcentajeMinimo: number; // total / 90 * 100 (cap 100)
  series: EstadisticaSerie[];
};

export function analizarRegistro(registro: Registro, periodo: Periodo, hoy = new Date()): AnalisisRegistro {
  const rango = rangoPeriodo(periodo);
  const semanas = semanasDelPeriodo(registro, periodo);
  const esTHR = registro.modulo === "temphr";

  const valoresT: number[] = [];
  const valoresHR: number[] = [];
  for (const s of semanas) {
    valoresT.push(...lecturasValidas(s.lecturas));
    if (esTHR) valoresHR.push(...lecturasValidas(s.lecturas_hr));
  }

  const series: EstadisticaSerie[] = [];
  if (esTHR) {
    const sT = statsBasicas(valoresT);
    series.push({
      serie: "Temperatura",
      unidad: "°C",
      lse: registro.lse_t ?? null,
      lie: registro.lie_t ?? null,
      ...sT,
      fueraSpec: fueraDeSpec(valoresT, registro.lse_t, registro.lie_t),
    });
    const sH = statsBasicas(valoresHR);
    series.push({
      serie: "Humedad",
      unidad: "%HR",
      lse: registro.lse_hr ?? null,
      lie: registro.lie_hr ?? null,
      ...sH,
      fueraSpec: fueraDeSpec(valoresHR, registro.lse_hr, registro.lie_hr),
    });
  } else {
    const s = statsBasicas(valoresT);
    series.push({
      serie: "Valor",
      unidad: "",
      lse: registro.lse ?? null,
      lie: registro.lie ?? null,
      ...s,
      fueraSpec: fueraDeSpec(valoresT, registro.lse, registro.lie),
    });
  }

  const totalLecturas = valoresT.length + valoresHR.length;
  const diasHabiles = diasHabilesEntre(rango.desde, rango.hasta, hoy);
  const diasTranscurridos = Math.max(
    0,
    Math.min(
      Math.ceil((hoy.getTime() - new Date(rango.desde).getTime()) / (1000 * 60 * 60 * 24)) + 1,
      Math.ceil((new Date(rango.hasta).getTime() - new Date(rango.desde).getTime()) / (1000 * 60 * 60 * 24)) + 1,
    ),
  );

  return {
    registro,
    periodo,
    rango,
    semanasPeriodo: semanas.length,
    diasTranscurridos,
    diasHabiles,
    totalLecturas,
    cumpleMinimo: totalLecturas >= MINIMO_NORMATIVO,
    porcentajeMinimo: Math.min(100, Math.round((totalLecturas / MINIMO_NORMATIVO) * 100)),
    series,
  };
}

// ===== Agrupación =====
export type AgruparPor = "registro" | "area" | "hvac" | "modulo";

export function claveGrupo(r: Registro, modo: AgruparPor): string {
  switch (modo) {
    case "area":
      return r.area_id ?? r.codigo_area_libre ?? "Sin área";
    case "hvac":
      return r.hvac_id ?? "Sin HVAC";
    case "modulo":
      return r.modulo;
    default:
      return r.id;
  }
}

export function etiquetaGrupo(
  r: Registro,
  modo: AgruparPor,
  catalogos: { areas: Map<string, string>; hvac: Map<string, string> },
): string {
  switch (modo) {
    case "area":
      return r.area_id ? catalogos.areas.get(r.area_id) ?? "Área desconocida" : r.nombre_area_libre ?? r.codigo_area_libre ?? "Sin área";
    case "hvac":
      return r.hvac_id ? catalogos.hvac.get(r.hvac_id) ?? "HVAC desconocido" : "Sin HVAC";
    case "modulo":
      return r.modulo;
    default:
      return r.nombre;
  }
}
