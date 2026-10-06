import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listInstrumentos, type Instrumento } from "@/lib/catalogos";

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const estadoTxt = { validada: "Validada", pendiente: "Pendiente de validar", na: "N/A" } as const;

export function PendientesValidacionTab() {
  const [items, setItems] = useState<Instrumento[]>([]);
  const [soloPend, setSoloPend] = useState(true);
  const [edit, setEdit] = useState<Instrumento | null>(null);
  const reload = () => listInstrumentos().then(setItems).catch((e) => toast.error(e.message));
  useEffect(() => { reload(); }, []);

  const esPend = (i: Instrumento) => i.spec_estado === "pendiente" || i.area_estado === "pendiente";
  const lista = items.filter((i) => (soloPend ? esPend(i) : !!i.spec_estado || esPend(i)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Pendientes de validación</h2>
          <p className="text-sm text-muted-foreground">Mientras un instrumento tenga pendientes, los registros AT que lo incluyan no se pueden emitir. Cada cambio queda en Auditoría.</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={soloPend} onCheckedChange={setSoloPend} /> Solo pendientes</label>
      </div>
      <div className="rounded-md border divide-y">
        {!lista.length && <p className="p-4 text-sm text-muted-foreground">No hay pendientes de validación.</p>}
        {lista.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-4 p-3 text-sm">
            <div>
              <div className="font-medium">{i.codigo} <span className="text-muted-foreground font-normal">· {i.area_libre ?? ""}</span></div>
              <div className="text-xs text-muted-foreground">
                Especificación: {i.spec_texto ?? "—"}{i.spec_texto_hr ? ` · HR ${i.spec_texto_hr}` : ""} · <b>{i.spec_estado ? estadoTxt[i.spec_estado] : "Sin definir"}</b>
                {i.area_estado === "pendiente" && <> · Área pendiente{i.area_nota ? `: ${i.area_nota}` : ""}</>}
                {i.spec_referencia && <> · Ref. {i.spec_referencia}{i.spec_fecha_validacion ? ` (${i.spec_fecha_validacion})` : ""}</>}
              </div>
            </div>
            <Button size="sm" variant={esPend(i) ? "default" : "outline"} onClick={() => setEdit(i)}>{esPend(i) ? "Validar" : "Editar"}</Button>
          </div>
        ))}
      </div>
      {edit && <ValidarDialog item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function ValidarDialog({ item, onClose, onSaved }: { item: Instrumento; onClose: () => void; onSaved: () => void }) {
  const thr = item.tipo === "termohigrometro";
  const s = (v: number | null | undefined) => (v == null ? "" : String(v));
  const [f, setF] = useState({
    na: item.spec_estado === "na",
    texto: item.spec_texto ?? "", lie: s(item.spec_lie), lse: s(item.spec_lse),
    lieE: !!item.spec_lie_estricto, lseE: !!item.spec_lse_estricto,
    textoHr: item.spec_texto_hr ?? "", lieHr: s(item.spec_lie_hr), lseHr: s(item.spec_lse_hr),
    area: item.area_libre ?? "", areaOk: item.area_estado !== "pendiente",
    ref: item.spec_referencia ?? "", fecha: item.spec_fecha_validacion ?? new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!f.na && num(f.lie) == null && num(f.lse) == null) { toast.error("Captura al menos un límite (LIE o LSE) o marca N/A"); return; }
    if (!f.na && !f.texto.trim()) { toast.error("Captura el texto tal como aparece en el FOR"); return; }
    if (!f.ref.trim() || !f.fecha) { toast.error("Indica el documento de referencia y la fecha"); return; }
    setSaving(true);
    const { error } = await supabase.from("instrumentos").update({
      spec_estado: f.na ? "na" : "validada",
      spec_texto: f.na ? "N/A" : f.texto.trim(),
      spec_lie: f.na ? null : num(f.lie), spec_lse: f.na ? null : num(f.lse),
      spec_lie_estricto: f.lieE, spec_lse_estricto: f.lseE,
      spec_texto_hr: thr && !f.na ? f.textoHr.trim() || null : null,
      spec_lie_hr: thr && !f.na ? num(f.lieHr) : null, spec_lse_hr: thr && !f.na ? num(f.lseHr) : null,
      spec_referencia: f.ref.trim(), spec_fecha_validacion: f.fecha,
      area_libre: f.area.trim() || null,
      area_estado: f.areaOk ? "validada" : "pendiente",
    }).eq("id", item.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${item.codigo} actualizado`); onSaved();
  };

  const lim = (k: "lie" | "lse", ek: "lieE" | "lseE", label: string) => (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      <Input type="number" value={f[k]} disabled={f.na} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      <label className="flex items-center gap-2 text-xs"><Switch checked={f[ek]} disabled={f.na} onCheckedChange={(v) => setF({ ...f, [ek]: v })} />
        {k === "lie" ? (f[ek] ? "> estricto" : "≥") : (f[ek] ? "< estricto" : "≤")}</label>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Especificación normativa · {item.codigo}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2"><Switch checked={f.na} onCheckedChange={(v) => setF({ ...f, na: v })} /> Sin especificación (N/A): solo tendencia, alerta/acción y saturación</label>
          <div className="space-y-1">
            <label className="text-xs font-medium">Texto tal como aparece en el FOR{thr ? " (temperatura)" : ""}</label>
            <Input value={f.texto} disabled={f.na} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder='p. ej. ">5 Pa"' />
          </div>
          <div className="grid grid-cols-2 gap-3">{lim("lie", "lieE", "Límite inferior")}{lim("lse", "lseE", "Límite superior")}</div>
          {thr && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Texto HR</label><Input value={f.textoHr} disabled={f.na} onChange={(e) => setF({ ...f, textoHr: e.target.value })} placeholder="30 – 65 %" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">HR mín (≥)</label><Input type="number" value={f.lieHr} disabled={f.na} onChange={(e) => setF({ ...f, lieHr: e.target.value })} /></div>
              <div className="space-y-1"><label className="text-xs font-medium">HR máx (≤)</label><Input type="number" value={f.lseHr} disabled={f.na} onChange={(e) => setF({ ...f, lseHr: e.target.value })} /></div>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium">Área / ubicación{item.area_nota ? ` · ${item.area_nota}` : ""}</label>
            <Input value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />
            <label className="flex items-center gap-2 text-xs"><Switch checked={f.areaOk} onCheckedChange={(v) => setF({ ...f, areaOk: v })} /> Nombres y códigos de área validados</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><label className="text-xs font-medium">Documento de referencia</label><Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} placeholder="PNO, plano o FOR" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Fecha</label><Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
