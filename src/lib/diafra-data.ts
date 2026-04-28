// Datos maestros — DIAFRA S.A. de C.V.
// Conforme a NOM-241-SSA1-2025, ISO 14644 y FEUM 13ª Ed. Ref: FOR-VAL-16

export type IsoClass = "ISO-5" | "ISO-7" | "ISO-8" | "ISO-9";

export interface Etapa {
  porcentaje: string; // "35%", "65%", "95%", "85%", "99.97%"
}

export interface SistemaHVAC {
  id: string;          // EQU-PRO-16
  uma: string;         // UMA-01
  area: string;        // descripción
  etapas: string[];    // ["35%","65%","95%"]
}

export const SISTEMAS_HVAC: SistemaHVAC[] = [
  {
    id: "EQU-PRO-16",
    uma: "UMA-01",
    area: "Producción y Acondicionamiento",
    etapas: ["35%", "65%", "95%"],
  },
  {
    id: "EQU-ALM-02",
    uma: "UMA-03",
    area: "Almacén de surtido y muestreo",
    etapas: ["35%", "65%", "95%"],
  },
  {
    id: "EQU-CMB-08",
    uma: "UMA-02",
    area: "Microbiología",
    etapas: ["35%", "85%", "99.97%"],
  },
];

export interface IsoLimits {
  iso: IsoClass;
  clase?: string; // Clase C, D...
  tempMin: number;
  tempMax: number;
  hrMin: number;
  hrMax: number;
  dpMin: number; // Pa
}

export const ISO_LIMITS: Record<IsoClass, IsoLimits> = {
  "ISO-5": { iso: "ISO-5", tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65, dpMin: 15 },
  "ISO-7": { iso: "ISO-7", clase: "Clase C", tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65, dpMin: 10 },
  "ISO-8": { iso: "ISO-8", clase: "Clase D", tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65, dpMin: 5 },
  "ISO-9": { iso: "ISO-9", tempMin: 18, tempMax: 25, hrMin: 30, hrMax: 65, dpMin: 0 },
};

export interface ModuloDef {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string;
  icon: string; // lucide name
  enabled: boolean;
}

export const MODULOS: ModuloDef[] = [
  {
    id: "filtros",
    slug: "filtros",
    nombre: "Banco de filtros",
    descripcion: "Presión diferencial por etapa de filtración (35%, 65%, 95%, 99.97%).",
    icon: "Filter",
    enabled: false,
  },
  {
    id: "temp_hr",
    slug: "temperatura-humedad",
    nombre: "Temperatura y Humedad Relativa",
    descripcion: "Monitoreo de T y HR en áreas clasificadas según ISO 14644.",
    icon: "Thermometer",
    enabled: true,
  },
  {
    id: "presiones",
    slug: "presiones",
    nombre: "Presiones diferenciales",
    descripcion: "ΔP entre áreas de distinta clasificación.",
    icon: "Gauge",
    enabled: false,
  },
  {
    id: "agua",
    slug: "agua-purificada",
    nombre: "Sistema de agua purificada nivel 1",
    descripcion: "Conductividad, TOC y temperatura de loop de PW.",
    icon: "Droplets",
    enabled: false,
  },
  {
    id: "micro",
    slug: "microbiologia",
    nombre: "Análisis microbiológico",
    descripcion: "Próximamente.",
    icon: "Microscope",
    enabled: false,
  },
  {
    id: "reporte",
    slug: "reporte-consolidado",
    nombre: "Reporte consolidado",
    descripcion: "Próximamente.",
    icon: "FileText",
    enabled: false,
  },
];
