// Importador de bitácora de PRESIONES diferenciales (Pa) — versión adaptada del de T/HR.
// Una sola variable. Llama a la edge function extract-bitacora con module="presiones".
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Loader2, AlertCircle, Sparkles, CalendarDays, Camera } from "lucide-react";
import { toast } from "sonner";
import { Semana, semanaVacia, lunesDe, nombreMes, DIAS, TURNOS, type Dia, type Turno } from "@/lib/semanas";

interface Props {
  context: { codigoArea: string; nombreArea: string; instrumento: string; iso: string; limiteMinPa: number };
  semanaInicio: string;
  onExtracted: (s: Semana) => void;
}

export async function compressImage(file: File, maxDim = 2800, targetBytes = 4_000_000): Promise<{ base64: string; mediaType: string }> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  let quality = 0.75;
  let out = canvas.toDataURL("image/jpeg", quality);
  for (let i = 0; i < 6 && approxBytes(out) > targetBytes; i++) {
    quality -= 0.1;
    if (quality < 0.35) quality = 0.35;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return { base64: out.split(",")[1], mediaType: "image/jpeg" };
}
function approxBytes(dataUrl: string): number {
  return Math.floor((dataUrl.split(",")[1]?.length ?? 0) * 0.75);
}

interface IALectura {
  dia?: string; turno?: string; valor?: number | string | null;
  hora?: string | null; quien?: string | null; confianza?: number | null;
}
interface IAResponse {
  mes?: string; anio?: string; instrumento?: string; area?: string; unidad?: string;
  lecturas?: IALectura[]; observaciones?: string;
}

const DIA_MAP: Record<string, Dia> = {
  lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", "miércoles": "Miércoles",
  jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", "sábado": "Sábado", domingo: "Domingo",
};
const TURNO_MAP: Record<string, Turno> = {
  manana: "Mañana", "mañana": "Mañana",
  "media tarde": "Media tarde", mediatarde: "Media tarde",
  tarde: "Tarde",
};
const normDia = (s?: string): Dia | null => s ? DIA_MAP[s.toLowerCase().trim()] ?? null : null;
const normTurno = (s?: string): Turno | null => s ? TURNO_MAP[s.toLowerCase().trim()] ?? null : null;

export function aplicarLecturas(s: Semana, fuente: IALectura[]) {
  const arr = s.lecturas.slice();
  for (const r of fuente) {
    const d = normDia(r.dia);
    const t = normTurno(r.turno);
    if (!d || !t) continue;
    const idx = DIAS.indexOf(d) * 3 + TURNOS.indexOf(t);
    const v = r.valor;
    const num = v == null || v === "" ? null : typeof v === "number" ? v : parseFloat(String(v));
    const valorFinal = Number.isFinite(num as number) ? (num as number) : null;
    const conf = typeof r.confianza === "number" ? r.confianza : null;
    const dudoso = (conf !== null && conf < 0.7) || (valorFinal === null && conf !== 0);
    arr[idx] = {
      dia: d, turno: t, valor: valorFinal,
      hora: r.hora ?? null, quien: r.quien ?? null,
      _dudoso: dudoso || undefined,
    };
  }
  s.lecturas = arr;
}

export function ImageImporterPresion({ context, semanaInicio, onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fechaSemana, setFechaSemana] = useState<string>(semanaInicio);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setFechaSemana(semanaInicio); }, [semanaInicio]);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      setPreviewUrl(URL.createObjectURL(file));
      const { base64, mediaType } = await compressImage(file);
      const { data, error: fnError } = await supabase.functions.invoke("extract-bitacora", {
        body: { imageBase64: base64, mediaType, module: "presiones", context },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const parsed = data?.parsed as IAResponse | null;
      const lecturas: IALectura[] = parsed?.lecturas ?? [];
      const valores = lecturas.filter(x => x.valor != null && x.valor !== "").length;

      if (valores === 0) {
        setError(parsed
          ? "La IA leyó la estructura pero no pudo reconocer los valores. Toma la foto más cerca de la fila 'Presión (Pa)' y bien iluminada."
          : "La IA no devolvió un JSON válido. Intenta con una imagen más nítida o recortada a la tabla.");
        return;
      }

      const lunes = lunesDe(new Date(fechaSemana + "T00:00:00"));
      const fecha = new Date(lunes + "T00:00:00");
      const s = semanaVacia({
        semana_inicio: lunes,
        mes: parsed?.mes ?? nombreMes(fecha),
        anio: parsed?.anio ?? String(fecha.getFullYear()),
        unidad: "Pa",
        esTHR: false,
      });
      s.source = "imagen";
      s.observaciones = parsed?.observaciones ?? "";
      aplicarLecturas(s, lecturas);

      onExtracted(s);

      if (data?.uso) console.log("[extract-bitacora] uso:", data.uso);
      const dudosos = s.lecturas.filter(p => p._dudoso).length;
      if (data?.requiere_revision || dudosos > 0) {
        toast.warning(`Semana extraída con ${dudosos} lectura(s) dudosa(s). Revisa las celdas resaltadas en amarillo antes de guardar.`, { duration: 6000 });
      } else {
        toast.success(`Semana extraída (${valores} valores). Revisa y edita antes de guardar.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(msg);
      toast.error("Error al extraer datos: " + msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-secondary" /> Digitalizar bitácora de presiones
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Una foto = una semana (Lunes–Domingo, 3 turnos). La IA extrae los valores escritos al pie de la tabla en Pa.
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <label className="text-xs font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" /> Semana de la foto:
        </label>
        <input
          type="date"
          value={fechaSemana}
          onChange={(e) => setFechaSemana(e.target.value || semanaInicio)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
        <span className="text-[10px] text-muted-foreground">
          → lunes {lunesDe(new Date((fechaSemana || semanaInicio) + "T00:00:00"))}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label htmlFor="bitacora-pres-camera" className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors min-h-36">
            {loading ? (
              <><Loader2 className="h-7 w-7 animate-spin text-primary mb-2" /><span className="text-xs text-muted-foreground">Procesando…</span></>
            ) : (
              <>
                <Camera className="h-7 w-7 text-muted-foreground mb-2" />
                <span className="text-sm font-medium text-foreground">Tomar foto</span>
                <span className="text-[11px] text-muted-foreground mt-0.5 text-center">Abre la cámara</span>
              </>
            )}
            <input id="bitacora-pres-camera" type="file" accept="image/*" capture="environment" className="hidden" disabled={loading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </label>

          <label htmlFor="bitacora-pres-file" className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors min-h-36">
            {loading ? (
              <><Loader2 className="h-7 w-7 animate-spin text-primary mb-2" /><span className="text-xs text-muted-foreground">Procesando…</span></>
            ) : (
              <>
                <Upload className="h-7 w-7 text-muted-foreground mb-2" />
                <span className="text-sm font-medium text-foreground">Subir archivo</span>
                <span className="text-[11px] text-muted-foreground mt-0.5 text-center">JPG / PNG / WEBP</span>
              </>
            )}
            <input id="bitacora-pres-file" ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={loading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </label>
        </div>
        {previewUrl && (
          <div className="w-full sm:w-48 shrink-0">
            <p className="text-xs text-muted-foreground mb-1.5">Imagen cargada</p>
            <img src={previewUrl} alt="Bitácora cargada" className="rounded-lg border border-border max-h-40 w-full object-contain bg-muted" />
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}
    </div>
  );
}
