import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCambioFiltro, deleteCambioFiltro, listCambiosFiltro, type CambioFiltro } from "@/lib/catalogos";

export function CambiosFiltroEditor({ instrumentoId }: { instrumentoId: string }) {
  const [items, setItems] = useState<CambioFiltro[]>([]);
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const cargar = () => listCambiosFiltro(instrumentoId).then(setItems).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, [instrumentoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const agregar = async () => {
    if (!fecha) { toast.error("Indica la fecha del cambio"); return; }
    try { await addCambioFiltro({ instrumento_id: instrumentoId, fecha, nota: nota.trim() }); setFecha(""); setNota(""); cargar(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border/60">
      <p className="text-[11px] font-medium text-muted-foreground">Cambios de filtro</p>
      {items.length === 0 && <p className="text-[11px] text-muted-foreground">Sin cambios registrados.</p>}
      {items.map((c) => (
        <div key={c.id} className="flex items-center gap-2 text-xs">
          <span className="font-mono">{c.fecha.split("-").reverse().join("/")}</span>
          <span className="flex-1 text-muted-foreground truncate">{c.nota}</span>
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label="Quitar cambio"
            onClick={async () => { try { await deleteCambioFiltro(c.id); cargar(); } catch (e) { toast.error((e as Error).message); } }}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40" />
        <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" />
        <Button type="button" size="sm" variant="outline" onClick={agregar}>Agregar</Button>
      </div>
    </div>
  );
}
