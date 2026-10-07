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

/** Años plausibles del recuadro "Año" (2026, "26", o ambos si la hoja cruza de año: "2025/2026"). */
function aniosEncabezado(a?: string | number | null): number[] {
  const now = new Date().getFullYear();
  const out: number[] = [];
  for (const m of String(a ?? "").match(/\d{2,4}/g) ?? []) {
    let y = Number(m);
    if (y < 100) y += 2000;
    if (y >= 2025 && y <= now + 1 && !out.includes(y)) out.push(y);
  }
  return out.sort((x, y) => x - y);
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

/** Meses del recuadro "Mes" ("Mayo", "05", o ambos si la semana cruza de mes: "Abril/Mayo"). */
export function mesesEncabezado(m?: string | number | null): number[] {
  const s = String(m ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const out: number[] = [];
  for (const t of s.match(/[a-z]+|\d{1,2}/g) ?? []) {
    const v = /^\d+$/.test(t) ? Number(t) : (MESES[t] ?? MESES[t.slice(0, 3)]);
    if (v && v >= 1 && v <= 12 && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Lunes de la semana según las fechas escritas en el encabezado de la bitácora ("" si no se leyó).
 * El año del recuadro "Año" y el mes del recuadro "Mes" mandan: un día mal escrito nunca cambia
 * el año ni el mes (se tolera el mes adyacente cuando la semana cruza de un mes a otro).
 */
export function detectarLunesFoto(
  p: { anio?: string | number | null; mes?: string | number | null; fechas_columnas?: { dia?: string; fecha?: string }[] } | null | undefined,
): string {
  const aHoja = aniosEncabezado(p?.anio);
  const mHoja = mesesEncabezado(p?.mes);
  const votos = new Map<string, number>();
  for (const f0 of p?.fechas_columnas ?? []) {
    let f = f0;
    if (!f.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) continue;
    if (mHoja.length) {
      // Fuerza el mes de la hoja; con un solo mes se tolera el contiguo (semana que cruza de mes)
      const [y, m, d] = f.fecha.split("-").map(Number);
      const contiguo = mHoja.length === 1 && (
        (((m - mHoja[0] + 12) % 12) === 1 && d <= 7) || (((m - mHoja[0] + 12) % 12) === 11 && d >= 22));
      if (!mHoja.includes(m) && !contiguo) {
        // Con dos meses: días altos van al primero, días bajos al segundo
        const mm = mHoja.length > 1 ? (d >= 15 ? mHoja[0] : mHoja[mHoja.length - 1]) : mHoja[0];
        if (d <= new Date(y, mm, 0).getDate()) f = { ...f, fecha: `${y}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
      }
    }
    const di = idxDia(f.dia);
    let fecha: string;
    if (aHoja.length) {
      // Fuerza el año de la hoja; con dos años, diciembre va al primero y enero al segundo
      const [y, m, d] = f.fecha!.split("-").map(Number);
      const yHoja = aHoja.length > 1 ? (m >= 7 ? aHoja[0] : aHoja[aHoja.length - 1]) : aHoja[0];
      const yy = aHoja.includes(y) ? y : Math.abs(y - yHoja) === 1 && (m === 12 || m === 1) && aHoja.length === 1 ? y : yHoja;
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
