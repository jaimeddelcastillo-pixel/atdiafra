// Fecha real de cada lectura y criterio de lectura útil (incluye Sáb/Dom capturados).
const OFFSET: Record<string, number> = {
  Lunes: 0, Martes: 1, "Miércoles": 2, Jueves: 3, Viernes: 4, "Sábado": 5, Domingo: 6,
};
const FIN_DE_SEMANA = new Set(["Sábado", "Domingo"]);

/** YYYY-MM-DD de la lectura = semana_inicio + offset del día. */
export function fechaRealISO(semanaInicio: string, dia: string): string {
  const [y, m, d] = semanaInicio.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + (OFFSET[dia] ?? 0)));
  return f.toISOString().slice(0, 10);
}

/** Lectura con valor numérico. Un Sáb/Dom con valor cuenta aunque traiga la marca N/A por defecto. */
export function esLecturaUtil(p: { dia: string; valor?: number | null; _na?: boolean }): boolean {
  if (p.valor == null || !Number.isFinite(p.valor)) return false;
  return !p._na || FIN_DE_SEMANA.has(p.dia);
}

/** Recorta semanas a las lecturas cuya fecha real cae en [desde, hasta]; descarta semanas sin lecturas en rango. */
export function recortarSemanasPorFecha<
  P extends { dia: string },
  S extends { semana_inicio: string; lecturas: P[]; lecturas_hr?: P[] | null },
>(semanas: S[], desde: string, hasta: string): S[] {
  const dentro = (s: S, p: P) => { const f = fechaRealISO(s.semana_inicio, p.dia); return f >= desde && f <= hasta; };
  const out: S[] = [];
  for (const s of semanas) {
    if (fechaRealISO(s.semana_inicio, "Domingo") < desde || s.semana_inicio > hasta) continue;
    out.push({
      ...s,
      lecturas: (s.lecturas ?? []).filter((p) => dentro(s, p)),
      ...(s.lecturas_hr ? { lecturas_hr: s.lecturas_hr.filter((p) => dentro(s, p)) } : {}),
    });
  }
  return out;
}

/** Primera/última fecha con lectura útil y número de días distintos con lectura. */
export function coberturaReal<P extends { dia: string; valor?: number | null; _na?: boolean }>(
  semanas: { semana_inicio: string; lecturas: P[]; lecturas_hr?: P[] | null }[],
): { primera: string | null; ultima: string | null; dias: number } {
  const dias = new Set<string>();
  for (const s of semanas)
    for (const p of [...(s.lecturas ?? []), ...(s.lecturas_hr ?? [])])
      if (esLecturaUtil(p)) dias.add(fechaRealISO(s.semana_inicio, p.dia));
  const orden = [...dias].sort();
  return { primera: orden[0] ?? null, ultima: orden[orden.length - 1] ?? null, dias: orden.length };
}
