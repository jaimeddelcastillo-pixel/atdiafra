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

/** Año plausible escrito en el recuadro "Año" de la bitácora (2026, "26"), o null. */
function anioEncabezado(a?: string | number | null): number | null {
  const m = String(a ?? "").match(/\d{2,4}/);
  if (!m) return null;
  let y = Number(m[0]);
  if (y < 100) y += 2000;
  const now = new Date().getFullYear();
  return y >= 2025 && y <= now + 1 ? y : null;
}

/** Si el año leído no cuadra con el día de la columna, busca el año plausible MÁS CERCANO al de referencia. */
function anioQueCuadra(fecha: string, dia: number, ref: number): string | null {
  const [, m, d] = fecha.split("-").map(Number);
  const now = new Date().getFullYear();
  const cands: number[] = [];
  for (let y = 2025; y <= now + 1; y++) cands.push(y);
  cands.sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref) || b - a);
  for (const y of cands) {
    const t = new Date(y, m - 1, d);
    if (t.getMonth() === m - 1 && idxSemana(t) === dia) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

const MESES: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5,
  jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, set: 9, setiembre: 9,
  oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};

/** Mes escrito en el recuadro "Mes" de la bitácora ("Mayo", "05", "may"), o null. */
export function mesEncabezado(m?: string | number | null): number | null {
  const s = String(m ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!s) return null;
  const n = s.match(/^\d{1,2}$/);
  if (n) { const v = Number(n[0]); return v >= 1 && v <= 12 ? v : null; }
  const w = s.match(/[a-z]+/);
  if (!w) return null;
  return MESES[w[0]] ?? MESES[w[0].slice(0, 3)] ?? null;
}

/**
 * Lunes de la semana según las fechas escritas en el encabezado de la bitácora ("" si no se leyó).
 * El año del recuadro "Año" y el mes del recuadro "Mes" mandan: un día mal escrito nunca cambia
 * el año ni el mes (se tolera el mes adyacente cuando la semana cruza de un mes a otro).
 */
export function detectarLunesFoto(
  p: { anio?: string | number | null; mes?: string | number | null; fechas_columnas?: { dia?: string; fecha?: string }[] } | null | undefined,
): string {
  const yHoja = anioEncabezado(p?.anio);
  const mHoja = mesEncabezado(p?.mes);
  const votos = new Map<string, number>();
  for (const f0 of p?.fechas_columnas ?? []) {
    let f = f0;
    if (!f.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) continue;
    if (mHoja) {
      // Fuerza el mes de la hoja salvo que sea el mes contiguo (semana que cruza de mes)
      const [y, m, d] = f.fecha.split("-").map(Number);
      const dif = (m - mHoja + 12) % 12;
      const contiguo = (dif === 1 && d <= 7) || (dif === 11 && d >= 22);
      if (m !== mHoja && !contiguo) {
        const ultimo = new Date(y, mHoja, 0).getDate();
        if (d <= ultimo) f = { ...f, fecha: `${y}-${String(mHoja).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
      }
    }
    const di = idxDia(f.dia);
    let fecha: string;
    if (yHoja) {
      // Fuerza el año de la hoja (tolera cruce dic/ene adyacente)
      const [y, m, d] = f.fecha!.split("-").map(Number);
      const yy = Math.abs(y - yHoja) === 1 && (m === 12 || m === 1) ? y : yHoja;
      fecha = `${yy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    } else {
      fecha = corregirAnio(f.fecha!);
      if (di !== undefined) {
        const ok = fecha && idxSemana(new Date(fecha + "T00:00:00")) === di;
        const ref = fecha ? Number(fecha.slice(0, 4)) : new Date().getFullYear();
        if (!ok) fecha = anioQueCuadra(fecha || f.fecha!, di, ref) ?? fecha;
      }
    }
    if (!fecha) continue;
    const d = new Date(fecha + "T00:00:00");
    if (isNaN(d.getTime())) continue;
    const lunes = lunesDe(d);
    const peso = di !== undefined && idxSemana(d) === di ? 2 : 1;
    votos.set(lunes, (votos.get(lunes) ?? 0) + peso);
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
