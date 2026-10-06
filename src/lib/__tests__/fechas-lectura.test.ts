import { it, expect } from "vitest";
import { fechaRealISO, recortarSemanasPorFecha, coberturaReal, esLecturaUtil } from "../fechas-lectura";

const p = (dia: string, valor: number | null, _na = false) => ({ dia, turno: "Mañana", valor, _na });
const semana = { semana_inicio: "2024-12-30", lecturas: [p("Lunes", 20), p("Martes", 21), p("Miércoles", 22), p("Jueves", 23), p("Sábado", 24, true), p("Domingo", null, true)] };

it("fecha real = semana_inicio + offset", () => {
  expect(fechaRealISO("2024-12-30", "Miércoles")).toBe("2025-01-01");
  expect(fechaRealISO("2025-03-31", "Domingo")).toBe("2025-04-06");
});

it("una semana que cruza el año solo aporta los días del periodo", () => {
  const r = recortarSemanasPorFecha([semana], "2025-01-01", "2025-03-31");
  expect(r[0].lecturas.map((x) => x.dia)).toEqual(["Miércoles", "Jueves", "Sábado", "Domingo"]);
  expect(recortarSemanasPorFecha([semana], "2024-12-01", "2024-12-31")[0].lecturas.map((x) => x.dia)).toEqual(["Lunes", "Martes"]);
});

it("sábado/domingo con valor cuentan aunque traigan N/A por defecto", () => {
  expect(esLecturaUtil(p("Sábado", 24, true))).toBe(true);
  expect(esLecturaUtil(p("Lunes", 24, true))).toBe(false);
  const c = coberturaReal(recortarSemanasPorFecha([semana], "2025-01-01", "2025-03-31"));
  expect(c).toEqual({ primera: "2025-01-01", ultima: "2025-01-04", dias: 3 });
});
