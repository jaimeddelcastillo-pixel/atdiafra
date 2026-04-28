export interface Reading {
  id: string;
  fecha: string | null;     // YYYY-MM-DD
  hora: string | null;      // HH:MM
  temperatura: number | null;
  humedad: number | null;
  turno?: string | null;
  operador?: string | null;
}

export interface ModuleState {
  sistemaId: string;
  iso: import("@/lib/diafra-data").IsoClass;
  readings: Reading[];
  notas?: string;
  updatedAt: string;
}
