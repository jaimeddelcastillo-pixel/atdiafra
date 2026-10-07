// Botón «Corregir fecha»: mueve la semana abierta (ya capturada) a otro lunes sin perder lecturas.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PencilLine } from "lucide-react";
import { lunesDe } from "@/lib/semanas";

interface Props {
  actual: string; // lunes actual
  existentes: string[]; // lunes de las demás semanas del registro
  onConfirm: (lunes: string) => void;
}

export function CorregirFechaSemana({ actual, existentes, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState(actual);
  const lunes = valor ? lunesDe(new Date(valor + "T00:00:00")) : "";
  const ocupada = !!lunes && lunes !== actual && existentes.includes(lunes);
  return (
    <>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setValor(actual); setOpen(true); }}>
        <PencilLine className="h-3.5 w-3.5" /> Corregir fecha
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Corregir fecha de la semana</DialogTitle>
            <DialogDescription>
              Las lecturas y la foto se conservan; solo cambia la semana a la que pertenecen. Semana actual: lunes {actual}.
            </DialogDescription>
          </DialogHeader>
          <input type="date" value={valor} onChange={(e) => setValor(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
          {lunes && <p className="text-xs text-muted-foreground">Nueva semana: lunes {lunes}</p>}
          {ocupada && (
            <p className="text-xs text-destructive">
              Ya existe una semana del {lunes}. Corrige o elimina esa semana primero.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={!lunes || lunes === actual || ocupada} onClick={() => { onConfirm(lunes); setOpen(false); }}>
              Mover semana
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
