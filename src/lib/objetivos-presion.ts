// Catálogo unificado de objetivos de presión (par de cuartos / equipo / filtro HEPA).
import { supabase } from "@/integrations/supabase/client";

export type TipoObjetivoPresion = "par_cuartos" | "equipo" | "filtro_hepa";

export interface ObjetivoPresion {
  id: string;
  tipo: TipoObjetivoPresion;
  codigo: string;
  nombre: string;
  // par_cuartos
  par_cuartos_id: string | null;
  cuarto_x_id: string | null;
  cuarto_y_id: string | null;
  iso: string | null;
  // equipo / filtro
  hvac_id: string | null;
  etapa: string | null;
  equipo_codigo: string | null;
  // comunes
  instrumento_id: string | null;
  unidad: string;
  limite_normativo_pa: number | null;
  lie_pa: number | null;
  lse_pa: number | null;
  baseline_pa: number | null;
  baseline_tolerancia_pct: number | null;
  activo: boolean;
}

export const TIPO_OBJETIVO_LABEL: Record<TipoObjetivoPresion, string> = {
  par_cuartos: "Par de cuartos",
  equipo: "Equipo (manómetro)",
  filtro_hepa: "Filtro HEPA / etapa",
};

export async function listObjetivosPresion(soloActivos = true): Promise<ObjetivoPresion[]> {
  let q = supabase.from("objetivos_presion").select("*").order("tipo").order("codigo");
  if (soloActivos) q = q.eq("activo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ObjetivoPresion[];
}

export async function upsertObjetivoPresion(
  o: Partial<ObjetivoPresion> & { tipo: TipoObjetivoPresion; codigo: string; nombre: string },
) {
  const { id, ...rest } = o;
  if (id) {
    const { error } = await supabase.from("objetivos_presion").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("objetivos_presion").insert(rest);
    if (error) throw error;
  }
}

export async function setObjetivoPresionActivo(id: string, activo: boolean) {
  const { error } = await supabase.from("objetivos_presion").update({ activo }).eq("id", id);
  if (error) throw error;
}

/** Etiqueta de límite legible según tipo. */
export function describirLimite(o: ObjetivoPresion): string {
  if (o.tipo === "par_cuartos") {
    return o.limite_normativo_pa != null ? `≥${o.limite_normativo_pa} Pa` : "sin límite";
  }
  const partes: string[] = [];
  if (o.lie_pa != null) partes.push(`≥${o.lie_pa}`);
  if (o.lse_pa != null) partes.push(`≤${o.lse_pa}`);
  return partes.length ? `${partes.join(" / ")} Pa` : "sin límite";
}

/** Alerta de tendencia para filtros: dispara si la lectura se desvía más del % tolerancia respecto al baseline. */
export function alertaBaseline(
  valor: number,
  baseline: number | null,
  tolerancia_pct: number | null,
): "ok" | "warning" | null {
  if (baseline == null || tolerancia_pct == null) return null;
  const diff = Math.abs(valor - baseline);
  const margen = (Math.abs(baseline) * tolerancia_pct) / 100;
  return diff > margen ? "warning" : "ok";
}
