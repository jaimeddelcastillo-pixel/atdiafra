import { describe, it, expect } from "vitest";
import {
  cartaXbarR, limitesAlertaAccion, suficienciaMuestra, capacidad, normalidad,
  senalesFueraDeControl, dictamen,
} from "../estadistica-pno";

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

describe("limitesAlertaAccion", () => {
  it("recorta LAcI a LIE y ajusta alerta en spec unilateral (9.3.7/9.3.8)", () => {
    const l = limitesAlertaAccion([10, 14, 18, 12, 16], { lie: 10 })!;
    expect(l.recortadoPorSpec.LAcI).toBe(true);
    expect(l.LAcI).toBe(10);
    expect(l.alertaAjustada).toBe(true);
    expect(l.LAI).toBeCloseTo(10 + 0.5 * (14 - 10));
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

it("normalidad detecta datos normales", () => {
  const v = [-1.5, -1.1, -0.8, -0.5, -0.3, -0.1, 0, 0.1, 0.3, 0.5, 0.8, 1.1, 1.5, -0.2, 0.2, 0.6, -0.6];
  expect(normalidad(v)!.normal).toBe(true);
});

it("Nelson 5 y dictamen", () => {
  const v = [20, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6];
  const s = senalesFueraDeControl(v, 20.3, 0.2);
  expect(s.some((x) => x.rule === 5)).toBe(true);
  const d = dictamen({ valores: v, spec: { lie: 18, lse: 25 }, limites: { LAS: 21, LAI: 19, LAcS: 22, LAcI: 18 }, senales: s, cpk: 2 });
  expect(d.dictamen).toBe("BAJO CONTROL CON ALERTAS");
});
