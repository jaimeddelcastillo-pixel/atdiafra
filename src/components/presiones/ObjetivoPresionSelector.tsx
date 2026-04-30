// Selector de objetivo de presión: tipo (par / equipo / filtro) → ítem.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ObjetivoPresion, TipoObjetivoPresion, TIPO_OBJETIVO_LABEL, describirLimite,
} from "@/lib/objetivos-presion";
import { AreaClasificada, Instrumento } from "@/lib/catalogos";

interface Props {
  value: string;
  objetivos: ObjetivoPresion[];
  areas: AreaClasificada[];
  instrumentos: Instrumento[];
  onChange: (id: string, obj?: ObjetivoPresion) => void;
}

export function ObjetivoPresionSelector({ value, objetivos, areas, instrumentos, onChange }: Props) {
  const selected = objetivos.find((o) => o.id === value);
  const [tipo, setTipo] = useState<TipoObjetivoPresion>(selected?.tipo ?? "par_cuartos");

  const filtrados = useMemo(() => objetivos.filter((o) => o.tipo === tipo), [objetivos, tipo]);

  const areaCodigo = (id: string | null) => (id ? areas.find((a) => a.id === id)?.codigo ?? "?" : "?");
  const instCodigo = (id: string | null) => (id ? instrumentos.find((x) => x.id === id)?.codigo ?? "—" : "—");

  const labelObjetivo = (o: ObjetivoPresion) => {
    if (o.tipo === "par_cuartos") {
      return `${areaCodigo(o.cuarto_x_id)} vs ${areaCodigo(o.cuarto_y_id)} · ${instCodigo(o.instrumento_id)} · ${describirLimite(o)}`;
    }
    if (o.tipo === "equipo") {
      return `${o.equipo_codigo ?? o.codigo} — ${o.nombre} · ${instCodigo(o.instrumento_id)} · ${describirLimite(o)}`;
    }
    // filtro_hepa
    return `${o.codigo} · ${o.etapa ?? "etapa"} · ${instCodigo(o.instrumento_id)} · ${describirLimite(o)}`;
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-md border border-input bg-background p-1">
        {(Object.keys(TIPO_OBJETIVO_LABEL) as TipoObjetivoPresion[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTipo(t); onChange("", undefined); }}
            className={`text-[11px] py-1.5 rounded transition-colors ${
              tipo === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {TIPO_OBJETIVO_LABEL[t]}
          </button>
        ))}
      </div>

      <select
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          onChange(id, objetivos.find((o) => o.id === id));
        }}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">— Selecciona {TIPO_OBJETIVO_LABEL[tipo].toLowerCase()} —</option>
        {filtrados.map((o) => (
          <option key={o.id} value={o.id}>{labelObjetivo(o)}</option>
        ))}
      </select>

      {filtrados.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No hay {TIPO_OBJETIVO_LABEL[tipo].toLowerCase()} cargados. Administra el catálogo en{" "}
          <Link to="/configuracion" className="text-primary hover:underline">Configuración</Link>.
        </p>
      )}
    </div>
  );
}
