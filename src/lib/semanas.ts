// Modelo de Registro/Semana 7 días × 3 turnos. Persistencia en Lovable Cloud (Supabase).
import { supabase } from "@/integrations/supabase/client";
import { loadJSON, removeKey } from "./storage";

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const TURNOS = ["Mañana", "Media tarde", "Tarde"] as const;

export type Dia = (typeof DIAS)[number];
export type Turno = (typeof TURNOS)[number];

export interface PuntoLectura {
  dia: Dia;
  turno: Turno;
  valor: number | null;
  hora: string | null;
  quien: string | null;
  _edited?: boolean;
  _motivo?: string;
  /** No aplica: día/turno no laborable (semana inglesa: Sáb/Dom por defecto). No cuenta para "completa". */
  _na?: boolean;
  /** Marcado por la IA como lectura de baja confianza — el operador debe revisarlo antes de guardar. */
  _dudoso?: boolean;
}

/** Días considerados no laborables por defecto (semana inglesa). */
export const DIAS_NO_LABORABLES_DEFAULT: Dia[] = ["Sábado", "Domingo"];

export interface Semana {
  id: string;
  semana_inicio: string; // YYYY-MM-DD lunes
  mes: string;
  anio: string;
  unidad: string;
  lecturas: PuntoLectura[];
  lecturas_hr?: PuntoLectura[];
  observaciones: string;
  source: "imagen" | "manual";
  saved_at: string;
}

export type Modulo = "filtros" | "temphr" | "presiones" | "agua";

export interface Registro {
  id: string;
  modulo: Modulo;
  nombre: string;
  instrumento_id?: string | null;
  par_cuartos_id?: string | null;
  hvac_id?: string | null;
  etapa?: string | null;
  area_id?: string | null;
  codigo_area_libre?: string | null;
  nombre_area_libre?: string | null;
  iso?: string | null;
  lse?: number | null;
  lie?: number | null;
  lse_t?: number | null;
  lie_t?: number | null;
  lse_hr?: number | null;
  lie_hr?: number | null;
  semanas: Semana[];
  created_at: string;
  activo: boolean;
}

// ===== Helpers de fecha =====
export function lunesDe(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function nombreMes(date: Date = new Date()): string {
  return date.toLocaleDateString("es-MX", { month: "long" });
}

export function semanaVacia(opts: { semana_inicio: string; mes: string; anio: string; unidad: string; esTHR?: boolean }): Semana {
  const make = (): PuntoLectura[] =>
    DIAS.flatMap((dia) =>
      TURNOS.map((turno) => ({
        dia,
        turno,
        valor: null,
        hora: null,
        quien: null,
        _na: DIAS_NO_LABORABLES_DEFAULT.includes(dia),
      })),
    );
  return {
    id: crypto.randomUUID(),
    semana_inicio: opts.semana_inicio,
    mes: opts.mes,
    anio: opts.anio,
    unidad: opts.unidad,
    lecturas: make(),
    lecturas_hr: opts.esTHR ? make() : undefined,
    observaciones: "",
    source: "manual",
    saved_at: new Date().toISOString(),
  };
}

// ===== Mapping DB <-> dominio =====
type DbRegistro = {
  id: string; modulo: string; nombre: string;
  instrumento_id: string | null; par_cuartos_id: string | null; hvac_id: string | null;
  etapa: string | null; area_id: string | null;
  codigo_area_libre: string | null; nombre_area_libre: string | null; iso: string | null;
  lse: number | null; lie: number | null;
  lse_t: number | null; lie_t: number | null; lse_hr: number | null; lie_hr: number | null;
  activo: boolean; created_at: string;
};
type DbSemana = {
  id: string; registro_id: string; semana_inicio: string;
  mes: string; anio: string; unidad: string;
  lecturas: PuntoLectura[]; lecturas_hr: PuntoLectura[] | null;
  observaciones: string; source: string; saved_at: string;
};

function rowToRegistro(r: DbRegistro, semanas: Semana[]): Registro {
  return {
    id: r.id,
    modulo: r.modulo as Modulo,
    nombre: r.nombre,
    instrumento_id: r.instrumento_id,
    par_cuartos_id: r.par_cuartos_id,
    hvac_id: r.hvac_id,
    etapa: r.etapa,
    area_id: r.area_id,
    codigo_area_libre: r.codigo_area_libre,
    nombre_area_libre: r.nombre_area_libre,
    iso: r.iso,
    lse: r.lse, lie: r.lie,
    lse_t: r.lse_t, lie_t: r.lie_t, lse_hr: r.lse_hr, lie_hr: r.lie_hr,
    semanas,
    created_at: r.created_at,
    activo: r.activo,
  };
}

function semanaToRow(s: Semana, registroId: string): Omit<DbSemana, "id"> & { id?: string } {
  return {
    id: s.id,
    registro_id: registroId,
    semana_inicio: s.semana_inicio,
    mes: s.mes,
    anio: s.anio,
    unidad: s.unidad,
    lecturas: s.lecturas,
    lecturas_hr: s.lecturas_hr ?? null,
    observaciones: s.observaciones,
    source: s.source,
    saved_at: s.saved_at,
  };
}

// ===== API pública =====
export async function listRegistros(modulo?: Modulo): Promise<Registro[]> {
  let q = supabase.from("registros").select("*").order("created_at");
  if (modulo) q = q.eq("modulo", modulo);
  const { data: regs, error } = await q;
  if (error) throw error;
  const ids = (regs ?? []).map((r) => r.id);
  if (ids.length === 0) return [];
  const { data: sems, error: e2 } = await supabase
    .from("registro_semanas")
    .select("*")
    .in("registro_id", ids)
    .order("semana_inicio");
  if (e2) throw e2;
  const byReg = new Map<string, Semana[]>();
  for (const s of (sems ?? []) as unknown as DbSemana[]) {
    const arr = byReg.get(s.registro_id) ?? [];
    arr.push({
      id: s.id,
      semana_inicio: s.semana_inicio,
      mes: s.mes,
      anio: s.anio,
      unidad: s.unidad,
      lecturas: (s.lecturas ?? []) as PuntoLectura[],
      lecturas_hr: (s.lecturas_hr ?? undefined) as PuntoLectura[] | undefined,
      observaciones: s.observaciones,
      source: (s.source as "imagen" | "manual") ?? "manual",
      saved_at: s.saved_at,
    });
    byReg.set(s.registro_id, arr);
  }
  return (regs as DbRegistro[]).map((r) => rowToRegistro(r, byReg.get(r.id) ?? []));
}

export async function getRegistro(id: string): Promise<Registro | null> {
  const { data: r, error } = await supabase.from("registros").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!r) return null;
  const { data: sems, error: e2 } = await supabase
    .from("registro_semanas").select("*").eq("registro_id", id).order("semana_inicio");
  if (e2) throw e2;
  const semanas: Semana[] = ((sems ?? []) as unknown as DbSemana[]).map((s) => ({
    id: s.id, semana_inicio: s.semana_inicio, mes: s.mes, anio: s.anio, unidad: s.unidad,
    lecturas: (s.lecturas ?? []) as PuntoLectura[],
    lecturas_hr: (s.lecturas_hr ?? undefined) as PuntoLectura[] | undefined,
    observaciones: s.observaciones, source: (s.source as "imagen" | "manual") ?? "manual", saved_at: s.saved_at,
  }));
  return rowToRegistro(r as DbRegistro, semanas);
}

/** Inserta o actualiza el encabezado de un registro y sincroniza sus semanas. */
export async function upsertRegistro(r: Registro): Promise<void> {
  const head = {
    id: r.id,
    modulo: r.modulo,
    nombre: r.nombre,
    instrumento_id: r.instrumento_id ?? null,
    par_cuartos_id: r.par_cuartos_id ?? null,
    hvac_id: r.hvac_id ?? null,
    etapa: r.etapa ?? null,
    area_id: r.area_id ?? null,
    codigo_area_libre: r.codigo_area_libre ?? null,
    nombre_area_libre: r.nombre_area_libre ?? null,
    iso: r.iso ?? null,
    lse: r.lse ?? null, lie: r.lie ?? null,
    lse_t: r.lse_t ?? null, lie_t: r.lie_t ?? null,
    lse_hr: r.lse_hr ?? null, lie_hr: r.lie_hr ?? null,
    activo: r.activo,
  };
  const { error } = await supabase.from("registros").upsert(head, { onConflict: "id" });
  if (error) throw error;

  // Sincronizar semanas: upsert todas y borrar las que ya no estén
  if (r.semanas.length > 0) {
    const rows = r.semanas.map((s) => semanaToRow(s, r.id)) as unknown as never[];
    const { error: e2 } = await supabase.from("registro_semanas").upsert(rows, { onConflict: "id" });
    if (e2) throw e2;
  }
  const { data: existing, error: e3 } = await supabase
    .from("registro_semanas").select("id").eq("registro_id", r.id);
  if (e3) throw e3;
  const keep = new Set(r.semanas.map((s) => s.id));
  const toDelete = (existing ?? []).map((x) => x.id).filter((id) => !keep.has(id));
  if (toDelete.length > 0) {
    const { error: e4 } = await supabase.from("registro_semanas").delete().in("id", toDelete);
    if (e4) throw e4;
  }
}

// ===== Reglas de completitud =====
/** Un punto cuenta como NA si está marcado explícitamente, o si es Sáb/Dom sin valor (semana inglesa por defecto, retro-compatible con datos viejos sin _na). */
function esPuntoNA(p: PuntoLectura): boolean {
  if (p._na) return true;
  const sinValor = p.valor == null || !Number.isFinite(p.valor);
  if (sinValor && DIAS_NO_LABORABLES_DEFAULT.includes(p.dia)) return true;
  return false;
}

/** Cuenta cuántas lecturas se esperan en una semana, descontando turnos marcados como NA (explícito o por semana inglesa). */
export function lecturasEsperadas(semana: Semana, esTHR: boolean): number {
  const aplica = (arr: PuntoLectura[] | undefined) =>
    (arr ?? []).filter((p) => !esPuntoNA(p)).length;
  const t = aplica(semana.lecturas);
  const hr = esTHR ? aplica(semana.lecturas_hr) : 0;
  return t + hr;
}

/** Cuenta cuántas lecturas válidas (con valor) hay, ignorando turnos NA. */
export function lecturasCapturadas(semana: Semana, esTHR: boolean): number {
  const valid = (arr: PuntoLectura[] | undefined) =>
    (arr ?? []).filter((p) => !esPuntoNA(p) && p.valor != null && Number.isFinite(p.valor)).length;
  const t = valid(semana.lecturas);
  const hr = esTHR ? valid(semana.lecturas_hr) : 0;
  return t + hr;
}

/** Una semana está completa si todas sus lecturas no-NA tienen valor. */
export function esSemanaCompleta(semana: Semana, esTHR: boolean): boolean {
  const esp = lecturasEsperadas(semana, esTHR);
  if (esp === 0) return false;
  return lecturasCapturadas(semana, esTHR) >= esp;
}

/** Una semana se considera "vacía" si no tiene ninguna lectura con valor ni observaciones. Útil para detectar semanas creadas por accidente. */
export function esSemanaVacia(semana: Semana, esTHR: boolean): boolean {
  return lecturasCapturadas(semana, esTHR) === 0 && !semana.observaciones?.trim();
}

/** Etiqueta descriptiva del rango de fechas cubierto por las semanas de un registro.
 * Ejemplos:
 *   "ene–mar 2025 · 12 semanas"
 *   "feb 2024 – ene 2025 · 28 semanas"
 *   "sin semanas"
 */
export function rangoFechasRegistro(r: Registro): string {
  if (!r.semanas.length) return "sin semanas";
  const ordenadas = r.semanas.map((s) => s.semana_inicio).sort();
  const primero = new Date(ordenadas[0] + "T00:00:00");
  const ultimo = new Date(ordenadas[ordenadas.length - 1] + "T00:00:00");
  const fmtMes = (d: Date) => d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "");
  const mismoAnio = primero.getFullYear() === ultimo.getFullYear();
  const mismoMes = mismoAnio && primero.getMonth() === ultimo.getMonth();
  const rango = mismoMes
    ? `${fmtMes(primero)} ${primero.getFullYear()}`
    : mismoAnio
      ? `${fmtMes(primero)}–${fmtMes(ultimo)} ${primero.getFullYear()}`
      : `${fmtMes(primero)} ${primero.getFullYear()} – ${fmtMes(ultimo)} ${ultimo.getFullYear()}`;
  return `${rango} · ${r.semanas.length} semana${r.semanas.length === 1 ? "" : "s"}`;
}

/** Nombre del registro + rango de fechas para distinguir duplicados visualmente. */
export function nombreRegistroConFechas(r: Registro): string {
  return `${r.nombre} (${rangoFechasRegistro(r)})`;
}

/** Detecta grupos de registros REALMENTE duplicados:
 * misma área + instrumento + módulo Y AL MENOS UN LUNES (semana_inicio) en común.
 * Registros de la misma área+instrumento pero con semanas distintas NO son duplicados:
 * son periodos diferentes (ej. ene–mar vs abr–jun) y deben coexistir.
 */
export function detectarDuplicados(registros: Registro[]): Registro[][] {
  const grupos = new Map<string, Registro[]>();
  for (const r of registros) {
    const key = [
      r.modulo,
      r.area_id ?? r.codigo_area_libre ?? "",
      r.instrumento_id ?? "",
      r.par_cuartos_id ?? "",
      r.hvac_id ?? "",
    ].join("|");
    const arr = grupos.get(key) ?? [];
    arr.push(r);
    grupos.set(key, arr);
  }
  // Solo es duplicado si dos registros del mismo grupo comparten al menos un lunes.
  const resultado: Registro[][] = [];
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const lunesPorRegistro = grupo.map((r) => new Set(r.semanas.map((s) => s.semana_inicio)));
    let haySolape = false;
    outer: for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        for (const l of lunesPorRegistro[i]) {
          if (lunesPorRegistro[j].has(l)) { haySolape = true; break outer; }
        }
      }
    }
    // También consideramos duplicado si hay 2+ registros del mismo grupo SIN ninguna semana
    // (vacíos creados por accidente).
    const todosVacios = grupo.every((r) => r.semanas.length === 0);
    if (haySolape || todosVacios) resultado.push(grupo);
  }
  return resultado;
}

/** Fusiona varios registros en uno solo: conserva el más antiguo y mueve todas las semanas (sin duplicar lunes). */
export async function fusionarRegistros(grupo: Registro[]): Promise<{ conservado: string; eliminados: string[]; semanas: number }> {
  if (grupo.length < 2) throw new Error("Se requieren al menos 2 registros para fusionar");
  const ordenado = [...grupo].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const principal = ordenado[0];
  const otros = ordenado.slice(1);
  const lunesYaPresentes = new Set(principal.semanas.map((s) => s.semana_inicio));
  const semanasNuevas: Semana[] = [];
  for (const r of otros) {
    for (const s of r.semanas) {
      if (lunesYaPresentes.has(s.semana_inicio)) continue;
      semanasNuevas.push({ ...s, id: crypto.randomUUID() });
      lunesYaPresentes.add(s.semana_inicio);
    }
  }
  const fusionado: Registro = {
    ...principal,
    semanas: [...principal.semanas, ...semanasNuevas],
  };
  await upsertRegistro(fusionado);
  for (const r of otros) {
    await deleteRegistro(r.id);
  }
  return { conservado: principal.id, eliminados: otros.map((r) => r.id), semanas: semanasNuevas.length };
}

export async function deleteRegistro(id: string): Promise<void> {
  const { error } = await supabase.from("registros").delete().eq("id", id);
  if (error) throw error;
}

// ===== Migración asistida desde localStorage =====
const REG_KEY = "registros:v1";

export function getLocalRegistros(): Registro[] {
  return loadJSON<Registro[]>(REG_KEY, []);
}

export async function migrateLocalToCloud(): Promise<{ registros: number; semanas: number }> {
  const local = getLocalRegistros();
  let regs = 0, sems = 0;
  for (const r of local) {
    await upsertRegistro(r);
    regs += 1;
    sems += r.semanas.length;
  }
  return { registros: regs, semanas: sems };
}

export function clearLocalRegistros() {
  removeKey(REG_KEY);
}

// ===== Utilidad para gráficas =====
export function flattenLecturas(
  semanas: Semana[],
  campo: "lecturas" | "lecturas_hr" = "lecturas",
): { t: number; label: string; value: number; edited?: boolean }[] {
  const idxDia: Record<Dia, number> = {
    Lunes: 0, Martes: 1, Miércoles: 2, Jueves: 3, Viernes: 4, Sábado: 5, Domingo: 6,
  };
  const idxTurno: Record<Turno, number> = { "Mañana": 0, "Media tarde": 1, Tarde: 2 };
  const out: { t: number; label: string; value: number; edited?: boolean }[] = [];
  for (const s of semanas) {
    const base = new Date(s.semana_inicio + "T08:00:00");
    const arr = (s as Semana)[campo] ?? [];
    for (const p of arr) {
      if (p.valor == null || !Number.isFinite(p.valor)) continue;
      const d = new Date(base);
      d.setDate(d.getDate() + idxDia[p.dia]);
      d.setHours(8 + idxTurno[p.turno] * 4);
      out.push({
        t: d.getTime(),
        label: `${p.dia.slice(0, 3)} ${p.turno} ${s.semana_inicio}`,
        value: p.valor,
        edited: p._edited,
      });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
