// Guarda la foto de la bitácora (ya comprimida) para poder consultarla después junto a su semana.
import { supabase } from "@/integrations/supabase/client";

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
