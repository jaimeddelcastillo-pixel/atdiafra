import { describe, expect, it } from "vitest";
import {
  fraseCantidad,
  generarTexto,
  listaEs,
  nombreVariable,
  ubicacionTxt,
  type AlcanceTexto,
} from "@/lib/texto-forval16";

describe("listaEs", () => {
  it("0 elementos → cadena vacía", () => {
    expect(listaEs([])).toBe("");
  });
  it("1 elemento → sin cambios", () => {
    expect(listaEs(["INS-CMB-03"])).toBe("INS-CMB-03");
  });
  it("2 elementos → «y» antes del último", () => {
    expect(listaEs(["a", "b"])).toBe("a y b");
    expect(listaEs(["a", "b", "c"])).toBe("a, b y c");
  });
});

describe("fraseCantidad (concordancia de número)", () => {
  it("0 → numeral en plural", () => {
    expect(fraseCantidad(0, "un punto", "puntos")).toBe("0 puntos");
    expect(fraseCantidad(0, "una lectura", "lecturas")).toBe("0 lecturas");
  });
  it("1 → singular sin numeral", () => {
    expect(fraseCantidad(1, "un punto", "puntos")).toBe("un punto");
    expect(fraseCantidad(1, "una lectura", "lecturas")).toBe("una lectura");
    expect(fraseCantidad(1, "una señal", "señales")).toBe("una señal");
  });
  it(">1 → numeral en plural", () => {
    expect(fraseCantidad(2, "un punto", "puntos")).toBe("2 puntos");
    expect(fraseCantidad(2, "una lectura", "lecturas")).toBe("2 lecturas");
    expect(fraseCantidad(2, "una señal", "señales")).toBe("2 señales");
  });
});

describe("nombreVariable y ubicacionTxt", () => {
  it("nombres de variables en minúscula con % en humedad", () => {
    expect(nombreVariable("Temperatura")).toBe("temperatura");
    expect(nombreVariable("Humedad relativa")).toBe("% de humedad relativa");
    expect(nombreVariable("Presión diferencial")).toBe("presión diferencial");
  });
  it("normaliza «VS» a «vs»", () => {
    expect(ubicacionTxt("Cuarto A VS Cuarto B")).toBe("Cuarto A vs Cuarto B");
  });
});

describe("generarTexto — alcance", () => {
  const cobertura = { primera: null, ultima: null };
  const hvac: AlcanceTexto = {
    tipo: "hvac",
    codigo: "SIS-UH-01",
    nombreUma: "UMA-01 Agua helada",
    descripcion: "Manejo de aire para áreas de producción",
  };
  const libres: AlcanceTexto = { tipo: "instrumentos", codigos: ["INS-CMB-03", "INS-CMB-11", "INS-PRO-16"] };

  it("sistema HVAC: aplica al sistema con nombre UMA y descripción", () => {
    const t = generarTexto([], cobertura, hvac);
    expect(t.alcance).toContain("aplica al sistema HVAC SIS-UH-01 UMA-01 Agua helada (Manejo de aire para áreas de producción)");
  });
  it("selección libre: lista de instrumentos con «y» antes del último", () => {
    const t = generarTexto([], cobertura, libres);
    expect(t.alcance).toContain("aplica a los instrumentos INS-CMB-03, INS-CMB-11 y INS-PRO-16");
  });
  it("selección vacía: texto genérico y variables «ninguna»", () => {
    const t = generarTexto([], cobertura, { tipo: "instrumentos", codigos: [] });
    expect(t.alcance).toContain("aplica a los instrumentos seleccionados");
    expect(t.alcance).toContain("Variables analizadas: ninguna.");
  });
});

import { fraseEstacional } from "../texto-forval16";
describe("fraseEstacional", () => {
  const P = (fecha: string, sen = false) => ({ fecha, reglas: sen ? ["Regla 2"] : [] });
  it("detecta concentración al final del periodo", () => {
    const pts = [P("2025-01-10"), P("2025-02-10", true), P("2025-03-03", true), P("2025-03-10", true), P("2025-03-20", true)];
    expect(fraseEstacional(pts)).toBe("Se observa un desplazamiento de la media en marzo; evaluar influencia estacional (PNO-VAL-16 8.8).");
  });
  it("no aplica si el mes está a mitad del periodo o no supera 60 %", () => {
    expect(fraseEstacional([P("2025-01-10"), P("2025-02-03", true), P("2025-02-10", true), P("2025-03-20")])).toBeNull();
    expect(fraseEstacional([P("2025-01-10", true), P("2025-02-10", true), P("2025-03-20")])).toBeNull();
  });
});
