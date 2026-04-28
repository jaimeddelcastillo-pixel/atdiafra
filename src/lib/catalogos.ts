// Cliente de catálogos contra Lovable Cloud (Supabase)
import { supabase } from "@/integrations/supabase/client";

export type IsoClase = "ISO-5" | "ISO-7 (Clase C)" | "ISO-8 (Clase D)" | "ISO-9";
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
}

export interface ParCuartos {
  id: string;
  nombre: string;
  instrumento_id: string | null;
  cuarto_x_id: string | null;
  cuarto_y_id: string | null;
  iso: IsoClase;
  limite_normativo_pa: number;
  activo: boolean;
}

export const ISO_LIMIT_PA: Record<IsoClase, number> = {
  "ISO-5": 15,
  "ISO-7 (Clase C)": 10,
  "ISO-8 (Clase D)": 5,
  "ISO-9": 0,
};

// Límites de T/HR por ISO (NOM-241)
export const ISO_TEMP_HR: Record<IsoClase, { tempMin: number; tempMax: number; hrMin: number; hrMax: number }> = {
  "ISO-5": { tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65 },
  "ISO-7 (Clase C)": { tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65 },
  "ISO-8 (Clase D)": { tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65 },
  "ISO-9": { tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65 },
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

// ===== Pares de cuartos =====
export async function listPares(soloActivos = false): Promise<ParCuartos[]> {
  let q = supabase.from("pares_cuartos").select("*").order("nombre");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ParCuartos[];
}

export async function upsertPar(p: Partial<ParCuartos> & { nombre: string; iso: IsoClase; limite_normativo_pa: number }) {
  const { id, ...rest } = p;
  if (id) {
    const { error } = await supabase.from("pares_cuartos").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("pares_cuartos").insert(rest);
    if (error) throw error;
  }
}

export async function setParActivo(id: string, activo: boolean) {
  const { error } = await supabase.from("pares_cuartos").update({ activo }).eq("id", id);
  if (error) throw error;
}
