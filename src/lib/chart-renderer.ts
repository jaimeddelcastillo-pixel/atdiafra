// Generador de gráficas de tendencia (canvas nativo) para embeber en jsPDF.
import type { Registro, Semana, PuntoLectura, Dia, Turno } from "./semanas";

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

type ChartOpts = {
  width: number;
  height: number;
  titulo: string;
  subtitulo?: string;
  unidad: string;
  lse: number | null;
  lie: number | null;
  puntos: Punto[];
};

function dibujarChart(o: ChartOpts): string {
  const cv = document.createElement("canvas");
  // Alta resolución para PDF nítido
  const scale = 2;
  cv.width = o.width * scale;
  cv.height = o.height * scale;
  const ctx = cv.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, o.width, o.height);

  const padL = 50, padR = 16, padT = 36, padB = 28;
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

  if (o.puntos.length === 0) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px Helvetica, Arial, sans-serif";
    ctx.fillText("Sin lecturas en el periodo", padL, padT + H / 2);
    return cv.toDataURL("image/png");
  }

  // Rangos
  const tMin = o.puntos[0].t;
  const tMax = o.puntos[o.puntos.length - 1].t;
  const tSpan = Math.max(1, tMax - tMin);
  const valores = o.puntos.map((p) => p.v);
  let yMin = Math.min(...valores, ...(o.lie != null ? [o.lie] : []));
  let yMax = Math.max(...valores, ...(o.lse != null ? [o.lse] : []));
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
    ctx.fillText(v.toFixed(1), 4, yy + 3);
  }

  // Eje X (fechas)
  const fmt = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  ctx.fillStyle = "#64748b";
  for (let i = 0; i <= 4; i++) {
    const tt = tMin + (tSpan * i) / 4;
    const xx = x(tt);
    ctx.fillText(fmt(tt), xx - 12, padT + H + 14);
  }

  // LSE / LIE bandas
  if (o.lse != null) {
    ctx.strokeStyle = "#dc2626";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y(o.lse)); ctx.lineTo(padL + W, y(o.lse)); ctx.stroke();
    ctx.fillStyle = "#dc2626";
    ctx.fillText(`LSE ${o.lse}`, padL + W - 50, y(o.lse) - 3);
  }
  if (o.lie != null) {
    ctx.strokeStyle = "#dc2626";
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(padL, y(o.lie)); ctx.lineTo(padL + W, y(o.lie)); ctx.stroke();
    ctx.fillStyle = "#dc2626";
    ctx.fillText(`LIE ${o.lie}`, padL + W - 50, y(o.lie) + 10);
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

  // Puntos (rojo si fuera spec)
  for (const p of o.puntos) {
    ctx.beginPath();
    ctx.fillStyle = p.outOfSpec ? "#dc2626" : "#1e40af";
    ctx.arc(x(p.t), y(p.v), p.outOfSpec ? 2.5 : 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Marco
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 0.5;
  ctx.strokeRect(padL, padT, W, H);

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

/** Genera una imagen por cada serie (Temp/HR para temphr, Valor para los demás) en el rango del periodo. */
export function generarChartsRegistro(
  registro: Registro,
  semanas: Semana[],
  width = 520,
  height = 180,
): ChartImagen[] {
  const out: ChartImagen[] = [];
  if (registro.modulo === "temphr") {
    out.push({
      registroId: registro.id,
      registroNombre: registro.nombre,
      serie: "Temperatura (°C)",
      dataUrl: dibujarChart({
        width, height,
        titulo: `${registro.nombre} — Temperatura`,
        subtitulo: `LIE ${registro.lie_t ?? "—"} · LSE ${registro.lse_t ?? "—"}`,
        unidad: "°C",
        lse: registro.lse_t ?? null,
        lie: registro.lie_t ?? null,
        puntos: puntosDeSemanas(semanas, "lecturas", registro.lse_t ?? null, registro.lie_t ?? null),
      }),
      width, height,
    });
    out.push({
      registroId: registro.id,
      registroNombre: registro.nombre,
      serie: "Humedad (%HR)",
      dataUrl: dibujarChart({
        width, height,
        titulo: `${registro.nombre} — Humedad`,
        subtitulo: `LIE ${registro.lie_hr ?? "—"} · LSE ${registro.lse_hr ?? "—"}`,
        unidad: "%HR",
        lse: registro.lse_hr ?? null,
        lie: registro.lie_hr ?? null,
        puntos: puntosDeSemanas(semanas, "lecturas_hr", registro.lse_hr ?? null, registro.lie_hr ?? null),
      }),
      width, height,
    });
  } else {
    out.push({
      registroId: registro.id,
      registroNombre: registro.nombre,
      serie: "Valor",
      dataUrl: dibujarChart({
        width, height,
        titulo: registro.nombre,
        subtitulo: `LIE ${registro.lie ?? "—"} · LSE ${registro.lse ?? "—"} · ${registro.modulo}`,
        unidad: "",
        lse: registro.lse ?? null,
        lie: registro.lie ?? null,
        puntos: puntosDeSemanas(semanas, "lecturas", registro.lse ?? null, registro.lie ?? null),
      }),
      width, height,
    });
  }
  return out;
}
