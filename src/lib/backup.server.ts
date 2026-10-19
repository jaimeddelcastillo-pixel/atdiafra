// Respaldo completo de la base de datos y las fotos de bitácora (solo super_admin).
import JSZip from "jszip";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TABLAS = [
  "sistemas_hvac",
  "areas_clasificadas",
  "instrumentos",
  "objetivos_presion",
  "cambios_filtro",
  "registros",
  "registro_semanas",
  "registro_analisis_tendencias",
  "registro_analisis_tendencias_historial",
  "formato_forval16",
  "app_config",
  "perfiles",
  "user_roles",
  "audit_log",
] as const;

const BUCKET_FOTOS = "bitacoras";
const PAGE = 1000;

async function requireSuperAdmin(accessToken: string) {
  if (!accessToken) throw new Error("Tu sesión no es válida. Vuelve a iniciar sesión.");
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData.user)
    throw new Error("Tu sesión no es válida. Vuelve a iniciar sesión.");
  const { data: roleRows, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .eq("role", "super_admin");
  if (roleError) throw new Error(roleError.message);
  if (!roleRows || roleRows.length === 0)
    throw new Error("Solo un super_admin puede exportar el respaldo.");
  return userData.user;
}

async function leerTabla(tabla: string): Promise<unknown[]> {
  const filas: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin.from(tabla).select("*").range(from, from + PAGE - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return filas;
}

/** Lista recursiva de objetos del bucket (carpetas = prefijos). */
async function listarFotos(prefix = ""): Promise<string[]> {
  const rutas: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_FOTOS)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`storage ${prefix || "/"}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const ruta = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) rutas.push(ruta); // archivo
      else rutas.push(...(await listarFotos(ruta))); // carpeta
    }
    if (data.length < PAGE) break;
  }
  return rutas;
}

export interface BackupResult {
  filename: string;
  base64: string;
  tablas: Record<string, number>;
  fotos: number;
}

export async function generarRespaldo(accessToken: string): Promise<BackupResult> {
  await requireSuperAdmin(accessToken);

  const zip = new JSZip();
  const tablas: Record<string, number> = {};

  for (const tabla of TABLAS) {
    const filas = await leerTabla(tabla);
    tablas[tabla] = filas.length;
    zip.file(`${tabla}.json`, JSON.stringify(filas, null, 2));
  }

  const rutasFotos = await listarFotos();
  let fotos = 0;
  for (const ruta of rutasFotos) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET_FOTOS).download(ruta);
    if (error || !data) continue; // una foto ilegible no detiene el respaldo
    const bytes = new Uint8Array(await data.arrayBuffer());
    zip.file(`fotos/${ruta}`, bytes, { compression: "STORE" }); // JPEG ya comprimido
    fotos++;
  }

  const ahora = new Date();
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        generado_at: ahora.toISOString(),
        generado_por: "TRACEA · Exportar respaldo",
        tablas,
        fotos,
        bucket_fotos: BUCKET_FOTOS,
      },
      null,
      2,
    ),
  );

  const base64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  const stamp = ahora.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return { filename: `respaldo-tracea-${stamp}.zip`, base64, tablas, fotos };
}
