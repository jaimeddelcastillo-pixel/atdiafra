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

/** Lunes de la semana según las fechas escritas en el encabezado de la bitácora ("" si no se leyó). */
export function detectarLunesFoto(p: { fechas_columnas?: { fecha?: string }[] } | null | undefined): string {
  const fechas = (p?.fechas_columnas ?? [])
    .map((f) => f.fecha)
    .filter((f): f is string => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f))
    .map(corregirAnio)
    .filter(Boolean)
    .sort();
  if (!fechas.length) return "";
  const d = new Date(fechas[0] + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return lunesDe(d);
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
