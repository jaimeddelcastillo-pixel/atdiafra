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

/** Mínimo de lecturas consolidadas para que Cp/Cpk sea estadísticamente confiable. */
export const N_MINIMO_CPK = 30;

export type EstadisticaSerie = {
  serie: "Temperatura" | "Humedad" | "Valor";
  unidad: string;
  lse: number | null;
  lie: number | null;
  n: number;
  media: number | null;
  sd: number | null;
  sdMuestral: number | null;
  min: number | null;
  max: number | null;
  p5: number | null;
  p95: number | null;
  cp: number | null;
  cpk: number | null;
  ppk: number | null;
  /** true si n < N_MINIMO_CPK: Cp/Cpk no son confiables y deben mostrarse como "n insuficiente". */
  cpkInsuficiente: boolean;
  pctDentroSpec: number | null;
  fueraSpec: { altos: number; bajos: number; total: number };
};

export type DesgloseMensual = {
  anio: number;
  mes: number; // 1-12
  etiqueta: string;
  totalLecturas: number;
  series: EstadisticaSerie[];
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
  porcentajeMinimo: number;
  series: EstadisticaSerie[];
  desgloseMensual: DesgloseMensual[];
};

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function construirSerie(
  nombre: "Temperatura" | "Humedad" | "Valor",
  unidad: string,
  values: number[],
  lse: number | null | undefined,
  lie: number | null | undefined,
): EstadisticaSerie {
  const s = statsBasicas(values);
  const insuf = s.n < N_MINIMO_CPK;
  // Si n < 30, Cp/Cpk no son confiables → no se reportan (null)
  const cap = insuf
    ? { cp: null, cpk: null, ppk: null }
    : indicesCapacidad(s.media, s.sdMuestral, lse, lie);
  return {
    serie: nombre,
    unidad,
    lse: lse ?? null,
    lie: lie ?? null,
    ...s,
    cp: cap.cp,
    cpk: cap.cpk,
    ppk: cap.ppk,
    cpkInsuficiente: insuf,
    pctDentroSpec: porcentajeDentroSpec(values, lse, lie),
    fueraSpec: fueraDeSpec(values, lse, lie),
  };
}

function seriesDeRegistro(registro: Registro, semanas: Semana[]): { series: EstadisticaSerie[]; total: number } {
  const esTHR = registro.modulo === "temphr";
  const valoresT: number[] = [];
  const valoresHR: number[] = [];
  for (const s of semanas) {
    valoresT.push(...lecturasValidas(s.lecturas));
    if (esTHR) valoresHR.push(...lecturasValidas(s.lecturas_hr));
  }
  const series: EstadisticaSerie[] = [];
  if (esTHR) {
    series.push(construirSerie("Temperatura", "°C", valoresT, registro.lse_t, registro.lie_t));
    series.push(construirSerie("Humedad", "%HR", valoresHR, registro.lse_hr, registro.lie_hr));
  } else {
    series.push(construirSerie("Valor", "", valoresT, registro.lse, registro.lie));
  }
  return { series, total: valoresT.length + valoresHR.length };
}

export function analizarRegistro(registro: Registro, periodo: Periodo, hoy = new Date()): AnalisisRegistro {
  const rango = rangoPeriodo(periodo);
  const semanas = semanasDelPeriodo(registro, periodo);
  const { series, total: totalLecturas } = seriesDeRegistro(registro, semanas);

  const grupos = new Map<string, Semana[]>();
  for (const s of semanas) {
    const k = s.semana_inicio.slice(0, 7);
    const arr = grupos.get(k);
    if (arr) arr.push(s);
    else grupos.set(k, [s]);
  }
  const desgloseMensual: DesgloseMensual[] = Array.from(grupos.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, sems]) => {
      const [anio, mes] = k.split("-").map(Number);
      const r = seriesDeRegistro(registro, sems);
      return { anio, mes, etiqueta: `${MESES_CORTOS[mes - 1]} ${anio}`, totalLecturas: r.total, series: r.series };
    });

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
    desgloseMensual,
  };
}

// ============================================================================
// Modelo tri-dimensional de evaluación
// ============================================================================
// Separa tres dimensiones independientes para evitar mensajes alarmistas cuando
// el proceso sigue siendo NORMATIVAMENTE conforme:
//   1. Cumplimiento normativo  → ¿hay incumplimiento real? (LIE/LSE, mínimo de lecturas)
//   2. Control estadístico      → ¿el proceso sigue estable? (Western Electric)
//   3. Capacidad de proceso     → ¿la variabilidad es aceptable? (Cp/Cpk/Ppk)
//
// Cuarta dimensión FUTURA (no implementada en esta fase, documentada aquí para
// alineación con PMS y Gestión de Riesgos):
//   4. Riesgo emergente          → tendencia, deterioro entre periodos, señales
//                                  débiles anticipatorias. Requiere comparación
//                                  con línea base histórica y clasificación por
//                                  criticidad del área. Ver TODO al final.
// ============================================================================

export const CPK_WARN = 1.33;
export const CPK_FAIL = 1.0;
/** @deprecated El % dentro de spec ya no es fuente autónoma de NC. Se conserva
 *  únicamente como indicador informativo. La NC se dispara por `fueraSpec.total > 0`. */
export const PCT_SPEC_FAIL = 95;

export type Severidad = "alta" | "media" | "baja";
export type CumplimientoNormativo = "cumple" | "no_cumple";
export type EstadoControl = "bajo_control" | "en_observacion" | "control_comprometido";
export type Capacidad = "capaz" | "marginal" | "no_capaz" | "n_insuficiente";
export type CategoriaHallazgo = "no_conformidad" | "alerta_estadistica" | "observacion";
export type DimensionHallazgo = "cumplimiento" | "control" | "capacidad";

export type Hallazgo = {
  registroNombre: string;
  registroId: string;
  serie: string;
  dimension: DimensionHallazgo;
  categoria: CategoriaHallazgo;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  accionSugerida: string;
};

export type EvaluacionRegistro = {
  analisis: AnalisisRegistro;
  cumplimiento: CumplimientoNormativo;
  control: EstadoControl;
  capacidad: Capacidad;
  hallazgos: Hallazgo[];
  /** Etiqueta corta de estado global, no alarmista. */
  estadoGlobal: "conforme" | "conforme_con_alertas" | "no_conforme";
  conclusion: string;
};

// Etiquetas legibles ------------------------------------------------------------
export const ETIQUETA_CONTROL: Record<EstadoControl, string> = {
  bajo_control: "Bajo control",
  en_observacion: "En observación",
  control_comprometido: "Control comprometido",
};
export const ETIQUETA_CAPACIDAD: Record<Capacidad, string> = {
  capaz: "Capaz",
  marginal: "Capacidad marginal",
  no_capaz: "Capacidad baja",
  n_insuficiente: "n insuficiente",
};
export const ETIQUETA_CUMPLIMIENTO: Record<CumplimientoNormativo, string> = {
  cumple: "Cumple normativo",
  no_cumple: "No conforme",
};
export const ETIQUETA_CATEGORIA: Record<CategoriaHallazgo, string> = {
  no_conformidad: "No conformidad",
  alerta_estadistica: "Alerta estadística",
  observacion: "Observación",
};

function clasificarCapacidadSerie(s: EstadisticaSerie): Capacidad {
  if (s.cpkInsuficiente) return "n_insuficiente";
  if (s.cpk == null) return "n_insuficiente";
  if (s.cpk < CPK_FAIL) return "no_capaz";
  if (s.cpk < CPK_WARN) return "marginal";
  return "capaz";
}

/** Peor capacidad entre todas las series (peor = más grave). */
function peorCapacidad(caps: Capacidad[]): Capacidad {
  const orden: Capacidad[] = ["no_capaz", "marginal", "n_insuficiente", "capaz"];
  for (const c of orden) if (caps.includes(c)) return c;
  return "capaz";
}

/**
 * Evalúa un registro en las 3 dimensiones actuales. NO ejecuta Western Electric
 * aquí (se hace en el renderer con los puntos ordenados en el tiempo); esta
 * función parte del análisis consolidado y de banderas ya calculadas. Si
 * `weHits` se proporciona, refina el estado de control.
 */
export function evaluarRegistro(
  analisis: AnalisisRegistro,
  opts: { weHits?: number; periodoCerrado?: boolean } = {},
): EvaluacionRegistro {
  const hallazgos: Hallazgo[] = [];
  const nombreReg = analisis.registro.nombre;
  const idReg = analisis.registro.id;

  // ---- Dimensión 1: Cumplimiento normativo -----------------------------------
  let cumplimiento: CumplimientoNormativo = "cumple";

  if (!analisis.cumpleMinimo) {
    const periodoCerrado = opts.periodoCerrado ?? true;
    if (periodoCerrado) {
      cumplimiento = "no_cumple";
      hallazgos.push({
        registroNombre: nombreReg, registroId: idReg, serie: "—",
        dimension: "cumplimiento", categoria: "no_conformidad", severidad: "alta",
        titulo: "Sin mínimo normativo",
        detalle: `${analisis.totalLecturas}/${MINIMO_NORMATIVO} lecturas (${analisis.porcentajeMinimo}%)`,
        accionSugerida: "Documentar causa de la falta de lecturas y ajustar plan de muestreo.",
      });
    } else {
      hallazgos.push({
        registroNombre: nombreReg, registroId: idReg, serie: "—",
        dimension: "cumplimiento", categoria: "observacion", severidad: "baja",
        titulo: "Avance parcial vs mínimo normativo",
        detalle: `${analisis.totalLecturas}/${MINIMO_NORMATIVO} lecturas (${analisis.porcentajeMinimo}%) — periodo en curso`,
        accionSugerida: "Mantener el ritmo de captura para alcanzar el mínimo al cierre del periodo.",
      });
    }
  }

  for (const s of analisis.series) {
    if (s.fueraSpec.total > 0) {
      cumplimiento = "no_cumple";
      hallazgos.push({
        registroNombre: nombreReg, registroId: idReg,
        serie: `${s.serie} ${s.unidad}`.trim(),
        dimension: "cumplimiento", categoria: "no_conformidad", severidad: "alta",
        titulo: "Lecturas fuera de especificación",
        detalle: `${s.fueraSpec.total} fuera (${s.fueraSpec.altos}↑ ${s.fueraSpec.bajos}↓) · LIE ${s.lie ?? "—"} / LSE ${s.lse ?? "—"}`,
        accionSugerida: "Evaluar la desviación, identificar causa raíz y registrar acción correctiva.",
      });
    }
    // Nota: el % dentro de spec ya NO genera NC de forma autónoma. Se emite
    // sólo como observación informativa cuando el proceso permanece conforme
    // (todas las lecturas dentro de LIE/LSE) pero está cerca del margen.
  }

  // ---- Dimensión 2: Control estadístico --------------------------------------
  // Se toma el conteo de Western Electric del renderer si está disponible.
  // Sin WE hits, el estado depende sólo del cumplimiento: si hay OOS, "control
  // comprometido"; si no, "bajo control".
  const hayOOS = analisis.series.some((s) => s.fueraSpec.total > 0);
  const hits = opts.weHits ?? 0;
  let control: EstadoControl;
  if (hayOOS) {
    // Fuera de spec => el control estadístico está comprometido, pero
    // evitamos el término alarmista "fuera de control" cuando la NC es
    // por especificación (la lectura simplemente violó LIE/LSE).
    control = "control_comprometido";
  } else if (hits > 0) {
    control = "en_observacion";
    hallazgos.push({
      registroNombre: nombreReg, registroId: idReg, serie: "—",
      dimension: "control", categoria: "alerta_estadistica", severidad: "media",
      titulo: "Reglas Western Electric activadas",
      detalle: `${hits} señal(es) estadística(s). El proceso sigue dentro de especificación (LIE/LSE).`,
      accionSugerida: "Seguimiento reforzado; no requiere acción correctiva mientras no haya incumplimiento normativo.",
    });
  } else {
    control = "bajo_control";
  }

  // ---- Dimensión 3: Capacidad de proceso -------------------------------------
  const caps = analisis.series.map(clasificarCapacidadSerie);
  const capacidad = peorCapacidad(caps);

  for (const s of analisis.series) {
    const cap = clasificarCapacidadSerie(s);
    if (cap === "no_capaz") {
      hallazgos.push({
        registroNombre: nombreReg, registroId: idReg,
        serie: `${s.serie} ${s.unidad}`.trim(),
        dimension: "capacidad", categoria: "alerta_estadistica", severidad: "media",
        titulo: "Capacidad baja",
        detalle: `Cpk ${s.cpk?.toFixed(2)} (< ${CPK_FAIL.toFixed(2)}) — variabilidad alta frente a los límites`,
        accionSugerida: "Evaluar necesidad de investigación; monitorear tendencia. No es NC si no hay lecturas fuera de spec.",
      });
    } else if (cap === "marginal") {
      hallazgos.push({
        registroNombre: nombreReg, registroId: idReg,
        serie: `${s.serie} ${s.unidad}`.trim(),
        dimension: "capacidad", categoria: "alerta_estadistica", severidad: "baja",
        titulo: "Capacidad marginal",
        detalle: `Cpk ${s.cpk?.toFixed(2)} (${CPK_FAIL.toFixed(2)}–${CPK_WARN.toFixed(2)}) — margen de seguridad reducido`,
        accionSugerida: "Seguimiento; mantener el proceso monitoreado sin acción correctiva inmediata.",
      });
    }
  }

  // ---- % dentro de spec como observación (nunca NC) --------------------------
  for (const s of analisis.series) {
    if (
      s.fueraSpec.total === 0 &&
      s.pctDentroSpec != null &&
      s.pctDentroSpec < 100 // conceptualmente imposible si fueraSpec=0; blindaje
    ) continue;
  }

  // ---- Estado global y conclusión --------------------------------------------
  const hayNC = hallazgos.some((h) => h.categoria === "no_conformidad");
  const hayAlerta = hallazgos.some((h) => h.categoria === "alerta_estadistica");
  const estadoGlobal: EvaluacionRegistro["estadoGlobal"] =
    hayNC ? "no_conforme" : hayAlerta ? "conforme_con_alertas" : "conforme";

  const conclusion = construirConclusion({ cumplimiento, control, capacidad, estadoGlobal });

  return { analisis, cumplimiento, control, capacidad, hallazgos, estadoGlobal, conclusion };
}

function construirConclusion(v: {
  cumplimiento: CumplimientoNormativo;
  control: EstadoControl;
  capacidad: Capacidad;
  estadoGlobal: EvaluacionRegistro["estadoGlobal"];
}): string {
  if (v.cumplimiento === "no_cumple") {
    return "No conformidad detectada. Evaluar desviación, identificar causa raíz y documentar acción correctiva conforme a NOM-241.";
  }
  // A partir de aquí el proceso ES conforme.
  const capTxt =
    v.capacidad === "capaz" ? "capacidad adecuada" :
    v.capacidad === "marginal" ? "capacidad marginal" :
    v.capacidad === "no_capaz" ? "capacidad baja" :
    "capacidad no evaluable (n insuficiente)";
  if (v.control === "en_observacion") {
    return `Proceso conforme con ${capTxt}; señales estadísticas presentes — se recomienda seguimiento reforzado sin acción correctiva.`;
  }
  if (v.capacidad === "no_capaz") {
    return `Proceso conforme pero con ${capTxt}; se sugiere evaluar oportunidad de mejora (no constituye no conformidad).`;
  }
  if (v.capacidad === "marginal") {
    return `Proceso conforme con ${capTxt}; mantener monitoreo del margen de seguridad.`;
  }
  if (v.capacidad === "n_insuficiente") {
    return `Proceso conforme; n insuficiente para evaluar capacidad estadística (mínimo ${N_MINIMO_CPK}).`;
  }
  return "Proceso conforme, bajo control estadístico y con capacidad adecuada.";
}

export function conclusionRegistro(evaluacion: EvaluacionRegistro): string {
  return evaluacion.conclusion;
}

export function evaluarLote(
  analisis: AnalisisRegistro[],
  opts: { periodoCerrado?: boolean } = {},
): { evaluaciones: EvaluacionRegistro[]; resumen: ResumenLote } {
  const evaluaciones = analisis.map((a) => evaluarRegistro(a, opts));
  const resumen: ResumenLote = {
    total: evaluaciones.length,
    conformes: evaluaciones.filter((e) => e.estadoGlobal === "conforme").length,
    conformesConAlerta: evaluaciones.filter((e) => e.estadoGlobal === "conforme_con_alertas").length,
    noConformes: evaluaciones.filter((e) => e.estadoGlobal === "no_conforme").length,
    noConformidades: evaluaciones.flatMap((e) => e.hallazgos.filter((h) => h.categoria === "no_conformidad")),
    alertas: evaluaciones.flatMap((e) => e.hallazgos.filter((h) => h.categoria === "alerta_estadistica")),
    observaciones: evaluaciones.flatMap((e) => e.hallazgos.filter((h) => h.categoria === "observacion")),
  };
  return { evaluaciones, resumen };
}

export type ResumenLote = {
  total: number;
  conformes: number;
  conformesConAlerta: number;
  noConformes: number;
  noConformidades: Hallazgo[];
  alertas: Hallazgo[];
  observaciones: Hallazgo[];
};

// ============================================================================
// Legacy: NoConformidad + detectarNoConformidades
// ----------------------------------------------------------------------------
// Se conserva como *wrapper* para no romper consumidores externos. Ahora sólo
// emite NC reales (fuera de spec y sin mínimo normativo). Los antiguos tipos
// `cpk_bajo` y `pct_bajo` YA NO se generan como NC:
//   · `cpk_bajo`  → migró a "Alerta estadística" (dimensión Capacidad)
//   · `pct_bajo`  → eliminado como fuente autónoma de NC (redundante con
//                   `fueraSpec.total > 0`); se conserva como indicador.
// ============================================================================

export type NoConformidad = {
  registroNombre: string;
  registroId: string;
  serie: string;
  tipo: "fuera_spec" | "cpk_bajo" | "pct_bajo" | "sin_minimo";
  severidad: Severidad;
  detalle: string;
};

export function detectarNoConformidades(analisis: AnalisisRegistro[]): NoConformidad[] {
  const { resumen } = evaluarLote(analisis);
  return resumen.noConformidades.map((h) => ({
    registroNombre: h.registroNombre,
    registroId: h.registroId,
    serie: h.serie,
    tipo: h.titulo.toLowerCase().includes("mínimo") ? "sin_minimo" : "fuera_spec",
    severidad: h.severidad === "baja" ? "media" : (h.severidad as "alta" | "media"),
    detalle: h.detalle,
  }));
}

// ============================================================================
// TODO — Riesgo Emergente (dimensión 4, fase posterior)
// ----------------------------------------------------------------------------
// Objetivo: alimentar el Product Monitoring System y la Gestión de Riesgos con
// señales anticipatorias que NO son incumplimiento pero sugieren deterioro:
//   · Comparación de Cpk/media/σ vs periodo previo (deterioro > umbral).
//   · Reglas Nelson (rules 5–8, extensión de Western Electric).
//   · Tendencia sostenida hacia LIE/LSE aún dentro de spec.
//   · Ponderación por criticidad del área (Grado A/B/C/D) y por ISO clase.
// Salida esperada: `Hallazgo` con `dimension: "riesgo_emergente"` y
// `categoria: "observacion"`, sin bloquear la conformidad actual.
// ============================================================================


// ===== Agrupación =====
export type AgruparPor = "registro" | "area" | "hvac" | "modulo";

/** Un registro que representa un instrumento independiente (manómetro/HEPA sin par de cuartos ni área). */
export function esRegistroDeInstrumento(r: Registro): boolean {
  return !r.area_id && !r.codigo_area_libre && !r.par_cuartos_id && !!r.instrumento_id;
}

const GRUPO_INSTRUMENTOS = "__instrumentos_independientes__";

export function claveGrupo(r: Registro, modo: AgruparPor): string {
  switch (modo) {
    case "area":
      if (r.area_id) return r.area_id;
      if (r.par_cuartos_id) return `par:${r.par_cuartos_id}`;
      if (esRegistroDeInstrumento(r)) return GRUPO_INSTRUMENTOS;
      return r.codigo_area_libre ?? "Sin área";
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
      if (r.area_id) return catalogos.areas.get(r.area_id) ?? "Área desconocida";
      if (r.par_cuartos_id) return r.nombre; // "Área A vs Área B"
      if (esRegistroDeInstrumento(r)) return "Instrumentos independientes";
      return r.nombre_area_libre ?? r.codigo_area_libre ?? "Sin área";
    case "hvac":
      return r.hvac_id ? catalogos.hvac.get(r.hvac_id) ?? "HVAC desconocido" : "Sin HVAC";
    case "modulo":
      return r.modulo;
    default:
      return r.nombre;
  }
}

/** Tipo de registro para diferenciar tablas en el reporte. */
export type TipoRegistroReporte = "area" | "par_cuartos" | "instrumento";

export function tipoRegistroReporte(r: Registro): TipoRegistroReporte {
  if (r.par_cuartos_id) return "par_cuartos";
  if (esRegistroDeInstrumento(r)) return "instrumento";
  return "area";
}

export function etiquetaTipoRegistro(t: TipoRegistroReporte): string {
  return t === "area" ? "Área" : t === "par_cuartos" ? "Par de cuartos" : "Instrumento";
}

/** Determina el título del reporte según el módulo dominante en el análisis. */
export function tituloReporteDeModulos(modulos: Array<Registro["modulo"]>): string {
  const set = new Set(modulos);
  if (set.size !== 1) return "REPORTE NORMATIVO DE MONITOREO AMBIENTAL";
  const m = set.values().next().value;
  switch (m) {
    case "presiones": return "REPORTE NORMATIVO DE PRESIONES DIFERENCIALES";
    case "temphr": return "REPORTE NORMATIVO DE TEMPERATURA Y HUMEDAD RELATIVA";
    case "filtros": return "REPORTE NORMATIVO DE FILTROS";
    case "agua": return "REPORTE NORMATIVO DE AGUA PURIFICADA";
    default: return "REPORTE NORMATIVO DE MONITOREO AMBIENTAL";
  }
}

