// Guarda la foto de la bitácora (ya comprimida) para poder consultarla después junto a su semana.
import { supabase } from "@/integrations/supabase/client";
import { lunesDe } from "@/lib/semanas";

/** Lunes de la semana según las fechas escritas en el encabezado de la bitácora ("" si no se leyó). */
export function detectarLunesFoto(p: { fechas_columnas?: { fecha?: string }[] } | null | undefined): string {
  const fechas = (p?.fechas_columnas ?? [])
    .map((f) => f.fecha)
    .filter((f): f is string => !!f && /^\d{4}-\d{2}-\d{2}$/.test(f))
    .sort();
  if (!fechas.length) return "";
  const d = new Date(fechas[0] + "T00:00:00");
  if (isNaN(d.getTime()) || d.getFullYear() < 2015 || d.getFullYear() > 2100) return "";
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
