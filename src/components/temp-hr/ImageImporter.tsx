import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Semana, semanaVacia, lunesDe, nombreMes, DIAS, TURNOS, type Dia, type Turno } from "@/lib/semanas";

interface Props {
  context: { codigoArea: string; nombreArea: string; instrumento: string; iso: string };
  semanaInicio: string; // YYYY-MM-DD lunes
  onExtracted: (s: Semana) => void;
}

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [meta, data] = result.split(",");
      const match = /data:(.*?);base64/.exec(meta);
      resolve({ base64: data, mediaType: match?.[1] ?? "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface IALectura {
  dia?: string; turno?: string; valor?: number | string | null; hora?: string | null; quien?: string | null;
}
interface IAResponse {
  mes?: string; anio?: string; instrumento?: string; area?: string; variable?: string;
  lecturas?: IALectura[]; observaciones?: string;
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

export function ImageImporter({ context, semanaInicio, onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [variable, setVariable] = useState<"T" | "HR">("T");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      setPreviewUrl(URL.createObjectURL(file));
      const { base64, mediaType } = await fileToBase64(file);

      const { data, error: fnError } = await supabase.functions.invoke("extract-bitacora", {
        body: { imageBase64: base64, mediaType, module: "temp_hr", variable, context },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const parsed = data?.parsed as IAResponse | null;
      if (!parsed?.lecturas?.length) {
        setError("La IA no logró extraer lecturas. Intenta con una imagen más nítida.");
        return;
      }

      // Construir semana base y rellenar la variable correspondiente
      const fecha = new Date(semanaInicio + "T00:00:00");
      const s = semanaVacia({
        semana_inicio: semanaInicio,
        mes: parsed.mes ?? nombreMes(fecha),
        anio: parsed.anio ?? String(fecha.getFullYear()),
        unidad: variable === "T" ? "°C" : "%HR",
        esTHR: true,
      });
      s.source = "imagen";
      s.observaciones = parsed.observaciones ?? "";

      const arrName = variable === "T" ? "lecturas" : "lecturas_hr";
      const arr = (s as Semana)[arrName]!.slice();

      for (const r of parsed.lecturas) {
        const d = normDia(r.dia);
        const t = normTurno(r.turno);
        if (!d || !t) continue;
        const di = DIAS.indexOf(d);
        const ti = TURNOS.indexOf(t);
        const idx = di * 3 + ti;
        const v = r.valor;
        const num = v == null || v === "" ? null : typeof v === "number" ? v : parseFloat(String(v));
        arr[idx] = {
          dia: d, turno: t,
          valor: Number.isFinite(num as number) ? (num as number) : null,
          hora: r.hora ?? null, quien: r.quien ?? null,
        };
      }
      (s as Semana)[arrName] = arr;
      onExtracted(s);
      toast.success(`Semana extraída (${variable}). Revisa y edita antes de guardar.`);
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

      <div className="mb-3 flex items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground">Variable de la bitácora:</label>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {(["T", "HR"] as const).map((v) => (
            <button key={v} onClick={() => setVariable(v)}
              className={`px-3 py-1 text-xs ${variable === v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
              {v === "T" ? "Temperatura" : "Humedad"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="bitacora-file" className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors min-h-40">
            {loading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <span className="text-sm text-muted-foreground">Procesando con IA…</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm font-medium text-foreground">Click para subir imagen</span>
                <span className="text-xs text-muted-foreground mt-1">JPG, PNG o WEBP — máx. 10 MB</span>
              </>
            )}
            <input id="bitacora-file" ref={inputRef} type="file"
              accept="image/jpeg,image/png,image/webp" className="hidden" disabled={loading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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
