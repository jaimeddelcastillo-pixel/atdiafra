import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, AlertCircle, Sparkles, CalendarDays, Camera } from "lucide-react";
import { toast } from "sonner";
import { Semana, semanaVacia, lunesDe, nombreMes, DIAS, TURNOS, type Dia, type Turno } from "@/lib/semanas";

interface Props {
  context: { codigoArea: string; nombreArea: string; instrumento: string; iso: string };
  semanaInicio: string; // YYYY-MM-DD lunes (sugerido por el editor)
  onExtracted: (s: Semana) => void;
}

/** Redimensiona y comprime una imagen a JPEG (máx ~4MB, lado mayor 2800px) para encajar en el límite de 5MB de Anthropic. */
// 2800px mejora precisión en dígitos manuscritos pequeños
async function compressImage(file: File, maxDim = 2800, targetBytes = 4_000_000): Promise<{ base64: string; mediaType: string }> {
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
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.75;
  let out = canvas.toDataURL("image/jpeg", quality);
  // Iterar bajando calidad hasta entrar en targetBytes
  for (let i = 0; i < 6 && approxBytes(out) > targetBytes; i++) {
    quality -= 0.1;
    if (quality < 0.35) quality = 0.35;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  const base64 = out.split(",")[1];
  return { base64, mediaType: "image/jpeg" };
}

function approxBytes(dataUrl: string): number {
  const b64 = dataUrl.split(",")[1] ?? "";
  return Math.floor(b64.length * 0.75);
}

interface IALectura {
  dia?: string; turno?: string; valor?: number | string | null; hora?: string | null; quien?: string | null;
  confianza?: number | null;
}
interface IAResponse {
  mes?: string; anio?: string; instrumento?: string; area?: string;
  // Nuevo formato: ambas variables en una sola respuesta
  lecturas_t?: IALectura[]; lecturas_hr?: IALectura[];
  // Compatibilidad con respuesta legada (una sola variable)
  variable?: string; lecturas?: IALectura[];
  observaciones?: string;
}

const DIA_MAP: Record<string, Dia> = {
  lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", "miércoles": "Miércoles",
  jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", "sábado": "Sábado", domingo: "Domingo",
};
const TURNO_MAP: Record<string, Turno> = {
  "manana": "Mañana", "mañana": "Mañana",
  "media tarde": "Media tarde", "mediatarde": "Media tarde",
  "tarde": "Tarde",
};

function normDia(s?: string): Dia | null {
  if (!s) return null;
  return DIA_MAP[s.toLowerCase().trim()] ?? null;
}
function normTurno(s?: string): Turno | null {
  if (!s) return null;
  return TURNO_MAP[s.toLowerCase().trim()] ?? null;
}

type Modo = "AUTO" | "T" | "HR";

function aplicarLecturas(
  s: Semana,
  arrName: "lecturas" | "lecturas_hr",
  fuente: IALectura[],
) {
  const arr = (s as Semana)[arrName]!.slice();
  for (const r of fuente) {
    const d = normDia(r.dia);
    const t = normTurno(r.turno);
    if (!d || !t) continue;
    const di = DIAS.indexOf(d);
    const ti = TURNOS.indexOf(t);
    const idx = di * 3 + ti;
    const v = r.valor;
    const num = v == null || v === "" ? null : typeof v === "number" ? v : parseFloat(String(v));
    const valorFinal = Number.isFinite(num as number) ? (num as number) : null;
    const conf = typeof r.confianza === "number" ? r.confianza : null;
    // Marcar como dudoso si la IA reportó confianza < 0.7 o si no pudo leer el valor
    const dudoso = (conf !== null && conf < 0.7) || (valorFinal === null && conf !== 0);
    arr[idx] = {
      dia: d, turno: t,
      valor: valorFinal,
      hora: r.hora ?? null, quien: r.quien ?? null,
      _dudoso: dudoso || undefined,
    };
  }
  (s as Semana)[arrName] = arr;
}

export function ImageImporter({ context, semanaInicio, onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("AUTO");
  const [fechaSemana, setFechaSemana] = useState<string>(semanaInicio);
  const inputRef = useRef<HTMLInputElement>(null);

  // Si el editor cambia de semana activa, sincronizamos (el usuario aún puede sobreescribir).
  useEffect(() => { setFechaSemana(semanaInicio); }, [semanaInicio]);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      setPreviewUrl(URL.createObjectURL(file));
      const { base64, mediaType } = await compressImage(file);

      const { data, error: fnError } = await supabase.functions.invoke("extract-bitacora", {
        body: { imageBase64: base64, mediaType, module: "temp_hr", context },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const parsed = data?.parsed as IAResponse | null;

      // Soporta tanto el nuevo formato (lecturas_t + lecturas_hr) como el legado (lecturas + variable)
      let lecturasT: IALectura[] = parsed?.lecturas_t ?? [];
      let lecturasHR: IALectura[] = parsed?.lecturas_hr ?? [];
      if (!lecturasT.length && !lecturasHR.length && parsed?.lecturas?.length) {
        if ((parsed.variable ?? "T").toUpperCase() === "HR") lecturasHR = parsed.lecturas;
        else lecturasT = parsed.lecturas;
      }

      // Aplicar el filtro de modo si el usuario quiere forzar sólo una variable
      if (modo === "T") lecturasHR = [];
      if (modo === "HR") lecturasT = [];

      const valoresT = lecturasT.filter(x => x.valor != null && x.valor !== "").length;
      const valoresHR = lecturasHR.filter(x => x.valor != null && x.valor !== "").length;
      if (valoresT === 0 && valoresHR === 0) {
        console.warn("[extract-bitacora] respuesta sin valores numéricos:", data);
        setError(
          parsed
            ? "La IA leyó la estructura pero no pudo reconocer los valores numéricos. Intenta con una foto más cerca de las filas de números (Temperatura °C / Humedad Relativa) y bien iluminada."
            : "La IA no devolvió un JSON válido. Intenta con una imagen más nítida o recortada a la tabla."
        );
        return;
      }

      // Construir semana base usando la fecha elegida por el usuario (normalizada a lunes)
      const lunes = lunesDe(new Date(fechaSemana + "T00:00:00"));
      const fecha = new Date(lunes + "T00:00:00");
      const s = semanaVacia({
        semana_inicio: lunes,
        mes: parsed?.mes ?? nombreMes(fecha),
        anio: parsed?.anio ?? String(fecha.getFullYear()),
        unidad: "°C",
        esTHR: true,
      });
      s.source = "imagen";
      s.observaciones = parsed?.observaciones ?? "";

      if (lecturasT.length) aplicarLecturas(s, "lecturas", lecturasT);
      if (lecturasHR.length) aplicarLecturas(s, "lecturas_hr", lecturasHR);

      onExtracted(s);

      // Log de uso (tokens y costo) que devuelve la edge function
      if (data?.uso) {
        console.log("[extract-bitacora] uso:", data.uso);
      }

      const partes = [
        lecturasT.length ? `T: ${lecturasT.filter(x => x.valor != null).length} valores` : null,
        lecturasHR.length ? `HR: ${lecturasHR.filter(x => x.valor != null).length} valores` : null,
      ].filter(Boolean).join(" · ");

      // Contar dudosos para avisar al operador
      const dudososT = (s.lecturas ?? []).filter(p => p._dudoso).length;
      const dudososHR = (s.lecturas_hr ?? []).filter(p => p._dudoso).length;
      const totalDudosos = dudososT + dudososHR;

      if (data?.requiere_revision || totalDudosos > 0) {
        toast.warning(
          `Semana extraída con ${totalDudosos} lectura(s) dudosa(s). Revisa las celdas resaltadas en amarillo antes de guardar.`,
          { duration: 6000 }
        );
      } else {
        toast.success(`Semana extraída (${partes}). Revisa y edita antes de guardar.`);
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
            <Sparkles className="h-4 w-4 text-secondary" /> Digitalizar bitácora desde imagen
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Una foto = una semana (Lunes–Domingo, 3 turnos). La IA extrae sólo los valores escritos al pie, ignora la cuadrícula gráfica.
          </p>
        </div>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Variables:</label>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {([
              { v: "AUTO", label: "Ambas (auto)" },
              { v: "T", label: "Sólo T" },
              { v: "HR", label: "Sólo HR" },
            ] as const).map(({ v, label }) => (
              <button key={v} onClick={() => setModo(v)}
                className={`px-3 py-1 text-xs ${modo === v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> Semana de la foto:
          </label>
          <input
            type="date"
            value={fechaSemana}
            onChange={(e) => setFechaSemana(e.target.value || semanaInicio)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs flex-1"
          />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            → lunes {lunesDe(new Date((fechaSemana || semanaInicio) + "T00:00:00"))}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label htmlFor="bitacora-camera" className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors min-h-36">
            {loading ? (
              <>
                <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
                <span className="text-xs text-muted-foreground">Procesando…</span>
              </>
            ) : (
              <>
                <Camera className="h-7 w-7 text-muted-foreground mb-2" />
                <span className="text-sm font-medium text-foreground">Tomar foto</span>
                <span className="text-[11px] text-muted-foreground mt-0.5 text-center">Abre la cámara del dispositivo</span>
              </>
            )}
            <input id="bitacora-camera" type="file"
              accept="image/*" capture="environment" className="hidden" disabled={loading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </label>

          <label htmlFor="bitacora-file" className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-5 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors min-h-36">
            {loading ? (
              <>
                <Loader2 className="h-7 w-7 animate-spin text-primary mb-2" />
                <span className="text-xs text-muted-foreground">Procesando…</span>
              </>
            ) : (
              <>
                <Upload className="h-7 w-7 text-muted-foreground mb-2" />
                <span className="text-sm font-medium text-foreground">Subir archivo</span>
                <span className="text-[11px] text-muted-foreground mt-0.5 text-center">JPG / PNG / WEBP · máx 10 MB</span>
              </>
            )}
            <input id="bitacora-file" ref={inputRef} type="file"
              accept="image/jpeg,image/png,image/webp" className="hidden" disabled={loading}
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

// re-export por compatibilidad
export type { Semana };
