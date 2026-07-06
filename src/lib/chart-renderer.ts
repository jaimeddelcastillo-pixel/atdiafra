// Generador de gráficas de tendencia (canvas nativo) para embeber en jsPDF.
import type { Registro, Semana, PuntoLectura, Dia, Turno } from "./semanas";
import { descriptive } from "./statistics";

type Punto = { t: number; v: number; outOfSpec: boolean };

const DIAS_IDX: Record<Dia, number> = {
  Lunes: 0, Martes: 1, Miércoles: 2, Jueves: 3, Viernes: 4, Sábado: 5, Domingo: 6,
};
const TURNOS_IDX: Record<Turno, number> = { "Mañana": 0, "Media tarde": 1, Tarde: 2 };

function puntosDeSemanas(
  semanas: Semana[],
  campo: "lecturas" | "lecturas_hr",
  lse: number | null,
  lie: number | null,
): Punto[] {
  const out: Punto[] = [];
  for (const s of semanas) {
    const base = new Date(s.semana_inicio + "T08:00:00").getTime();
    const arr = (s as Semana)[campo] ?? [];
    for (const p of arr as PuntoLectura[]) {
      if (p._na || p.valor == null || !Number.isFinite(p.valor)) continue;
      const t = base + DIAS_IDX[p.dia] * 86400000 + TURNOS_IDX[p.turno] * 4 * 3600000;
      const v = p.valor as number;
      const oos = (lse != null && v > lse) || (lie != null && v < lie);
      out.push({ t, v, outOfSpec: oos });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

type LineaRef = {
  y: number;
  label: string;
  color: string;
  dash?: number[];
  labelPos?: "top" | "bottom";
};

type ChartOpts = {
  width: number;
  height: number;
  titulo: string;
  subtitulo?: string;
  puntos: Punto[];
  refs: LineaRef[];
  decimales: number;
  /** Mensaje central alternativo (por ejemplo "n insuficiente…"). Si se define, no se dibujan puntos ni refs. */
  mensajeCentral?: string;
};

function dibujarChartGenerico(o: ChartOpts): string {
  const cv = document.createElement("canvas");
  const scale = 2;
  cv.width = o.width * scale;
  cv.height = o.height * scale;
  const ctx = cv.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, o.width, o.height);

  const padL = 50, padR = 74, padT = 36, padB = 28;
  const W = o.width - padL - padR;
  const H = o.height - padT - padB;

  // Título
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 12px Helvetica, Arial, sans-serif";
  ctx.fillText(o.titulo, padL, 18);
  if (o.subtitulo) {
    ctx.fillStyle = "#64748b";
    ctx.font = "10px Helvetica, Arial, sans-serif";
    ctx.fillText(o.subtitulo, padL, 30);
  }

  // Marco base
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(padL, padT, W, H);

  if (o.mensajeCentral) {
    ctx.fillStyle = "#64748b";
    ctx.font = "italic 11px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(o.mensajeCentral, padL + W / 2, padT + H / 2);
    ctx.textAlign = "start";
    return cv.toDataURL("image/png");
  }

  if (o.puntos.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sin lecturas en el periodo", padL + W / 2, padT + H / 2);
    ctx.textAlign = "start";
    return cv.toDataURL("image/png");
  }

  // Rangos
  const tMin = o.puntos[0].t;
  const tMax = o.puntos[o.puntos.length - 1].t;
  const tSpan = Math.max(1, tMax - tMin);
  const valores = o.puntos.map((p) => p.v);
  const refYs = o.refs.map((r) => r.y).filter((y) => Number.isFinite(y));
  let yMin = Math.min(...valores, ...refYs);
  let yMax = Math.max(...valores, ...refYs);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad; yMax += yPad;
  const ySpan = yMax - yMin;

  const x = (t: number) => padL + ((t - tMin) / tSpan) * W;
  const y = (v: number) => padT + H - ((v - yMin) / ySpan) * H;

  // Grid horizontal
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 0.5;
  ctx.font = "9px Helvetica, Arial, sans-serif";
  ctx.fillStyle = "#64748b";
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (ySpan * i) / 4;
    const yy = y(v);
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(padL + W, yy);
    ctx.stroke();
    ctx.fillText(v.toFixed(o.decimales), 4, yy + 3);
  }

  // Eje X
  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  for (let i = 0; i <= 4; i++) {
    const tt = tMin + (tSpan * i) / 4;
    const xx = x(tt);
    ctx.fillText(fmt(tt), xx - 12, padT + H + 14);
  }

  // Líneas de referencia
  ctx.font = "9px Helvetica, Arial, sans-serif";
  for (const r of o.refs) {
    if (!Number.isFinite(r.y)) continue;
    ctx.strokeStyle = r.color;
    ctx.fillStyle = r.color;
    ctx.setLineDash(r.dash ?? []);
    ctx.lineWidth = 1;
    const yy = y(r.y);
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(padL + W, yy);
    ctx.stroke();
    const label = `${r.label} ${r.y.toFixed(o.decimales)}`;
    const dy = r.labelPos === "bottom" ? 10 : -3;
    ctx.fillText(label, padL + W + 2, yy + dy);
  }
  ctx.setLineDash([]);

  // Línea de datos
  ctx.strokeStyle = "#1e40af";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  o.puntos.forEach((p, i) => {
    const xx = x(p.t), yy = y(p.v);
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  });
  ctx.stroke();

  // Puntos
  for (const p of o.puntos) {
    ctx.beginPath();
    ctx.fillStyle = p.outOfSpec ? "#dc2626" : "#1e40af";
    ctx.arc(x(p.t), y(p.v), p.outOfSpec ? 2.5 : 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return cv.toDataURL("image/png");
}

export type ChartImagen = {
  registroId: string;
  registroNombre: string;
  serie: string;
  dataUrl: string;
  width: number;
  height: number;
};

type SerieInfo = {
  serie: string;
  campo: "lecturas" | "lecturas_hr";
  unidad: string;
  lse: number | null;
  lie: number | null;
  decimales: number;
};

function unidadDeRegistro(registro: Registro, semanas: Semana[]): string {
  const s = semanas.find((w) => (w.unidad ?? "").trim().length > 0);
  return s?.unidad ?? "";
}

/** Decimales de despliegue por tipo de variable. */
function decimalesDe(registro: Registro, unidad: string): number {
  if (registro.modulo === "temphr") return 2;
  if (registro.modulo === "presiones") {
    const u = (unidad || "").toLowerCase().replace(/\s+/g, "");
    if (u.includes("inh2o") || u.includes("in.h2o") || u.includes('"h2o')) return 3;
    return 2;
  }
  return 2;
}

function seriesInfoDeRegistro(registro: Registro, semanas: Semana[]): SerieInfo[] {
  if (registro.modulo === "temphr") {
    return [
      {
        serie: "Temperatura (°C)", campo: "lecturas", unidad: "°C",
        lse: registro.lse_t ?? null, lie: registro.lie_t ?? null,
        decimales: 2,
      },
      {
        serie: "Humedad (%HR)", campo: "lecturas_hr", unidad: "%HR",
        lse: registro.lse_hr ?? null, lie: registro.lie_hr ?? null,
        decimales: 2,
      },
    ];
  }
  const unidad = unidadDeRegistro(registro, semanas);
  const etiqueta =
    registro.modulo === "presiones"
      ? `Presión (${unidad || "—"})`
      : unidad
        ? `Valor (${unidad})`
        : "Valor";
  return [
    {
      serie: etiqueta,
      campo: "lecturas",
      unidad,
      lse: registro.lse ?? null,
      lie: registro.lie ?? null,
      decimales: decimalesDe(registro, unidad),
    },
  ];
}

export type BloqueSerie = {
  serie: string;
  unidad: string;
  decimales: number;
  lie: number | null;
  lse: number | null;
  n: number;
  media: number | null;
  sigma: number | null;
  lc: number | null;
  las: number | null;
  lai: number | null;
  lacs: number | null;
  laci: number | null;
  values: number[];
  statsSuficientes: boolean;
  chartSpecUrl: string;
  chartAlertUrl: string;
  width: number;
  height: number;
};

/**
 * Devuelve, por serie del registro, las dos gráficas y los parámetros
 * estadísticos listos para pintar tabla y conclusión en el PDF.
 */
export function generarBloqueEstadisticoRegistro(
  registro: Registro,
  semanas: Semana[],
  width = 520,
  height = 180,
): BloqueSerie[] {
  const infos = seriesInfoDeRegistro(registro);
  const out: BloqueSerie[] = [];
  for (const info of infos) {
    const puntos = puntosDeSemanas(semanas, info.campo, info.lse, info.lie);
    const values = puntos.map((p) => p.v);
    const stats = descriptive(values);
    const media = stats?.mean ?? null;
    const sigma = stats?.stdev ?? null;
    const statsSuf =
      values.length >= 2 && sigma != null && Number.isFinite(sigma) && sigma > 0 && media != null;

    const las = statsSuf ? (media as number) + 2 * (sigma as number) : null;
    const lai = statsSuf ? (media as number) - 2 * (sigma as number) : null;
    const lacs = statsSuf ? (media as number) + 3 * (sigma as number) : null;
    const laci = statsSuf ? (media as number) - 3 * (sigma as number) : null;

    const dec = info.decimales;
    const subSpec = statsSuf
      ? `LIE ${info.lie ?? "—"} · LSE ${info.lse ?? "—"} · LC ${(media as number).toFixed(dec)} · LCS ${(lacs as number).toFixed(dec)} · LCI ${(laci as number).toFixed(dec)}`
      : `LIE ${info.lie ?? "—"} · LSE ${info.lse ?? "—"}`;

    const refsSpec: LineaRef[] = [];
    if (info.lse != null) refsSpec.push({ y: info.lse, label: "LSE", color: "#dc2626", dash: [4, 3] });
    if (info.lie != null) refsSpec.push({ y: info.lie, label: "LIE", color: "#dc2626", dash: [4, 3], labelPos: "bottom" });
    if (statsSuf) {
      refsSpec.push({ y: media as number, label: "LC", color: "#0f766e" });
      refsSpec.push({ y: lacs as number, label: "LCS", color: "#f97316", dash: [2, 2] });
      refsSpec.push({ y: laci as number, label: "LCI", color: "#f97316", dash: [2, 2], labelPos: "bottom" });
    }

    const chartSpecUrl = dibujarChartGenerico({
      width, height,
      titulo: `${registro.nombre} — Especificación + Control Estadístico · ${info.serie}`,
      subtitulo: subSpec,
      puntos,
      refs: refsSpec,
      decimales: dec,
    });

    let chartAlertUrl: string;
    if (!statsSuf) {
      chartAlertUrl = dibujarChartGenerico({
        width, height,
        titulo: `${registro.nombre} — Límites de Alerta y Acción · ${info.serie}`,
        subtitulo: "",
        puntos: [],
        refs: [],
        decimales: dec,
        mensajeCentral: "n insuficiente para control estadístico",
      });
    } else {
      const puntosAlerta = puntos.map((p) => ({ ...p, outOfSpec: false }));
      const refsAlert: LineaRef[] = [
        { y: media as number, label: "LC", color: "#0f766e" },
        { y: las as number, label: "LAS", color: "#f59e0b", dash: [5, 3] },
        { y: lai as number, label: "LAI", color: "#f59e0b", dash: [5, 3], labelPos: "bottom" },
        { y: lacs as number, label: "LACS", color: "#dc2626", dash: [2, 2] },
        { y: laci as number, label: "LACI", color: "#dc2626", dash: [2, 2], labelPos: "bottom" },
      ];
      chartAlertUrl = dibujarChartGenerico({
        width, height,
        titulo: `${registro.nombre} — Límites de Alerta y Acción · ${info.serie}`,
        subtitulo: `LC ${(media as number).toFixed(dec)} · ±2σ (alerta) · ±3σ (acción)`,
        puntos: puntosAlerta,
        refs: refsAlert,
        decimales: dec,
      });
    }

    out.push({
      serie: info.serie,
      unidad: info.unidad,
      decimales: dec,
      lie: info.lie,
      lse: info.lse,
      n: values.length,
      media, sigma,
      lc: media,
      las, lai, lacs, laci,
      values,
      statsSuficientes: statsSuf,
      chartSpecUrl,
      chartAlertUrl,
      width, height,
    });
  }
  return out;
}

/**
 * Compat: devuelve solo la gráfica 1 (Especificación + Control Estadístico) por
 * serie. Firma preservada para consumidores existentes (`export-utils.ts`, UI).
 */
export function generarChartsRegistro(
  registro: Registro,
  semanas: Semana[],
  width = 520,
  height = 180,
): ChartImagen[] {
  const bloque = generarBloqueEstadisticoRegistro(registro, semanas, width, height);
  return bloque.map((b) => ({
    registroId: registro.id,
    registroNombre: registro.nombre,
    serie: b.serie,
    dataUrl: b.chartSpecUrl,
    width, height,
  }));
}
