import { useState } from "react";
import { Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/** Zona de peligro: borrar un registro completo exige escribir su código. */
export function EliminarRegistroZona({ nombre, onConfirm }: { nombre: string; onConfirm: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const codigo = nombre.match(/[A-Z]{3}-[A-Z]{3}-\d+/)?.[0] ?? "ELIMINAR";
  const ok = texto.trim().toUpperCase() === codigo;

  return (
    <div className="mt-8 rounded-lg border border-destructive/40 p-4">
      <h3 className="text-sm font-semibold text-destructive">Zona de peligro</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Elimina el registro completo con todas sus semanas. Para quitar solo una semana usa la X junto a su fecha.
      </p>
      <Button size="sm" variant="outline" className="mt-3 gap-1 text-destructive hover:text-destructive"
        onClick={() => { setTexto(""); setOpen(true); }}>
        <Trash className="h-4 w-4" /> Eliminar registro completo
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar registro completo</DialogTitle>
            <DialogDescription>
              Se borrarán <b>todas las semanas</b> de “{nombre}”. Escribe <b>{codigo}</b> para confirmar.
            </DialogDescription>
          </DialogHeader>
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={codigo} autoComplete="off" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button variant="destructive" disabled={!ok || busy}
              onClick={async () => { setBusy(true); try { await onConfirm(); setOpen(false); } finally { setBusy(false); } }}>
              Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
