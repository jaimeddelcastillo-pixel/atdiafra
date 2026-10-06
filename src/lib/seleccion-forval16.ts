// Selección de instrumentos para el análisis de tendencias FOR-VAL-16-02.
import type { AreaClasificada, Instrumento } from "@/lib/catalogos";
import type { Registro } from "@/lib/semanas";

export const MODULOS_TENDENCIA = new Set(["temphr", "presiones", "filtros"]);

/** Une registros del mismo instrumento; por semana gana la captura más reciente. */
export function unirPorInstrumento(regs: Registro[]): Registro[] {
  const m = new Map<string, Registro>();
  for (const r of regs) {
    if (!MODULOS_TENDENCIA.has(r.modulo) || r.activo === false) continue;
    const k = `${r.modulo}|${r.instrumento_id ?? r.id}`;
    const cur = m.get(k);
    if (!cur) { m.set(k, { ...r, semanas: [...r.semanas] }); continue; }
    const porSemana = new Map(cur.semanas.map((s) => [s.semana_inicio, s]));
    for (const s of r.semanas) {
      const p = porSemana.get(s.semana_inicio);
      if (!p || (s.saved_at ?? "") > (p.saved_at ?? "")) porSemana.set(s.semana_inicio, s);
    }
    cur.semanas = [...porSemana.values()].sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));
  }
  return [...m.values()];
}

export function hvacDe(r: Registro, instrMap: Map<string, Instrumento>, areasMap: Map<string, AreaClasificada>): string | null {
  if (r.hvac_id) return r.hvac_id;
  const ins = r.instrumento_id ? instrMap.get(r.instrumento_id) : undefined;
  const a = (ins?.area_id && areasMap.get(ins.area_id)) || (r.area_id && areasMap.get(r.area_id)) || undefined;
  if (a?.hvac_id) return a.hvac_id;
  const primero = ins?.area_libre?.split(/ vs /i)[0]?.trim();
  const porCodigo = primero ? [...areasMap.values()].find((x) => x.codigo === primero) : undefined;
  return porCodigo?.hvac_id ?? null;
}

export const codigoRegistro = (r: Registro, instrMap: Map<string, Instrumento>) =>
  (r.instrumento_id && instrMap.get(r.instrumento_id)?.codigo) || r.nombre;
