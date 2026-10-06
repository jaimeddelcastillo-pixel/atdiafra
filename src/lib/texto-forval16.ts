// Texto propuesto del FOR-VAL-16-02 generado a partir de los bloques del motor PNO-VAL-16.
import type { Bloque } from "./export-forval16";
import { fmtDMY } from "./export-forval16";
import { etiquetaCapacidad } from "./estadistica-pno";

export interface TextoForVal16 { alcance: string; s81: string; s9: string; s10: string; s11: string }

/** Cómo se acota el análisis: por sistema HVAC o por una selección libre de instrumentos. */
export type AlcanceTexto =
  | { tipo: "hvac"; codigo: string; nombreUma: string; descripcion: string }
  | { tipo: "instrumentos"; codigos: string[] };

export const SECCIONES: { k: keyof TextoForVal16; titulo: string }[] = [
  { k: "alcance", titulo: "2. Alcance" },
  { k: "s81", titulo: "8.1 Registros analizados" },
  { k: "s9", titulo: "9. Análisis de resultados" },
  { k: "s10", titulo: "10. Desviaciones" },
  { k: "s11", titulo: "11. Conclusión y dictamen" },
];

const n2 = (v: number | null | undefined) => (v == null ? "N/D" : v.toFixed(2));

/** Une elementos en español: comas y «y» antes del último. 0 → cadena vacía. */
export function listaEs(items: string[]): string {
  const limpios = items.filter((x) => x && x.trim());
  if (limpios.length <= 1) return limpios.join("");
  return `${limpios.slice(0, -1).join(", ")} y ${limpios[limpios.length - 1]}`;
}

/**
 * Cantidad con concordancia de número: 1 → "una lectura"/"un punto"/"una señal";
 * >1 → "N lecturas"/"N puntos"/"N señales" (numeral).
 */
export function fraseCantidad(n: number, sing: string, plur: string): string {
  return n === 1 ? sing : `${n} ${plur}`;
}

/** Nombre de la variable en minúscula, con el símbolo de porcentaje en humedad. */
export function nombreVariable(variable: string): string {
  const v = variable.toLowerCase();
  if (v.includes("humedad")) return "% de humedad relativa";
  return v;
}

/** Ubicación tal como viene del catálogo, con «VS» normalizado a «vs». */
export function ubicacionTxt(ubicacion: string): string {
  return ubicacion.replace(/\bVS\b/g, "vs");
}

export function dictamenGlobal(bloques: Bloque[]): { cumplimiento: "CUMPLE" | "NO CUMPLE"; estado: string; requiere: boolean } {
  const ds = bloques.map((b) => b.dict).filter(Boolean);
  const cumplimiento = ds.some((d) => d!.cumplimientoEspecificacion === "NO CUMPLE") ? "NO CUMPLE" : "CUMPLE";
  const estado = ds.some((d) => d!.estadoControl === "FUERA DE CONTROL") ? "FUERA DE CONTROL"
    : ds.some((d) => d!.estadoControl === "BAJO CONTROL CON ALERTAS") ? "BAJO CONTROL CON ALERTAS" : "BAJO CONTROL";
  return { cumplimiento, estado, requiere: ds.some((d) => d!.requiereInvestigacion) };
}

function lecturasFuera(b: Bloque) {
  const out: { v: number; f: string }[] = [];
  for (const p of b.puntos) for (const v of p.lecturas)
    if ((b.lie != null && v < b.lie) || (b.lse != null && v > b.lse)) out.push({ v, f: p.fecha });
  return out;
}

const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/**
 * Si más del 60 % de los puntos con señal caen en un mismo mes y ese mes es el primero o el último
 * del periodo, devuelve la frase de posible influencia estacional (PNO-VAL-16 8.8). Si no, null.
 */
export function fraseEstacional(puntos: { fecha: string; reglas: string[] }[]): string | null {
  const conSenal = puntos.filter((p) => p.reglas.length);
  if (conSenal.length < 2 || !puntos.length) return null;
  const mes = (f: string) => f.slice(0, 7);
  const cuenta = new Map<string, number>();
  for (const p of conSenal) cuenta.set(mes(p.fecha), (cuenta.get(mes(p.fecha)) ?? 0) + 1);
  const [top, n] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n / conSenal.length <= 0.6) return null;
  const extremos = [mes(puntos[0].fecha), mes(puntos[puntos.length - 1].fecha)];
  if (!extremos.includes(top)) return null;
  return `Se observa un desplazamiento de la media en ${MESES_LARGOS[Number(top.slice(5, 7)) - 1]}; evaluar influencia estacional (PNO-VAL-16 8.8).`;
}

function parrafo(b: Bloque): string {
  const u = b.unidad;
  const ppkEt = etiquetaCapacidad(b.Ppk).toLowerCase();
  let t = `${b.codigo} (${ubicacionTxt(b.ubicacion)}), ${nombreVariable(b.variable)}: media ${n2(b.media)} ${u}, Ppk ${n2(b.Ppk)} (${ppkEt}).`;
  const fuera = lecturasFuera(b);
  const otras = b.puntos.reduce((a, p) => a + p.reglas.filter((r) => !r.startsWith("Regla 1")).length, 0);
  const r1 = b.puntos.filter((p) => p.reglas.some((r) => r.startsWith("Regla 1"))).length;
  const carta = b.tipo === "thr" ? "la carta X̄-MR" : "la gráfica de medias diarias";
  const partes: string[] = [];
  if (fuera.length) {
    const ej = fuera.slice(0, 3).map((x) => `${x.v.toFixed(1)} ${u}, ${fmtDMY(x.f)}`).join("; ");
    partes.push(`${fraseCantidad(fuera.length, "una lectura", "lecturas")} fuera de especificación (${ej}${fuera.length > 3 ? "; …" : ""})`);
  }
  if (r1) partes.push(`${fraseCantidad(r1, "un punto", "puntos")} fuera de los límites de control`);
  if (otras) partes.push(`${fraseCantidad(otras, "una señal", "señales")} de reglas 2–6 en ${carta}`);
  if (partes.length) {
    t += ` ${partes.length === 1 ? "Presenta" : "Presentan"} ${listaEs(partes)}; requiere investigación de causa raíz (PNO-VAL-16 9.4).`;
  } else {
    t += ` Todas las lecturas se encuentran dentro de especificación y no se detectaron señales de las reglas de Western Electric/Nelson en ${carta}.`;
  }
  const est = fraseEstacional(b.puntos);
  if (est) t += ` ${est}`;
  if (b.calidad.suficiencia.startsWith("Insuficiente")) t += ` El tamaño de muestra es insuficiente (n = ${b.calidad.nSuficiencia}) según PNO-VAL-16 Tabla 2.`;
  return t;
}

function alcanceTxt(a: AlcanceTexto): string {
  if (a.tipo === "hvac") return `aplica al sistema HVAC ${a.codigo} ${a.nombreUma} (${a.descripcion})`;
  return a.codigos.length ? `aplica a los instrumentos ${listaEs(a.codigos)}` : "aplica a los instrumentos seleccionados";
}

export function generarTexto(bloques: Bloque[], cobertura: { primera: string | null; ultima: string | null }, alcance: AlcanceTexto): TextoForVal16 {
  const vars = [...new Set(bloques.map((b) => nombreVariable(b.variable)))];
  const periodo = cobertura.primera && cobertura.ultima ? `del ${fmtDMY(cobertura.primera)} al ${fmtDMY(cobertura.ultima)}` : "sin datos en el periodo";
  const alcanceLinea = `El presente análisis de tendencias ${alcanceTxt(alcance)}, con los datos registrados ${periodo} (primera y última fecha con datos reales). Variables analizadas: ${listaEs(vars) || "ninguna"}.`;
  const s81 = bloques.map((b, i) => `${i + 1}. Monitoreo de ${nombreVariable(b.variable)} ${b.codigo} (${ubicacionTxt(b.ubicacion)}) con código ${b.bitacora}`).join("\n");
  const g = dictamenGlobal(bloques);
  const conInv = bloques.filter((b) => b.dict?.requiereInvestigacion);
  const global = !bloques.length ? "No se analizaron instrumentos en el periodo."
    : conInv.length
      ? `En conjunto, ${bloques.length - conInv.length} de ${bloques.length} series analizadas no presentan hallazgos; ${conInv.length === 1 ? "una requiere" : `${conInv.length} requieren`} investigación de causa raíz (PNO-VAL-16 9.4).`
      : `En conjunto, las ${bloques.length} series analizadas se mantienen dentro de especificación y bajo control estadístico.`;
  const s9 = [...bloques.map(parrafo), global].join("\n\n");
  const s10 = conInv.length
    ? `Se identificaron los siguientes casos que requieren investigación:\n${conInv.map((b, i) => `${i + 1}. ${b.codigo} – ${nombreVariable(b.variable)}: ${b.dict!.estadoControl} · ${b.dict!.cumplimientoEspecificacion}.`).join("\n")}\nRegistrar en FOR-VAL-03-06.`
    : "No se generaron desviaciones durante el periodo analizado.";
  const s11 = `Con base en el análisis estadístico conforme a PNO-VAL-16 y a los requisitos de la NOM-241-SSA1-2025, el resultado global del periodo es ${g.cumplimiento} con especificación, con estado de control ${g.estado}.${g.requiere ? " Los casos señalados en la sección 10 requieren investigación de causa raíz (PNO-VAL-16 9.4)." : ""}`;
  return { alcance: alcanceLinea, s81, s9, s10, s11 };
}
