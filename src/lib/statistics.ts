// Librería estadística para análisis de tendencias
// Estadística descriptiva, capacidad de proceso (Cp/Cpk/Pp/Ppk),
// y reglas Western Electric para control Shewhart.

export interface DescriptiveStats {
  n: number;
  mean: number;
  median: number;
  stdev: number;        // s (muestral, n-1) — usar para Pp/Ppk
  min: number;
  max: number;
  range: number;
  p5: number;
  p95: number;
  skewness: number;
  kurtosis: number;     // exceso (normal = 0)
}

export function descriptive(values: number[]): DescriptiveStats | null {
  const v = values.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (n === 0) return null;
  const sorted = [...v].sort((a, b) => a - b);
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = n > 1 ? v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
  const stdev = Math.sqrt(variance);
  const pct = (p: number) => {
    if (n === 1) return sorted[0];
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  // Asimetría y curtosis (muestrales)
  const m3 = v.reduce((s, x) => s + (x - mean) ** 3, 0) / n;
  const m4 = v.reduce((s, x) => s + (x - mean) ** 4, 0) / n;
  const sigmaPop = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / n) || 1e-12;
  const skewness = m3 / sigmaPop ** 3;
  const kurtosis = m4 / sigmaPop ** 4 - 3;
  return {
    n, mean, median, stdev,
    min: sorted[0], max: sorted[n - 1], range: sorted[n - 1] - sorted[0],
    p5: pct(5), p95: pct(95), skewness, kurtosis,
  };
}

export interface CapabilityIndices {
  Cp: number | null;     // potencial (sigma corto plazo aprox = s/d2 con n=2 → usamos R̄/d2 con subgrupos; aquí simplificado: usamos s)
  Cpk: number | null;
  Pp: number | null;     // largo plazo (s muestral)
  Ppk: number | null;
  withinSpec: number;    // % observaciones dentro de [LSL, USL]
}

/**
 * Capacidad de proceso. Si solo hay un límite (LSL o USL), Cp/Pp = null y solo se calcula el lado correspondiente.
 * Para datos individuales (sin subgrupos) usamos s muestral como estimador único, por lo tanto Cp ≈ Pp y Cpk ≈ Ppk.
 * Esto es la aproximación habitual cuando no se tienen subgrupos racionales.
 */
export function capability(
  values: number[],
  LSL: number | null,
  USL: number | null,
): CapabilityIndices {
  const stats = descriptive(values);
  if (!stats || stats.stdev === 0) return { Cp: null, Cpk: null, Pp: null, Ppk: null, withinSpec: 0 };
  const { mean, stdev } = stats;
  const sixSigma = 6 * stdev;
  let Cp: number | null = null, Cpk: number | null = null;
  if (LSL != null && USL != null) {
    Cp = (USL - LSL) / sixSigma;
    Cpk = Math.min((USL - mean) / (3 * stdev), (mean - LSL) / (3 * stdev));
  } else if (USL != null) {
    Cpk = (USL - mean) / (3 * stdev);
  } else if (LSL != null) {
    Cpk = (mean - LSL) / (3 * stdev);
  }
  const within = values.filter((x) => (LSL == null || x >= LSL) && (USL == null || x <= USL)).length;
  return {
    Cp, Cpk, Pp: Cp, Ppk: Cpk, withinSpec: values.length ? (within / values.length) * 100 : 0,
  };
}

export type Zone = "A_upper" | "B_upper" | "C_upper" | "C_lower" | "B_lower" | "A_lower" | "out_upper" | "out_lower";

export function zoneOf(x: number, mean: number, sigma: number): Zone {
  const z = (x - mean) / (sigma || 1e-12);
  if (z > 3) return "out_upper";
  if (z < -3) return "out_lower";
  if (z > 2) return "A_upper";
  if (z > 1) return "B_upper";
  if (z >= 0) return "C_upper";
  if (z > -1) return "C_lower";
  if (z > -2) return "B_lower";
  return "A_lower";
}

export interface WERuleHit {
  index: number;       // último punto que dispara la regla
  rule: 1 | 2 | 3 | 4;
  description: string;
}

/**
 * Reglas Western Electric (las 4 clásicas):
 * 1) Un punto fuera de ±3σ
 * 2) 2 de 3 puntos consecutivos en zona A o más allá (mismo lado)
 * 3) 4 de 5 puntos consecutivos en zona B o más allá (mismo lado)
 * 4) 8 puntos consecutivos del mismo lado de la línea central
 */
export function westernElectric(values: number[], mean: number, sigma: number): WERuleHit[] {
  const hits: WERuleHit[] = [];
  if (!Number.isFinite(sigma) || sigma === 0) return hits;
  const zs = values.map((v) => (v - mean) / sigma);
  const sideOf = (z: number) => (z > 0 ? 1 : z < 0 ? -1 : 0);

  zs.forEach((z, i) => {
    if (Math.abs(z) > 3) {
      hits.push({ index: i, rule: 1, description: "Punto fuera de ±3σ (acción)" });
    }
    if (i >= 2) {
      const win = zs.slice(i - 2, i + 1);
      for (const sign of [1, -1]) {
        const inA = win.filter((z2) => sign * z2 > 2).length;
        if (inA >= 2 && sign * z > 2) {
          hits.push({ index: i, rule: 2, description: "2 de 3 puntos en zona A" });
          break;
        }
      }
    }
    if (i >= 4) {
      const win = zs.slice(i - 4, i + 1);
      for (const sign of [1, -1]) {
        const inB = win.filter((z2) => sign * z2 > 1).length;
        if (inB >= 4 && sign * z > 1) {
          hits.push({ index: i, rule: 3, description: "4 de 5 puntos en zona B o más allá" });
          break;
        }
      }
    }
    if (i >= 7) {
      const win = zs.slice(i - 7, i + 1);
      const s = sideOf(win[0]);
      if (s !== 0 && win.every((z2) => sideOf(z2) === s)) {
        hits.push({ index: i, rule: 4, description: "8 puntos consecutivos del mismo lado de la media" });
      }
    }
  });
  // dedupe por (index, rule)
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.index}-${h.rule}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}
