// Texto propuesto del FOR-VAL-16-02 generado a partir de los bloques del motor PNO-VAL-16.
import type { Bloque } from "./export-forval16";
import { fmtDMY } from "./export-forval16";
import { etiquetaCapacidad } from "./estadistica-pno";

export interface TextoForVal16 { alcance: string; s81: string; s9: string; s10: string; s11: string }
export const SECCIONES: { k: keyof TextoForVal16; titulo: string }[] = [
  { k: "alcance", titulo: "2. Alcance" },
  { k: "s81", titulo: "8.1 Registros analizados" },
  { k: "s9", titulo: "9. Análisis de resultados" },
  { k: "s10", titulo: "10. Desviaciones" },
  { k: "s11", titulo: "11. Conclusión y dictamen" },
];

const n2 = (v: number | null | undefined) => (v == null ? "N/D" : v.toFixed(2));
const NUM = ["Ninguna", "Una", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez"];
const cuenta = (n: number, sing: string, plur: string) => `${n <= 10 ? NUM[n] : n} ${n === 1 ? sing : plur}`;
const varMin = (b: Bloque) => b.variable.toLowerCase();

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

function parrafo(b: Bloque): string {
  const u = b.unidad;
  const ppkEt = etiquetaCapacidad(b.Ppk).toLowerCase();
  let t = `${b.codigo} (${b.ubicacion}), ${varMin(b)}: media ${n2(b.media)} ${u}, Ppk ${n2(b.Ppk)} (${ppkEt}).`;
  const fuera = lecturasFuera(b);
  const otras = b.puntos.reduce((a, p) => a + p.reglas.filter((r) => !r.startsWith("Regla 1")).length, 0);
  const r1 = b.puntos.filter((p) => p.reglas.some((r) => r.startsWith("Regla 1"))).length;
  const carta = b.tipo === "thr" ? "la carta X̄-MR" : "la gráfica de medias diarias";
  const partes: string[] = [];
  if (fuera.length) {
    const ej = fuera.slice(0, 3).map((x) => `${x.v.toFixed(1)} ${u}, ${fmtDMY(x.f)}`).join("; ");
    partes.push(`${cuenta(fuera.length, "lectura", "lecturas")} fuera de especificación (${ej}${fuera.length > 3 ? "; …" : ""})`);
  }
  if (r1) partes.push(`${cuenta(r1, "punto", "puntos")} fuera de los límites de control`);
  if (otras) partes.push(`${otras} ${otras === 1 ? "señal" : "señales"} de reglas 2–6 en ${carta}`);
  if (partes.length) {
    const s = partes.join(r1 || fuera.length ? ", " : " y ");
    t += ` ${s.charAt(0).toUpperCase()}${s.slice(1)}; requiere investigación de causa raíz (PNO-VAL-16 9.4).`;
  } else {
    t += ` Todas las lecturas se encuentran dentro de especificación y no se detectaron señales de las reglas de Western Electric/Nelson en ${carta}.`;
  }
  if (b.calidad.suficiencia.startsWith("Insuficiente")) t += ` El tamaño de muestra es insuficiente (n = ${b.calidad.nSuficiencia}) según PNO-VAL-16 Tabla 2.`;
  return t;
}

export function generarTexto(bloques: Bloque[], cobertura: { primera: string | null; ultima: string | null }, sistema: string): TextoForVal16 {
  const vars = [...new Set(bloques.map(varMin))];
  const periodo = cobertura.primera && cobertura.ultima ? `del ${fmtDMY(cobertura.primera)} al ${fmtDMY(cobertura.ultima)}` : "sin datos en el periodo";
  const alcance = `El presente análisis de tendencias aplica a ${sistema}, con los datos registrados ${periodo} (primera y última fecha con datos reales). Variables analizadas: ${vars.join(", ") || "ninguna"}.`;
  const s81 = bloques.map((b, i) => `${i + 1}. Monitoreo de ${varMin(b)} ${b.codigo} (${b.ubicacion}) con código ${b.bitacora}`).join("\n");
  const g = dictamenGlobal(bloques);
  const conInv = bloques.filter((b) => b.dict?.requiereInvestigacion);
  const global = !bloques.length ? "No se analizaron instrumentos en el periodo."
    : conInv.length
      ? `En conjunto, ${bloques.length - conInv.length} de ${bloques.length} series analizadas no presentan hallazgos; ${conInv.length} ${conInv.length === 1 ? "requiere" : "requieren"} investigación de causa raíz (PNO-VAL-16 9.4).`
      : `En conjunto, las ${bloques.length} series analizadas se mantienen dentro de especificación y bajo control estadístico.`;
  const s9 = [...bloques.map(parrafo), global].join("\n\n");
  const s10 = conInv.length
    ? `Se identificaron los siguientes casos que requieren investigación:\n${conInv.map((b, i) => `${i + 1}. ${b.codigo} – ${varMin(b)}: ${b.dict!.estadoControl} · ${b.dict!.cumplimientoEspecificacion}.`).join("\n")}\nRegistrar en FOR-VAL-03-06.`
    : "No se generaron desviaciones durante el periodo analizado.";
  const s11 = `Con base en el análisis estadístico conforme a PNO-VAL-16 y a los requisitos de la NOM-241-SSA1-2025, el resultado global del periodo es ${g.cumplimiento} con especificación, con estado de control ${g.estado}.${g.requiere ? " Los casos señalados en la sección 10 requieren investigación de causa raíz (PNO-VAL-16 9.4)." : ""}`;
  return { alcance, s81, s9, s10, s11 };
}
