// Guarda la foto de la bitácora (ya comprimida) para poder consultarla después junto a su semana.
import { supabase } from "@/integrations/supabase/client";
import { lunesDe } from "@/lib/semanas";

/** Corrige años mal leídos por la IA (escritura a mano: 2016→2026, 2075→2025). Devuelve "" si no hay año plausible. */
function corregirAnio(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const now = new Date().getFullYear();
  const MIN = 2025; // no se aceptan bitácoras de 2024 o anteriores
  if (y >= MIN && y <= now + 1) return fecha;
  if (y === 2023) return `2025-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // Intenta corregir un solo dígito del año (errores típicos de lectura manuscrita)
  for (const delta of [10, -10, 50, -50, 100, -100, 2, 1, -1]) {
    const cand = y + delta;
    if (cand >= MIN && cand <= now + 1) {
      const test = new Date(cand, m - 1, d);
      if (test.getMonth() === m - 1) return `${cand}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return "";
}

const IDX_DIA: Record<string, number> = {
  lunes: 0, martes: 1, miercoles: 2, "miércoles": 2, jueves: 3, viernes: 4,
  sabado: 5, "sábado": 5, domingo: 6,
};
const idxDia = (s?: string) => (s ? IDX_DIA[s.toLowerCase().trim()] : undefined);
/** 0=Lunes … 6=Domingo */
const idxSemana = (d: Date) => (d.getDay() + 6) % 7;

/** Si el año leído no cuadra con el día de la columna, busca un año plausible donde sí cuadre. */
function anioQueCuadra(fecha: string, dia: number): string | null {
  const [, m, d] = fecha.split("-").map(Number);
  const now = new Date().getFullYear();
  for (let y = now + 1; y >= 2025; y--) {
    const t = new Date(y, m - 1, d);
    if (t.getMonth() === m - 1 && idxSemana(t) === dia) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Lunes de la semana según las fechas escritas en el encabezado de la bitácora ("" si no se leyó).
 * Usa el par día+fecha (incluye sábado y domingo trabajados) y vota por el lunes más consistente,
 * para que una fecha de fin de semana no mande la captura a otra semana u otro año.
 */
export function detectarLunesFoto(
  p: { fechas_columnas?: { dia?: string; fecha?: string }[] } | null | undefined,
): string {
  const votos = new Map<string, number>();
  const sueltas: string[] = [];
  for (const f of p?.fechas_columnas ?? []) {
    if (!f.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) continue;
    const di = idxDia(f.dia);
    let fecha = corregirAnio(f.fecha);
    if (di !== undefined) {
      const ok = fecha && idxSemana(new Date(fecha + "T00:00:00")) === di;
      if (!ok) fecha = anioQueCuadra(fecha || f.fecha, di) ?? fecha;
    }
    if (!fecha) continue;
    const d = new Date(fecha + "T00:00:00");
    if (isNaN(d.getTime())) continue;
    const lunes = lunesDe(d);
    // Pares cuyo día coincide con la fecha pesan más
    const peso = di !== undefined && idxSemana(d) === di ? 2 : 1;
    votos.set(lunes, (votos.get(lunes) ?? 0) + peso);
    sueltas.push(fecha);
  }
  if (!votos.size) return "";
  return [...votos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

export async function subirFotoBitacora(base64: string, mediaType = "image/jpeg"): Promise<string | null> {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("bitacoras").upload(path, new Blob([bytes], { type: mediaType }), {
      contentType: mediaType,
      upsert: false,
    });
    if (error) {
      console.warn("[foto bitácora] no se pudo guardar:", error.message);
      return null;
    }
    return path;
  } catch (e) {
    console.warn("[foto bitácora] error:", e);
    return null;
  }
}

export async function urlFotoBitacora(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("bitacoras").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}
