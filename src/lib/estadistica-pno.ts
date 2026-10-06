// Motor estadístico conforme a PNO-VAL-16 (alimenta FOR-VAL-16-02).
// Extiende src/lib/statistics.ts sin modificarlo.
import { descriptive, westernElectric } from "./statistics";

export interface DescriptivaPNO {
  n: number; media: number; mediana: number; s: number; min: number; max: number;
  rango: number; cv: number | null; p5: number; p95: number; asimetria: number; curtosis: number;
}

export function descriptivaPNO(valores: number[]): DescriptivaPNO | null {
  const d = descriptive(valores);
  if (!d) return null;
  return {
    n: d.n, media: d.mean, mediana: d.median, s: d.stdev, min: d.min, max: d.max,
    rango: d.range, cv: d.mean !== 0 ? (d.stdev / Math.abs(d.mean)) * 100 : null,
    p5: d.p5, p95: d.p95, asimetria: d.skewness, curtosis: d.kurtosis,
  };
}

export interface Spec { lie?: number | null; lse?: number | null }

export interface LimitesAlertaAccion {
  media: number; s: number;
  LAS: number; LAI: number; LAcS: number; LAcI: number;
  recortadoPorSpec: { LAcS: boolean; LAcI: boolean };
  alertaAjustada: boolean;
}

export function limitesAlertaAccion(valores: number[], spec: Spec = {}): LimitesAlertaAccion | null {
  const d = descriptive(valores);
  if (!d) return null;
  const { mean: m, stdev: s } = d;
  const lie = spec.lie ?? null, lse = spec.lse ?? null;
  let LAS = m + 2 * s, LAI = m - 2 * s, LAcS = m + 3 * s, LAcI = m - 3 * s;
  const rec = { LAcS: false, LAcI: false };
  // PNO 9.3.7
  if (lie != null && LAcI < lie) { LAcI = lie; rec.LAcI = true; }
  if (lse != null && LAcS > lse) { LAcS = lse; rec.LAcS = true; }
  // PNO 9.3.8 — especificación de un solo lado inferior
  let alertaAjustada = false;
  if (lie != null && lse == null && LAI < lie) {
    LAI = lie + 0.5 * (m - lie);
    alertaAjustada = true;
  }
  return { media: m, s, LAS, LAI, LAcS, LAcI, recortadoPorSpec: rec, alertaAjustada };
}

// Constantes de carta X̄-R para n = 2..5
export const CONSTANTES_XR: Record<number, { A2: number; D3: number; D4: number; d2: number }> = {
  2: { A2: 1.88, D3: 0, D4: 3.267, d2: 1.128 },
  3: { A2: 1.023, D3: 0, D4: 2.574, d2: 1.693 },
  4: { A2: 0.729, D3: 0, D4: 2.282, d2: 2.059 },
  5: { A2: 0.577, D3: 0, D4: 2.114, d2: 2.326 },
};

export interface CartaXbarR {
  tamano: number;
  subgrupos: { indice: number; xbar: number; R: number }[];
  descartados: { indice: number; motivo: string }[];
  xbarbar: number; Rbar: number;
  LCSx: number; LCIx: number; LCSr: number; LCIr: number;
  sigmaCortoPlazo: number; sigmaLargoPlazo: number;
}

export function cartaXbarR(subgrupos: number[][]): CartaXbarR | null {
  const limpios = subgrupos.map((g) => g.filter((x) => Number.isFinite(x)));
  const freq = new Map<number, number>();
  limpios.forEach((g) => { if (g.length >= 2 && g.length <= 5) freq.set(g.length, (freq.get(g.length) ?? 0) + 1); });
  if (freq.size === 0) return null;
  const tamano = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const c = CONSTANTES_XR[tamano];
  const usados: { indice: number; xbar: number; R: number }[] = [];
  const descartados: { indice: number; motivo: string }[] = [];
  const todos: number[] = [];
  limpios.forEach((g, i) => {
    if (g.length < 2) { descartados.push({ indice: i, motivo: g.length === 1 ? "Subgrupo con 1 lectura" : "Subgrupo vacío" }); return; }
    if (g.length !== tamano) { descartados.push({ indice: i, motivo: `Tamaño ${g.length} ≠ ${tamano}` }); return; }
    usados.push({ indice: i, xbar: g.reduce((a, b) => a + b, 0) / g.length, R: Math.max(...g) - Math.min(...g) });
    todos.push(...g);
  });
  const k = usados.length;
  const xbarbar = usados.reduce((a, u) => a + u.xbar, 0) / k;
  const Rbar = usados.reduce((a, u) => a + u.R, 0) / k;
  return {
    tamano, subgrupos: usados, descartados, xbarbar, Rbar,
    LCSx: xbarbar + c.A2 * Rbar, LCIx: xbarbar - c.A2 * Rbar,
    LCSr: c.D4 * Rbar, LCIr: c.D3 * Rbar,
    sigmaCortoPlazo: Rbar / c.d2,
    sigmaLargoPlazo: descriptive(todos)?.stdev ?? 0,
  };
}

export type EtiquetaCapacidad = "Capaz" | "Marginal" | "No capaz" | "N/D";
export const etiquetaCapacidad = (v: number | null): EtiquetaCapacidad =>
  v == null || !Number.isFinite(v) ? "N/D" : v >= 1.33 ? "Capaz" : v >= 1 ? "Marginal" : "No capaz";

export interface Capacidad {
  Cp: number | null; Cps: number | null; Cpi: number | null; Cpk: number | null;
  Pp: number | null; Ppk: number | null;
  etiquetaCpk: EtiquetaCapacidad; etiquetaPpk: EtiquetaCapacidad; referencial: boolean;
}

export function capacidad(p: { media: number; sigmaCP: number; sigmaLP: number; lie?: number | null; lse?: number | null; normal?: boolean }): Capacidad {
  const { media: m, sigmaCP: sc, sigmaLP: sl } = p;
  const lie = p.lie ?? null, lse = p.lse ?? null;
  const ok = (s: number) => Number.isFinite(s) && s > 0;
  const Cps = lse != null && ok(sc) ? (lse - m) / (3 * sc) : null;
  const Cpi = lie != null && ok(sc) ? (m - lie) / (3 * sc) : null;
  const Cp = lie != null && lse != null && ok(sc) ? (lse - lie) / (6 * sc) : null;
  const Cpk = Cps != null && Cpi != null ? Math.min(Cps, Cpi) : Cps ?? Cpi;
  const Pps = lse != null && ok(sl) ? (lse - m) / (3 * sl) : null;
  const Ppi = lie != null && ok(sl) ? (m - lie) / (3 * sl) : null;
  const Pp = lie != null && lse != null && ok(sl) ? (lse - lie) / (6 * sl) : null;
  const Ppk = Pps != null && Ppi != null ? Math.min(Pps, Ppi) : Pps ?? Ppi;
  return { Cp, Cps, Cpi, Cpk, Pp, Ppk, etiquetaCpk: etiquetaCapacidad(Cpk), etiquetaPpk: etiquetaCapacidad(Ppk), referencial: p.normal === false };
}

// Φ normal estándar (Abramowitz–Stegun 7.1.26)
function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export interface Normalidad { n: number; A2: number; A2ajustado: number; p: number; normal: boolean; conclusion: string }

export function normalidad(valores: number[], alfa = 0.05): Normalidad | null {
  const v = valores.filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  const d = descriptive(v);
  if (!d || n < 3 || d.stdev === 0) return null;
  const eps = 1e-12;
  let S = 0;
  for (let i = 0; i < n; i++) {
    const Fi = Math.min(1 - eps, Math.max(eps, normCdf((v[i] - d.mean) / d.stdev)));
    const Fj = Math.min(1 - eps, Math.max(eps, normCdf((v[n - 1 - i] - d.mean) / d.stdev)));
    S += (2 * i + 1) * (Math.log(Fi) + Math.log(1 - Fj));
  }
  const A2 = -n - S / n;
  const A = A2 * (1 + 0.75 / n + 2.25 / (n * n));
  let p: number;
  if (A >= 0.6) p = Math.exp(1.2937 - 5.709 * A + 0.0186 * A * A);
  else if (A >= 0.34) p = Math.exp(0.9177 - 4.279 * A - 1.38 * A * A);
  else if (A >= 0.2) p = 1 - Math.exp(-8.318 + 42.796 * A - 59.938 * A * A);
  else p = 1 - Math.exp(-13.436 + 101.14 * A - 223.73 * A * A);
  p = Math.min(1, Math.max(0, p));
  const normal = p >= alfa;
  return { n, A2, A2ajustado: A, p, normal, conclusion: `${normal ? "Normal" : "No normal"} (α=${alfa})` };
}

export interface Senal { index: number; rule: 1 | 2 | 3 | 4 | 5 | 6; description: string }

export function senalesFueraDeControl(valores: number[], media: number, sigma: number): Senal[] {
  const out: Senal[] = [...westernElectric(valores, media, sigma)];
  if (!Number.isFinite(sigma) || sigma === 0) return out;
  for (let i = 6; i < valores.length; i++) {
    const w = valores.slice(i - 6, i + 1);
    const diffs = w.slice(1).map((x, k) => x - w[k]);
    if (diffs.every((d) => d > 0) || diffs.every((d) => d < 0))
      out.push({ index: i, rule: 5, description: "6 puntos consecutivos ascendentes o descendentes" });
  }
  for (let i = 13; i < valores.length; i++) {
    const w = valores.slice(i - 13, i + 1);
    const d = w.slice(1).map((x, k) => Math.sign(x - w[k]));
    if (d.every((s) => s !== 0) && d.every((s, k) => k === 0 || s !== d[k - 1]))
      out.push({ index: i, rule: 6, description: "14 puntos consecutivos alternando arriba/abajo" });
  }
  return out.sort((a, b) => a.index - b.index || a.rule - b.rule);
}

export type Suficiencia = "Suficiente" | "Aceptable" | "Insuficiente – requiere justificación técnica";
export const suficienciaMuestra = (n: number): Suficiencia =>
  n >= 25 ? "Suficiente" : n >= 20 ? "Aceptable" : "Insuficiente – requiere justificación técnica";

export type Dictamen = "BAJO CONTROL" | "BAJO CONTROL CON ALERTAS" | "FUERA DE CONTROL";

export function dictamen(p: {
  valores: number[]; spec?: Spec; limites: Pick<LimitesAlertaAccion, "LAS" | "LAI" | "LAcS" | "LAcI">;
  senales: Senal[]; cpk?: number | null;
}): { dictamen: Dictamen; motivos: string[] } {
  const lie = p.spec?.lie ?? null, lse = p.spec?.lse ?? null;
  const { LAS, LAI, LAcS, LAcI } = p.limites;
  const motivos: string[] = [];
  const fueraSpec = p.valores.filter((v) => (lie != null && v < lie) || (lse != null && v > lse)).length;
  const fueraAccion = p.valores.filter((v) => v > LAcS || v < LAcI).length;
  const regla1 = p.senales.some((s) => s.rule === 1);
  if (fueraSpec) motivos.push(`${fueraSpec} punto(s) fuera de especificación`);
  if (fueraAccion) motivos.push(`${fueraAccion} punto(s) fuera del límite de acción`);
  if (fueraSpec || fueraAccion) return { dictamen: "FUERA DE CONTROL", motivos };
  const entreAlerta = p.valores.filter((v) => v > LAS || v < LAI).length;
  const otras = p.senales.filter((s) => s.rule !== 1).length;
  if (regla1) motivos.push("Regla 1 (punto fuera de ±3σ)");
  if (entreAlerta) motivos.push(`${entreAlerta} punto(s) entre alerta y acción`);
  if (otras) motivos.push(`${otras} señal(es) de reglas 2–6`);
  if (p.cpk != null && p.cpk < 1.33) motivos.push(`Cpk ${p.cpk.toFixed(2)} < 1.33`);
  return { dictamen: motivos.length ? "BAJO CONTROL CON ALERTAS" : "BAJO CONTROL", motivos };
}
