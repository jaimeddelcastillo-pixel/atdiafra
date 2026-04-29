import { ParCuartos, AreaClasificada, Instrumento } from "@/lib/catalogos";

interface Props {
  value: string;
  pares: ParCuartos[];
  areas: AreaClasificada[];
  instrumentos: Instrumento[];
  onChange: (id: string, par?: ParCuartos) => void;
}

/** Selector simple de par de cuartos. Cada par viene precargado del catálogo
 *  LIS-VAL-11 con su instrumento (manómetro) y áreas X/Y ya enlazados. */
export function ParCuartosSelector({ value, pares, areas, instrumentos, onChange }: Props) {
  const areaCodigo = (id: string | null) => {
    if (!id) return "?";
    const a = areas.find((x) => x.id === id);
    return a?.codigo ?? "?";
  };
  const instCodigo = (id: string | null) => {
    if (!id) return "—";
    return instrumentos.find((x) => x.id === id)?.codigo ?? "—";
  };

  return (
    <div className="space-y-1">
      <select
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          onChange(id, pares.find((p) => p.id === id));
        }}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">— Selecciona un par de cuartos —</option>
        {pares.map((p) => (
          <option key={p.id} value={p.id}>
            {areaCodigo(p.cuarto_x_id)} vs {areaCodigo(p.cuarto_y_id)} · {instCodigo(p.instrumento_id)} · ≥{p.limite_normativo_pa} Pa
          </option>
        ))}
      </select>
      <p className="text-[11px] text-muted-foreground">
        Los pares vienen del listado oficial <span className="font-mono">LIS-VAL-11</span>. Cada par ya trae su manómetro y límite normativo.
      </p>
    </div>
  );
}
