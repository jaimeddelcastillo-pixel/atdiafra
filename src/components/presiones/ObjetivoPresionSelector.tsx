// Selector unificado para Presiones: 3 botones (Par de cuartos / Instrumento / Filtro HEPA).
// - Par de cuartos → lista objetivos_presion (tipo par_cuartos).
// - Instrumento (manómetro) → lista catálogo de instrumentos tipo manometro_diferencial / otro.
// - Filtro HEPA → lista catálogo de instrumentos tipo manometro_filtro.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ObjetivoPresion, describirLimite } from "@/lib/objetivos-presion";
import { AreaClasificada, Instrumento } from "@/lib/catalogos";

export type SeleccionPresionTipo = "par_cuartos" | "instrumento" | "filtro_hepa";

export interface SeleccionPresion {
  tipo: SeleccionPresionTipo;
  /** Para par_cuartos: id de objetivo. Para instrumento/filtro: id del instrumento. */
  id: string;
}

interface Props {
  value: SeleccionPresion | null;
  objetivos: ObjetivoPresion[];
  areas: AreaClasificada[];
  instrumentos: Instrumento[];
  onChange: (sel: SeleccionPresion | null) => void;
}

const TIPO_LABEL: Record<SeleccionPresionTipo, string> = {
  par_cuartos: "Par de cuartos",
  instrumento: "Instrumento (manómetro)",
  filtro_hepa: "Filtro HEPA",
};

export function ObjetivoPresionSelector({ value, objetivos, areas, instrumentos, onChange }: Props) {
  const [tipo, setTipo] = useState<SeleccionPresionTipo>(value?.tipo ?? "par_cuartos");

  const areaCodigo = (id: string | null) => (id ? areas.find((a) => a.id === id)?.codigo ?? "?" : "?");
  const instCodigo = (id: string | null) => (id ? instrumentos.find((x) => x.id === id)?.codigo ?? "—" : "—");

  const areaNombreInst = (instId: string | null) => {
    if (!instId) return null;
    const i = instrumentos.find((x) => x.id === instId);
    if (!i) return null;
    if (i.area_id) return areas.find((a) => a.id === i.area_id)?.nombre ?? null;
    return i.area_libre ?? null;
  };

  const opciones = useMemo(() => {
    if (tipo === "par_cuartos") {
      return objetivos.filter((o) => o.activo).map((o) => {
        const inst = instCodigo(o.instrumento_id);
        const areaInst = areaNombreInst(o.instrumento_id);
        const instLabel = areaInst ? `${inst} · ${areaInst}` : inst;
        return {
          id: o.id,
          label: `${areaCodigo(o.cuarto_x_id)} vs ${areaCodigo(o.cuarto_y_id)} · ${instLabel} · ${describirLimite(o)}`,
        };
      });
    }
    const filtroTipo = tipo === "filtro_hepa" ? "manometro_filtro" : null;
    return instrumentos
      .filter((i) => {
        if (!i.activo) return false;
        if (filtroTipo) return i.tipo === filtroTipo;
        // instrumento (manómetro) → diferenciales y otros, NO los de filtro HEPA
        return i.tipo === "manometro_diferencial" || i.tipo === "otro";
      })
      .map((i) => {
        const limites: string[] = [];
        if (i.lie_pa != null) limites.push(`≥${i.lie_pa}`);
        if (i.lse_pa != null) limites.push(`≤${i.lse_pa}`);
        const lim = limites.length ? ` · ${limites.join(" / ")} Pa` : "";
        const areaNombre = i.area_id
          ? (areas.find((a) => a.id === i.area_id)?.nombre ?? null)
          : (i.area_libre ?? null);
        const areaTxt = areaNombre ? ` · ${areaNombre}` : "";
        return { id: i.id, label: `${i.codigo}${areaTxt}${lim}` };
      });
  }, [tipo, objetivos, instrumentos, areas]);

  const selectedId = value?.tipo === tipo ? value.id : "";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-md border border-input bg-background p-1">
        {(Object.keys(TIPO_LABEL) as SeleccionPresionTipo[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTipo(t); onChange(null); }}
            className={`text-[11px] py-1.5 rounded transition-colors ${
              tipo === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {TIPO_LABEL[t]}
          </button>
        ))}
      </div>

      <select
        value={selectedId}
        onChange={(e) => {
          const id = e.target.value;
          onChange(id ? { tipo, id } : null);
        }}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">— Selecciona {TIPO_LABEL[tipo].toLowerCase()} —</option>
        {opciones.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>

      {opciones.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No hay {TIPO_LABEL[tipo].toLowerCase()} cargados.{" "}
          {tipo === "par_cuartos" ? "Da de alta pares en " : "Da de alta instrumentos en "}
          <Link to="/configuracion" className="text-primary hover:underline">Configuración</Link>.
        </p>
      )}
    </div>
  );
}
