import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCambiosFiltro, listSistemasHVAC, type AreaClasificada, type Instrumento, type SistemaHVAC } from "@/lib/catalogos";
import type { Registro } from "@/lib/semanas";
import { etiquetaPeriodo, exportarPaqueteForVal16 } from "@/lib/export-forval16";

const MODULOS = new Set(["temphr", "presiones", "filtros"]);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  registros: Registro[];
  instrMap: Map<string, Instrumento>;
  areasMap: Map<string, AreaClasificada>;
  desde: Date;
  hasta: Date;
  /** Registro(s) preseleccionados: abre en modo "Instrumentos". */
  preseleccion?: string[];
}

/** Une registros del mismo instrumento; por semana gana la captura más reciente. */
function unirPorInstrumento(regs: Registro[]): Registro[] {
  const m = new Map<string, Registro>();
  for (const r of regs) {
    if (!MODULOS.has(r.modulo) || r.activo === false) continue;
    const k = `${r.modulo}|${r.instrumento_id ?? r.id}`;
    const cur = m.get(k);
    if (!cur) { m.set(k, { ...r, semanas: [...r.semanas] }); continue; }
    const porSemana = new Map(cur.semanas.map((s) => [s.semana_inicio, s]));
    for (const s of r.semanas) {
      const p = porSemana.get(s.semana_inicio);
      if (!p || (s.saved_at ?? "") > (p.saved_at ?? "")) porSemana.set(s.semana_inicio, s);
    }
    cur.semanas = [...porSemana.values()].sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));
  }
  return [...m.values()];
}

export function PaqueteForVal16Dialog({ open, onOpenChange, registros, instrMap, areasMap, desde, hasta, preseleccion }: Props) {
  const [hvacs, setHvacs] = useState<SistemaHVAC[]>([]);
  const [modo, setModo] = useState<"hvac" | "instrumentos">("hvac");
  const [hvacId, setHvacId] = useState<string>("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [at, setAt] = useState(`AT-${new Date().getFullYear()}-`);
  const [generando, setGenerando] = useState(false);

  useEffect(() => { if (open && !hvacs.length) listSistemasHVAC(true).then(setHvacs).catch(() => {}); }, [open, hvacs.length]);

  const unidos = useMemo(() => unirPorInstrumento(registros), [registros]);
  const codigo = (r: Registro) => (r.instrumento_id && instrMap.get(r.instrumento_id)?.codigo) || r.nombre;

  useEffect(() => {
    if (!open) return;
    if (preseleccion?.length) {
      const ids = new Set(preseleccion);
      setModo("instrumentos");
      setSel(new Set(unidos.filter((u) => registros.some((r) => ids.has(r.id) && (r.instrumento_id ?? r.id) === (u.instrumento_id ?? u.id) && r.modulo === u.modulo)).map((u) => u.id)));
    }
  }, [open, preseleccion, unidos, registros]);

  const hvacDe = (r: Registro): string | null => {
    if (r.hvac_id) return r.hvac_id;
    const ins = r.instrumento_id ? instrMap.get(r.instrumento_id) : undefined;
    const a = (ins?.area_id && areasMap.get(ins.area_id)) || (r.area_id && areasMap.get(r.area_id)) || undefined;
    if (a?.hvac_id) return a.hvac_id;
    const primero = ins?.area_libre?.split(/ vs /i)[0]?.trim();
    const porCodigo = primero ? [...areasMap.values()].find((x) => x.codigo === primero) : undefined;
    return porCodigo?.hvac_id ?? null;
  };

  const elegidos = modo === "hvac" ? unidos.filter((r) => hvacId && hvacDe(r) === hvacId) : unidos.filter((r) => sel.has(r.id));
  const hvac = hvacs.find((h) => h.id === hvacId);
  const sistema = modo === "hvac"
    ? (hvac ? `${hvac.codigo} ${hvac.nombre_uma}` : "")
    : elegidos.length === 1 ? codigo(elegidos[0]) : "Instrumentos seleccionados";
  const atValido = /^AT-\d{4}-\d{3}$/.test(at.trim());
  const d = format(desde, "yyyy-MM-dd"), h = format(hasta, "yyyy-MM-dd");
  const visibles = unidos.filter((r) => !filtro.trim() || `${codigo(r)} ${r.nombre}`.toLowerCase().includes(filtro.trim().toLowerCase()))
    .sort((a, b) => codigo(a).localeCompare(codigo(b)));

  const generar = async () => {
    setGenerando(true);
    const t = toast.loading("Generando paquete FOR-VAL-16-02…");
    try {
      const cambiosFiltro = await listCambiosFiltro().catch(() => []);
      const r = await exportarPaqueteForVal16({ codigoAT: at.trim(), sistema, registros: elegidos, instrMap, areasMap, desde: d, hasta: h, hvac, cambiosFiltro });
      if (!r.bloques) toast.info("Ninguno de los instrumentos tiene lecturas en este periodo. Cambia las fechas arriba.", { id: t });
      else { toast.success(`Descargado ${r.archivo} (${r.bloques} gráfica${r.bloques === 1 ? "" : "s"})`, { id: t }); onOpenChange(false); }
    } catch (e: unknown) {
      toast.error(`No se pudo generar: ${e instanceof Error ? e.message : "error desconocido"}`, { id: t });
    } finally { setGenerando(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Paquete de reporte FOR-VAL-16-02</DialogTitle>
          <DialogDescription>
            Un Excel con portada, resumen, una hoja por instrumento y todas las gráficas listas para copiar a Word.
            Periodo: <strong>{format(desde, "dd/MM/yyyy")} – {format(hasta, "dd/MM/yyyy")}</strong> ({etiquetaPeriodo(d, h).replaceAll("_", " ")}). Cámbialo arriba si hace falta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="at">Código de reporte</Label>
            <Input id="at" value={at} onChange={(e) => setAt(e.target.value.toUpperCase())} placeholder="AT-2025-001" />
            {!atValido && <p className="text-xs text-muted-foreground">Formato: AT-AAAA-NNN (por ejemplo AT-2025-001).</p>}
          </div>

          <div className="flex gap-2">
            <Button type="button" size="sm" variant={modo === "hvac" ? "default" : "outline"} onClick={() => setModo("hvac")}>Por sistema HVAC</Button>
            <Button type="button" size="sm" variant={modo === "instrumentos" ? "default" : "outline"} onClick={() => setModo("instrumentos")}>Elegir instrumentos</Button>
          </div>

          {modo === "hvac" ? (
            <div className="space-y-1.5">
              <Label>Sistema HVAC</Label>
              <Select value={hvacId} onValueChange={setHvacId}>
                <SelectTrigger><SelectValue placeholder="Selecciona un sistema" /></SelectTrigger>
                <SelectContent>
                  {hvacs.map((x) => <SelectItem key={x.id} value={x.id}>{x.codigo} · {x.nombre_uma}</SelectItem>)}
                </SelectContent>
              </Select>
              {hvacId && <p className="text-xs text-muted-foreground">{elegidos.length} instrumento(s): {elegidos.map(codigo).sort().join(", ") || "ninguno ligado a este sistema"}</p>}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar instrumento…" />
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {visibles.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                    <Checkbox checked={sel.has(r.id)} onCheckedChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} />
                    <span className="font-medium">{codigo(r)}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.nombre}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{elegidos.length} seleccionado(s)</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={generar} disabled={!atValido || !elegidos.length || generando} className="gap-1">
            <FileSpreadsheet className="h-4 w-4" /> Descargar Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
