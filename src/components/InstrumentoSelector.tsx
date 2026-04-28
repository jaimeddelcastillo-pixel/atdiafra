import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Instrumento, InstrumentoTipo,
  upsertInstrumento, listInstrumentos,
} from "@/lib/catalogos";

interface Props {
  tipo: InstrumentoTipo;
  /** Etiqueta humana del tipo, ej. "termohigrómetro" */
  tipoLabel: string;
  /** Parámetro por defecto del nuevo instrumento, ej. "Temperatura/HR" */
  parametroDefault: string;
  value: string;
  instrumentos: Instrumento[];
  onChange: (id: string) => void;
  /** Llamado tras crear un nuevo instrumento para que el padre recargue el catálogo */
  onCatalogChanged: (lista: Instrumento[]) => void;
  placeholderCodigo?: string;
}

export function InstrumentoSelector({
  tipo, tipoLabel, parametroDefault,
  value, instrumentos, onChange, onCatalogChanged,
  placeholderCodigo = "INS-CMB-20",
}: Props) {
  const [adding, setAdding] = useState(false);
  const [nuevo, setNuevo] = useState({ codigo: "", especificacion: "" });
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    const codigo = nuevo.codigo.trim();
    if (!codigo) {
      toast.error("Captura el código del instrumento");
      return;
    }
    if (instrumentos.some((i) => i.codigo.toLowerCase() === codigo.toLowerCase())) {
      toast.error("Ya existe un instrumento con ese código");
      return;
    }
    setSaving(true);
    try {
      await upsertInstrumento({
        codigo,
        tipo,
        parametro: parametroDefault,
        especificacion: nuevo.especificacion.trim() || null as any,
      });
      const lista = await listInstrumentos({ tipo, soloActivos: true });
      onCatalogChanged(lista);
      const creado = lista.find((i) => i.codigo.toLowerCase() === codigo.toLowerCase());
      if (creado) onChange(creado.id);
      setNuevo({ codigo: "", especificacion: "" });
      setAdding(false);
      toast.success(`Instrumento ${codigo} agregado al catálogo`);
    } catch (e: any) {
      toast.error("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">— Seleccionar {tipoLabel} —</option>
          {instrumentos.map((i) => (
            <option key={i.id} value={i.id}>
              {i.codigo}{i.especificacion ? ` · ${i.especificacion}` : ""}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding((v) => !v)}
          className="gap-1 shrink-0"
          title={`Agregar nuevo ${tipoLabel}`}
        >
          {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {adding ? "Cancelar" : "Nuevo INS"}
        </Button>
      </div>

      {adding && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Se agregará al catálogo y quedará disponible en futuros registros.
          </p>
          <Input
            placeholder={`Código (${placeholderCodigo})`}
            value={nuevo.codigo}
            onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
            autoFocus
          />
          <Input
            placeholder="Especificación / ubicación (opcional)"
            value={nuevo.especificacion}
            onChange={(e) => setNuevo({ ...nuevo, especificacion: e.target.value })}
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={guardar} disabled={saving} className="gap-1">
              <Plus className="h-4 w-4" /> {saving ? "Guardando…" : "Agregar al catálogo"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
