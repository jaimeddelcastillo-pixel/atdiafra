import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AreaClasificada, IsoClase, ISO_CLASES, listAreas, upsertArea } from "@/lib/catalogos";

interface Props {
  value: string; // area_id seleccionada
  areas: AreaClasificada[];
  onChange: (areaId: string, area: AreaClasificada | null) => void;
  onCatalogChanged: (areas: AreaClasificada[]) => void;
  defaultIso?: IsoClase;
}

const ISO_OPTIONS: IsoClase[] = ISO_CLASES;

export function AreaSelector({ value, areas, onChange, onCatalogChanged, defaultIso = "ISO-8" }: Props) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nueva, setNueva] = useState({ codigo: "", nombre: "", iso: defaultIso });

  const guardar = async () => {
    if (!nueva.codigo.trim() || !nueva.nombre.trim()) {
      toast.error("Captura código y nombre del área");
      return;
    }
    setSaving(true);
    try {
      await upsertArea({ codigo: nueva.codigo.trim(), nombre: nueva.nombre.trim(), iso: nueva.iso });
      const fresh = await listAreas(true);
      onCatalogChanged(fresh);
      const created = fresh.find((a) => a.codigo === nueva.codigo.trim() && a.nombre === nueva.nombre.trim());
      if (created) onChange(created.id, created);
      toast.success("Área guardada en catálogo");
      setNueva({ codigo: "", nombre: "", iso: defaultIso });
      setAdding(false);
    } catch (e) {
      toast.error("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => {
            const id = e.target.value;
            const a = areas.find((x) => x.id === id) ?? null;
            onChange(id, a);
          }}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">— Selecciona área —</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.codigo} · {a.nombre} ({a.iso})</option>
          ))}
        </select>
        <Button type="button" size="sm" variant={adding ? "secondary" : "outline"} onClick={() => setAdding((v) => !v)} className="gap-1 shrink-0">
          {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {adding ? "Cancelar" : "Nueva área"}
        </Button>
      </div>

      {adding && (
        <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 space-y-2">
          <Input placeholder="Código de área (DCC-05)" value={nueva.codigo} onChange={(e) => setNueva({ ...nueva, codigo: e.target.value })} />
          <Input placeholder="Nombre del área (Preparación y Lavado)" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
          <select
            value={nueva.iso}
            onChange={(e) => setNueva({ ...nueva, iso: e.target.value as IsoClase })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {ISO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <Button type="button" size="sm" onClick={guardar} disabled={saving} className="w-full">
            {saving ? "Guardando…" : "Guardar área en catálogo"}
          </Button>
          <p className="text-[10px] text-muted-foreground">Quedará disponible para futuras fotos y registros.</p>
        </div>
      )}
    </div>
  );
}
