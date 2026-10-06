import { describe, it, expect } from "vitest";
import {
  cartaXbarR, limitesAlertaAccion, limitesDesdeParametros, suficienciaMuestra, capacidad, normalidad,
  senalesFueraDeControl, dictamen, subgruposPorDia, TEXTO_INVESTIGAR_CAUSA_ESPECIAL,
} from "../estadistica-pno";
import { descriptive } from "../statistics";
import real from "./fixtures/ins-cmb-03-t-q1-2025.json";

describe("cartaXbarR", () => {
  const sub = [[20, 21, 22], [21, 21.5, 20.5], [19.8, 20.6, 21.2], [22, 21, 20], [20.5, 20.9, 21.4], [7]];
  const c = cartaXbarR(sub)!;
  it("usa n=3 y descarta el subgrupo de 1 lectura", () => {
    expect(c.tamano).toBe(3);
    expect(c.descartados).toEqual([{ indice: 5, motivo: "Subgrupo con 1 lectura" }]);
  });
  it("LCS = X̄̄ + 1.023·R̄ y σcp = R̄/1.693", () => {
    expect(c.LCSx).toBeCloseTo(c.xbarbar + 1.023 * c.Rbar, 10);
    expect(c.LCIx).toBeCloseTo(c.xbarbar - 1.023 * c.Rbar, 10);
    expect(c.sigmaCortoPlazo).toBeCloseTo(c.Rbar / 1.693, 10);
    expect(c.LCSr).toBeCloseTo(2.574 * c.Rbar, 10);
  });
});

describe("limites alerta/acción", () => {
  it("recorta LAcI a LIE y ajusta alerta en spec unilateral inferior (9.3.7/9.3.8)", () => {
    const l = limitesAlertaAccion([10, 14, 18, 12, 16], { lie: 10 })!;
    expect(l.recortadoPorSpec.LAcI).toBe(true);
    expect(l.LAcI).toBe(10);
    expect(l.alertaAjustada).toBe(true);
    expect(l.LAI).toBeCloseTo(10 + 0.5 * (14 - 10));
  });
  it("corrección 1: HR spec 30–65, μ=45, s=12.6 → alerta nunca fuera de acción", () => {
    const l = limitesDesdeParametros(45, 12.6, { lie: 30, lse: 65 });
    expect(l.LAcI).toBe(30);
    expect(l.LAcS).toBe(65);
    expect(l.LAI).toBeCloseTo(30 + 0.5 * (45 - 30)); // 37.5, antes 19.8
    expect(l.LAS).toBeCloseTo(65 - 0.5 * (65 - 45)); // 55
    expect(l.LAI).toBeGreaterThan(l.LAcI);
    expect(l.LAS).toBeLessThan(l.LAcS);
    expect(l.alertaAjustada).toBe(true);
  });
  it("corrección 3: spec solo superior (conductividad máx.) aplica 9.3.8 en espejo", () => {
    const l = limitesDesdeParametros(1.0, 0.3, { lse: 1.3 });
    expect(l.LAcS).toBe(1.3);
    expect(l.LAS).toBeCloseTo(1.3 - 0.5 * (1.3 - 1.0));
    expect(l.LAI).toBeCloseTo(1.0 - 0.6); // lado inferior sin spec intacto
    expect(l.alertaAjustada).toBe(true);
  });
  it("sin recorte no ajusta la alerta", () => {
    const l = limitesDesdeParametros(21, 0.5, { lie: 18, lse: 25 });
    expect(l.alertaAjustada).toBe(false);
    expect(l.LAI).toBeCloseTo(20);
  });
});

it("suficienciaMuestra", () => {
  expect(suficienciaMuestra(25)).toBe("Suficiente");
  expect(suficienciaMuestra(22)).toBe("Aceptable");
  expect(suficienciaMuestra(10)).toMatch(/Insuficiente/);
});

it("capacidad bilateral", () => {
  const c = capacidad({ media: 21.5, sigmaCP: 0.5, sigmaLP: 0.6, lie: 18, lse: 25 });
  expect(c.Cpk).toBeCloseTo(3.5 / 1.5);
  expect(c.etiquetaCpk).toBe("Capaz");
});

it("capacidad sin subgrupos: no calcula Cp/Cpk, sí Pp/Ppk", () => {
  const c = capacidad({ media: 21.5, sigmaLP: 0.6, lie: 18, lse: 25 });
  expect(c.Cp).toBeNull();
  expect(c.Cpk).toBeNull();
  expect(c.Ppk).toBeCloseTo(3.5 / 1.8);
});

it("normalidad detecta datos normales", () => {
  const v = [-1.5, -1.1, -0.8, -0.5, -0.3, -0.1, 0, 0.1, 0.3, 0.5, 0.8, 1.1, 1.5, -0.2, 0.2, 0.6, -0.6];
  expect(normalidad(v)!.normal).toBe(true);
});

describe("Nelson 5", () => {
  it("corrección 2: 6 puntos consecutivos (5 incrementos) → 1 señal", () => {
    const s = senalesFueraDeControl([1, 2, 3, 4, 5, 6], 3.5, 10).filter((x) => x.rule === 5);
    expect(s).toHaveLength(1);
  });
  it("5 puntos no disparan", () => {
    expect(senalesFueraDeControl([1, 2, 3, 4, 5], 3, 10).filter((x) => x.rule === 5)).toHaveLength(0);
  });
});

describe("dictamen", () => {
  const spec = { lie: 18, lse: 25 };
  const limites = { LAS: 21, LAI: 19, LAcS: 22, LAcI: 18 };
  it("solo reglas 2–6 → BAJO CONTROL CON ALERTAS + CUMPLE", () => {
    const v = [20, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6];
    const d = dictamen({ valores: v, spec, limites, senales: senalesFueraDeControl(v, 20.3, 0.2), cpk: 2 });
    expect(d.estadoControl).toBe("BAJO CONTROL CON ALERTAS");
    expect(d.cumplimientoEspecificacion).toBe("CUMPLE");
    expect(d.requiereInvestigacion).toBe(false);
  });
  it("punto fuera de ±3σ dentro de especificación → FUERA DE CONTROL + CUMPLE", () => {
    const v = [20, 20.1, 19.9, 20, 20.05, 21.9]; // 21.9 > μ+3σ (σ=0.3), < LAcS 22 y < LSE 25
    const senales = senalesFueraDeControl(v, 20, 0.3);
    expect(senales.some((s) => s.rule === 1)).toBe(true);
    const d = dictamen({ valores: v, spec, limites, senales, cpk: 1.5 });
    expect(d.estadoControl).toBe("FUERA DE CONTROL");
    expect(d.cumplimientoEspecificacion).toBe("CUMPLE");
    expect(d.requiereInvestigacion).toBe(true);
    expect(d.motivos).toContain(TEXTO_INVESTIGAR_CAUSA_ESPECIAL);
  });
  it("fuera de LCS/LCI → FUERA DE CONTROL", () => {
    const v = [20, 20.2, 20.9];
    const d = dictamen({ valores: v, spec, limites, senales: [], control: { LCS: 20.8, LCI: 19.2 } });
    expect(d.estadoControl).toBe("FUERA DE CONTROL");
  });
  it("fuera de especificación → NO CUMPLE + requiere investigación", () => {
    const v = [20, 20.5, 25.4];
    const d = dictamen({ valores: v, spec, limites: { ...limites, LAcS: 26, LAS: 26 }, senales: [] });
    expect(d.cumplimientoEspecificacion).toBe("NO CUMPLE");
    expect(d.requiereInvestigacion).toBe(true);
    expect(d.motivos).not.toContain(TEXTO_INVESTIGAR_CAUSA_ESPECIAL);
  });
  it("Cpk < 1.33 se anota sin cambiar estadoControl", () => {
    const d = dictamen({ valores: [20, 20.1, 19.9], spec, limites, senales: [], cpk: 1.1 });
    expect(d.estadoControl).toBe("BAJO CONTROL");
    expect(d.motivos).toContain("Cpk < 1.33");
  });
});

describe("corrección 4 — subgrupo racional = día (Mañana/Media tarde/Tarde)", () => {
  it("reproduce la referencia INS-CMB-03 T Q1-2025 (X̄̄ 22.109, R̄ 1.662, spec 18–25)", () => {
    const xbb = 22.109, Rbar = 1.662, sigmaCP = Rbar / 1.693;
    expect(xbb + 1.023 * Rbar).toBeCloseTo(23.809, 3);
    expect(xbb - 1.023 * Rbar).toBeCloseTo(20.409, 2);
    expect(sigmaCP).toBeCloseTo(0.982, 3);
    const cap = capacidad({ media: xbb, sigmaCP, sigmaLP: 1.178, lie: 18, lse: 25 });
    expect(cap.Cp!).toBeCloseTo(1.188, 3);
    expect(cap.Cpk!).toBeCloseTo(0.982, 3);
    expect(cap.Ppk!).toBeCloseTo(0.818, 3);
  });
  it("datos guardados de INS-CMB-03 (semanas que inician en Q1-2025)", () => {
    const sg = subgruposPorDia(real.semanas as any);
    const c = cartaXbarR(sg)!;
    const s = descriptive(sg.flat())!.stdev;
    const cap = capacidad({ media: c.xbarbar, sigmaCP: c.sigmaCortoPlazo, sigmaLP: s, lie: real.lie, lse: real.lse });
    expect(c.tamano).toBe(3);
    expect(c.subgrupos).toHaveLength(63);
    expect(c.xbarbar).toBeCloseTo(20.733, 3);
    expect(c.Rbar).toBeCloseTo(1.257, 3);
    expect(c.sigmaCortoPlazo).toBeCloseTo(0.743, 3);
    expect(cap.Cpk!).toBeCloseTo(1.227, 3);
    expect(cap.Ppk!).toBeCloseTo(0.980, 3);
  });
});
