// Carga masiva de fotos (lote) de un mismo instrumento.
// La IA lee la fecha del encabezado de cada bitácora para ubicar la semana;
// el usuario revisa la bandeja y las integra al borrador (luego presiona Guardar).
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Layers, Loader2, Upload, CheckCircle2, AlertTriangle, XCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Semana, semanaVacia, lunesDe, nombreMes } from "@/lib/semanas";
import { compressImage, aplicarLecturas as aplicarPresion } from "@/components/presiones/ImageImporterPresion";
import { aplicarLecturas as aplicarTHR } from "@/components/temp-hr/ImageImporter";
import { detectarLunesFoto, subirFotoBitacora } from "@/lib/fotos-bitacora";

type Modulo = "presiones" | "temp_hr";

interface Item {
  id: string;
  file: File;
  url: string;
  estado: "pendiente" | "procesando" | "listo" | "error";
  error?: string;
  lunes: string; // "" si no se detectó
  fechaDetectada: boolean;
  semana?: Semana;
  valores: number;
  dudosos: number;
  incluir: boolean;
}

interface Props {
  modulo: Modulo;
  context: Record<string, unknown>;
  disabled?: boolean;
  semanasExistentes: string[]; // lunes ya presentes en el registro
  onApply: (semanas: Semana[]) => void;
}

interface Lect { valor?: unknown }
interface Parsed {
  mes?: string; anio?: string; observaciones?: string;
  fechas_columnas?: { dia?: string; fecha?: string }[];
  lecturas?: Lect[]; lecturas_t?: Lect[]; lecturas_hr?: Lect[];
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

const detectarLunes = (p: Parsed | null) => detectarLunesFoto(p);

function construir(modulo: Modulo, p: Parsed, lunes: string): Semana {
  const fecha = new Date(lunes + "T00:00:00");
  const s = semanaVacia({
    semana_inicio: lunes,
    mes: nombreMes(fecha),
    anio: String(fecha.getFullYear()),
    unidad: modulo === "presiones" ? "Pa" : "°C",
    esTHR: modulo === "temp_hr",
  });
  s.source = "imagen";
  s.observaciones = p.observaciones ?? "";
  if (modulo === "presiones") {
    aplicarPresion(s, (p.lecturas ?? []) as never);
  } else {
    if (p.lecturas_t?.length) aplicarTHR(s, "lecturas", p.lecturas_t as never);
    if (p.lecturas_hr?.length) aplicarTHR(s, "lecturas_hr", p.lecturas_hr as never);
  }
  return s;
}

function rehacerSemana(s: Semana, lunes: string): Semana {
  const fecha = new Date(lunes + "T00:00:00");
  return { ...s, semana_inicio: lunes, mes: nombreMes(fecha), anio: String(fecha.getFullYear()) };
}

export function LoteFotosImporter({ modulo, context, disabled, semanasExistentes, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  // Ref espejo de items para que el ciclo de procesamiento vea fotos agregadas a mitad de la carga
  const itemsRef = useRef<Item[]>([]);
  const runningRef = useRef(false);
  const setItemsSync = (fn: (prev: Item[]) => Item[]) => {
    setItems((prev) => {
      const next = fn(prev);
      itemsRef.current = next;
      return next;
    });
  };

  const upd = (id: string, patch: Partial<Item>) =>
    setItemsSync((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function procesar() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    // Procesa en ciclo: si el usuario agrega más fotos mientras se leen, también entran
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const it = itemsRef.current.find((x) => x.estado === "pendiente");
      if (!it) break;
      upd(it.id, { estado: "procesando" });
      try {
        const { base64, mediaType } = await compressImage(it.file);
        let intento = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase.functions.invoke("extract-bitacora", {
            body: { imageBase64: base64, mediaType, module: modulo, context },
          });
          const msg = error?.message ?? data?.error;
          if (msg) {
            if (/límite|429|rate/i.test(String(msg)) && intento < 2) {
              intento++;
              await new Promise((r) => setTimeout(r, 4000 * intento));
              continue;
            }
            if (/créditos|402/i.test(String(msg))) {
              upd(it.id, { estado: "error", error: String(msg) });
              toast.error(String(msg));
              setRunning(false);
              return;
            }
            throw new Error(String(msg));
          }
          const p = (data?.parsed ?? null) as Parsed | null;
          if (!p) throw new Error("La IA no pudo leer la imagen");
          const lunes = detectarLunes(p);
          const base = lunes || lunesDe(new Date());
          const s = construir(modulo, p, base);
          const todas = [...s.lecturas, ...(s.lecturas_hr ?? [])];
          const valores = todas.filter((x) => x.valor != null).length;
          const dudosos = todas.filter((x) => x._dudoso).length;
          if (valores === 0) throw new Error("No se reconocieron valores");
          s.foto_path = await subirFotoBitacora(base64, mediaType);
          upd(it.id, { estado: "listo", semana: s, lunes, fechaDetectada: !!lunes, valores, dudosos, incluir: !!lunes });
          break;
        }
      } catch (e) {
        upd(it.id, { estado: "error", error: e instanceof Error ? e.message : "Error", incluir: false });
      }
    }
    setRunning(false);
  }

  function agregar(files: FileList | File[]) {
    const nuevos: Item[] = Array.from(files)
      .filter((f) => ACCEPT.includes(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name))
      .map((f) => ({
        id: crypto.randomUUID(), file: f, url: URL.createObjectURL(f),
        estado: "pendiente", lunes: "", fechaDetectada: false, valores: 0, dudosos: 0, incluir: false,
      }));
    const omitidos = Array.from(files).length - nuevos.length;
    if (omitidos > 0) toast.warning(`${omitidos} archivo(s) omitido(s): solo se aceptan JPG, PNG o WEBP.`);
    if (!nuevos.length) return;
    setItems((prev) => [...prev, ...nuevos]);
    if (!running) void procesar(nuevos);
  }

  const ordenados = items.slice().sort((a, b) => (a.lunes || "9999").localeCompare(b.lunes || "9999"));
  const conteo = (l: string) => items.filter((x) => x.incluir && x.lunes === l).length;
  const aprobados = items.filter((x) => x.incluir && x.estado === "listo" && x.lunes && x.semana);
  const procesados = items.filter((x) => x.estado === "listo" || x.estado === "error").length;

  function integrar() {
    const semanas = aprobados.map((x) => rehacerSemana(x.semana!, x.lunes));
    const lunesUnicos = new Set(semanas.map((s) => s.semana_inicio));
    if (lunesUnicos.size !== semanas.length) {
      toast.error("Hay fotos repetidas para la misma semana. Desmarca una de ellas.");
      return;
    }
    onApply(semanas);
    setOpen(false);
    setItems([]);
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1" disabled={disabled} onClick={() => setOpen(true)}>
        <Layers className="h-4 w-4" /> Cargar lote de fotos
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!running) setOpen(v); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Carga de fotos por lote</DialogTitle>
            <DialogDescription>
              Todas las fotos deben ser de este mismo instrumento. La IA lee la fecha escrita en cada bitácora
              y la acomoda en su semana. Revisa la lista y presiona "Integrar"; después usa Guardar.
            </DialogDescription>
          </DialogHeader>

          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); agregar(e.dataTransfer.files); }}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${drag ? "border-primary bg-primary/10" : "border-border hover:border-primary hover:bg-primary/5"}`}
          >
            <Upload className="h-7 w-7 text-muted-foreground mb-2" />
            <span className="text-sm font-medium text-foreground">{drag ? "Suelta las fotos aquí" : "Arrastra aquí las fotos o haz clic para elegirlas"}</span>
            <span className="text-[11px] text-muted-foreground mt-0.5">Puedes seleccionar varias a la vez · JPG / PNG / WEBP</span>
            <input type="file" multiple accept={ACCEPT.join(",")} className="hidden"
              onChange={(e) => { if (e.target.files) agregar(e.target.files); e.target.value = ""; }} />
          </label>

          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{running ? <><Loader2 className="inline h-3 w-3 animate-spin mr-1" />Leyendo foto {Math.min(procesados + 1, items.length)} de {items.length}…</> : `${procesados} de ${items.length} fotos leídas`}</span>
                <span>{aprobados.length} lista(s) para integrar</span>
              </div>
              <div className="divide-y divide-border rounded-md border border-border">
                {ordenados.map((it) => {
                  const repetida = it.incluir && it.lunes && conteo(it.lunes) > 1;
                  const yaExiste = it.lunes && semanasExistentes.includes(it.lunes);
                  return (
                    <div key={it.id} className="flex items-center gap-3 p-2 text-sm">
                      <input type="checkbox" className="h-4 w-4" disabled={it.estado !== "listo" || !it.lunes}
                        checked={it.incluir} onChange={(e) => upd(it.id, { incluir: e.target.checked })}
                        aria-label="Incluir esta foto" />
                      <a href={it.url} target="_blank" rel="noreferrer">
                        <img src={it.url} alt={it.file.name} className="h-12 w-16 object-cover rounded border border-border bg-muted" />
                      </a>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs text-muted-foreground">{it.file.name}</p>
                        {it.estado === "procesando" && <p className="text-xs"><Loader2 className="inline h-3 w-3 animate-spin mr-1" />Leyendo…</p>}
                        {it.estado === "pendiente" && <p className="text-xs text-muted-foreground">En espera</p>}
                        {it.estado === "error" && <p className="text-xs text-destructive"><XCircle className="inline h-3 w-3 mr-1" />{it.error}</p>}
                        {it.estado === "listo" && (
                          <p className="text-xs">
                            {it.dudosos > 0
                              ? <span className="text-warning"><AlertTriangle className="inline h-3 w-3 mr-1" />{it.valores} lecturas · {it.dudosos} dudosa(s)</span>
                              : <span className="text-success"><CheckCircle2 className="inline h-3 w-3 mr-1" />{it.valores} lecturas</span>}
                            {!it.fechaDetectada && <span className="ml-2 text-warning">· No se leyó la fecha, elígela</span>}
                            {repetida && <span className="ml-2 text-destructive">· Semana repetida en el lote: revisa la foto y corrige la fecha a la derecha</span>}
                            {yaExiste && !repetida && <span className="ml-2 text-muted-foreground">· Reemplazará la semana ya capturada</span>}
                          </p>
                        )}
                      </div>
                      {it.estado === "listo" && (
                        <div className="flex flex-col items-end">
                          <input type="date" value={it.lunes}
                            onChange={(e) => {
                              const v = e.target.value;
                              const l = v ? lunesDe(new Date(v + "T00:00:00")) : "";
                              upd(it.id, { lunes: l, incluir: !!l });
                            }}
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs" />
                          {it.lunes && <span className="text-[10px] text-muted-foreground">semana del lunes {it.lunes}</span>}
                        </div>
                      )}
                      <button type="button" disabled={it.estado === "procesando"} aria-label="Quitar foto"
                        onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}
                        className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" disabled={running} onClick={() => { setOpen(false); setItems([]); }}>Cancelar</Button>
            <Button disabled={running || aprobados.length === 0} onClick={integrar}>
              Integrar {aprobados.length} semana(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
