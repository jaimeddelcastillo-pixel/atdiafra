import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

export interface ExtractedReading {
  fecha: string | null;
  hora: string | null;
  temperatura: number | null;
  humedad: number | null;
  turno?: string | null;
  operador?: string | null;
}

interface Props {
  context: { sistema: string; uma: string; area: string; iso: string };
  onExtracted: (rows: ExtractedReading[], notas?: string) => void;
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

export function ImageImporter({ context, onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      setPreviewUrl(URL.createObjectURL(file));
      const { base64, mediaType } = await fileToBase64(file);

      const { data, error: fnError } = await supabase.functions.invoke("extract-bitacora", {
        body: { imageBase64: base64, mediaType, module: "temp_hr", context },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const parsed = data?.parsed;
      const rows: ExtractedReading[] = parsed?.readings ?? [];
      if (!rows.length) {
        setError("La IA no logró extraer lecturas. Intenta con una imagen más nítida o captúralas manualmente.");
      } else {
        onExtracted(rows, parsed?.notas);
        toast.success(`${rows.length} lecturas extraídas. Revisa y edita antes de guardar.`);
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
            Sube una foto clara de la bitácora. La IA extrae las lecturas y podrás editarlas antes de guardar.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label
            htmlFor="bitacora-file"
            className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors min-h-40"
          >
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
            <input
              id="bitacora-file"
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
        </div>
        {previewUrl && (
          <div className="w-full sm:w-48 shrink-0">
            <p className="text-xs text-muted-foreground mb-1.5">Imagen cargada</p>
            <img
              src={previewUrl}
              alt="Bitácora cargada"
              className="rounded-lg border border-border max-h-40 w-full object-contain bg-muted"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      <div className="mt-3 text-xs text-muted-foreground">
        También puedes agregar lecturas manualmente con el botón <span className="font-medium">+ Nueva lectura</span> en la tabla.
      </div>
    </div>
  );
}
