// Modelo de Registro/Semana 7 días × 3 turnos para los módulos T/HR, Filtros y Presiones.
import { loadJSON, saveJSON } from "./storage";

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const TURNOS = ["Mañana", "Media tarde", "Tarde"] as const;

export type Dia = (typeof DIAS)[number];
export type Turno = (typeof TURNOS)[number];

export interface PuntoLectura {
  dia: Dia;
  turno: Turno;
  // Para T/HR la "lectura" guarda valor unico; en T/HR usaremos dos lecturas paralelas (T y HR) en arreglos separados de semana
  valor: number | null;
  hora: string | null;
  quien: string | null;
  _edited?: boolean;
  _motivo?: string;
}

export interface Semana {
  id: string;
  semana_inicio: string; // YYYY-MM-DD lunes
  mes: string;
  anio: string;
  unidad: string;
  // Para T/HR: usamos lecturas_t y lecturas_hr; para otros módulos solo lecturas
  lecturas: PuntoLectura[];           // 21 items
  lecturas_hr?: PuntoLectura[];        // 21 items, opcional (T/HR)
  observaciones: string;
  source: "imagen" | "manual";
  saved_at: string;
}

export type Modulo = "filtros" | "temphr" | "presiones" | "agua";

export interface Registro {
  id: string;
  modulo: Modulo;
  nombre: string;
  // referencias a catálogos (uuid)
  instrumento_id?: string | null;
  par_cuartos_id?: string | null;
  hvac_id?: string | null;
  etapa?: string | null;
  area_id?: string | null;
  // Para T/HR: campos libres adicionales
  codigo_area_libre?: string | null;
  nombre_area_libre?: string | null;
  iso?: string | null;
  // límites de spec (T/HR usa par doble en lse_t/lie_t/lse_hr/lie_hr)
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

const REG_KEY = "registros:v1";

export function listRegistros(modulo?: Modulo): Registro[] {
  const all = loadJSON<Registro[]>(REG_KEY, []);
  return modulo ? all.filter((r) => r.modulo === modulo) : all;
}
export function saveRegistros(rs: Registro[]) {
  saveJSON(REG_KEY, rs);
}
export function upsertRegistro(r: Registro) {
  const all = listRegistros();
  const idx = all.findIndex((x) => x.id === r.id);
  if (idx >= 0) all[idx] = r;
  else all.push(r);
  saveRegistros(all);
}
export function deleteRegistro(id: string) {
  saveRegistros(listRegistros().filter((r) => r.id !== id));
}
export function getRegistro(id: string): Registro | null {
  return listRegistros().find((r) => r.id === id) ?? null;
}

/** Crea una semana vacía con 21 puntos (7×3). Si esTHR, también lecturas_hr. */
export function semanaVacia(opts: { semana_inicio: string; mes: string; anio: string; unidad: string; esTHR?: boolean }): Semana {
  const make = (): PuntoLectura[] =>
    DIAS.flatMap((dia) => TURNOS.map((turno) => ({ dia, turno, valor: null, hora: null, quien: null })));
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

/** Devuelve el lunes (YYYY-MM-DD) de la semana de la fecha dada. */
export function lunesDe(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun..6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function nombreMes(date: Date = new Date()): string {
  return date.toLocaleDateString("es-MX", { month: "long" });
}

/** Aplana lecturas de muchas semanas en una serie ordenada con timestamp aproximado para gráficas. */
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
      d.setHours(8 + idxTurno[p.turno] * 4); // 08, 12, 16
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
