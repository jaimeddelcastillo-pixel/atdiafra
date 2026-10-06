// Cliente de catálogos contra Lovable Cloud (Supabase)
import { supabase } from "@/integrations/supabase/client";

export type IsoClase = "ISO-5" | "ISO-6" | "ISO-7" | "ISO-8" | "ISO-9" | "No clasificada";

export const ISO_CLASES: IsoClase[] = ["ISO-5", "ISO-6", "ISO-7", "ISO-8", "ISO-9", "No clasificada"];
export type InstrumentoTipo = "termohigrometro" | "manometro_filtro" | "manometro_diferencial" | "otro";

export interface SistemaHVAC {
  id: string;
  codigo: string;
  nombre_uma: string;
  descripcion: string;
  etapas: string[];
  activo: boolean;
}

export interface AreaClasificada {
  id: string;
  codigo: string;
  nombre: string;
  iso: IsoClase;
  hvac_id: string | null;
  activo: boolean;
}

export interface Instrumento {
  id: string;
  codigo: string;
  tipo: InstrumentoTipo;
  area_id: string | null;
  area_libre: string | null;
  parametro: string;
  especificacion: string | null;
  activo: boolean;
  /** Límites para manómetros (Pa). Se definen una sola vez en el catálogo. */
  lie_pa: number | null;
  lse_pa: number | null;
  /** Solo para manómetros de filtro HEPA: baseline + tolerancia para alarma de tendencia. */
  baseline_pa: number | null;
  baseline_tolerancia_pct: number | null;
  /** Código de la bitácora física (BIT-…) usado en los formatos. */
  codigo_bitacora: string | null;
  /** ΔP final de saturación según fabricante (filtros), en la unidad del instrumento. */
  dp_final_fabricante: number | null;
}

// La interfaz ParCuartos fue retirada al unificar el catálogo en `objetivos_presion`.

export const ISO_LIMIT_PA: Record<IsoClase, number> = {
  "ISO-5": 15,
  "ISO-6": 12,
  "ISO-7": 10,
  "ISO-8": 5,
  "ISO-9": 0,
  "No clasificada": 0,
};

// Límites de T/HR por ISO (NOM-241). 'No clasificada' usa rangos amplios por defecto; ajustar por área si aplica.
export const ISO_TEMP_HR: Record<IsoClase, { tempMin: number; tempMax: number; hrMin: number; hrMax: number }> = {
  "ISO-5": { tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65 },
  "ISO-6": { tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65 },
  "ISO-7": { tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65 },
  "ISO-8": { tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65 },
  "ISO-9": { tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65 },
  "No clasificada": { tempMin: 15, tempMax: 30, hrMin: 20, hrMax: 80 },
};

// ===== Sistemas HVAC =====
export async function listSistemasHVAC(soloActivos = false): Promise<SistemaHVAC[]> {
  let q = supabase.from("sistemas_hvac").select("*").order("codigo");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SistemaHVAC[];
}

export async function upsertSistemaHVAC(s: Partial<SistemaHVAC> & { codigo: string; nombre_uma: string; descripcion: string; etapas: string[] }) {
  const { id, ...rest } = s;
  if (id) {
    const { error } = await supabase.from("sistemas_hvac").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("sistemas_hvac").insert(rest);
    if (error) throw error;
  }
}

export async function setSistemaHVACActivo(id: string, activo: boolean) {
  const { error } = await supabase.from("sistemas_hvac").update({ activo }).eq("id", id);
  if (error) throw error;
}

// ===== Áreas =====
export async function listAreas(soloActivos = false): Promise<AreaClasificada[]> {
  let q = supabase.from("areas_clasificadas").select("*").order("codigo");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AreaClasificada[];
}

export async function upsertArea(a: Partial<AreaClasificada> & { codigo: string; nombre: string; iso: IsoClase }) {
  const { id, ...rest } = a;
  if (id) {
    const { error } = await supabase.from("areas_clasificadas").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("areas_clasificadas").insert(rest);
    if (error) throw error;
  }
}

export async function setAreaActivo(id: string, activo: boolean) {
  const { error } = await supabase.from("areas_clasificadas").update({ activo }).eq("id", id);
  if (error) throw error;
}

// ===== Instrumentos =====
export async function listInstrumentos(filtro?: { tipo?: InstrumentoTipo; soloActivos?: boolean }): Promise<Instrumento[]> {
  let q = supabase.from("instrumentos").select("*").order("codigo");
  if (filtro?.tipo) q = q.eq("tipo", filtro.tipo);
  if (filtro?.soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Instrumento[];
}

export async function upsertInstrumento(i: Partial<Instrumento> & { codigo: string; tipo: InstrumentoTipo; parametro: string }) {
  const { id, ...rest } = i;
  if (id) {
    const { error } = await supabase.from("instrumentos").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("instrumentos").insert(rest);
    if (error) throw error;
  }
}

export async function setInstrumentoActivo(id: string, activo: boolean) {
  const { error } = await supabase.from("instrumentos").update({ activo }).eq("id", id);
  if (error) throw error;
}

// ===== Cambios de filtro =====
export interface CambioFiltro { id: string; instrumento_id: string; fecha: string; nota: string }

export async function listCambiosFiltro(instrumentoId?: string): Promise<CambioFiltro[]> {
  let q = supabase.from("cambios_filtro").select("id, instrumento_id, fecha, nota").order("fecha");
  if (instrumentoId) q = q.eq("instrumento_id", instrumentoId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CambioFiltro[];
}
export async function addCambioFiltro(c: { instrumento_id: string; fecha: string; nota: string }) {
  const { error } = await supabase.from("cambios_filtro").insert(c);
  if (error) throw error;
}
export async function deleteCambioFiltro(id: string) {
  const { error } = await supabase.from("cambios_filtro").delete().eq("id", id);
  if (error) throw error;
}

// Pares de cuartos: tabla legacy eliminada. El catálogo unificado vive en `objetivos_presion`
// (ver src/lib/objetivos-presion.ts).
