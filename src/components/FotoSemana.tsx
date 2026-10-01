// Muestra la foto original de la bitácora de la semana seleccionada.
import { useEffect, useState } from "react";
import { ImageIcon, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { urlFotoBitacora } from "@/lib/fotos-bitacora";

export function FotoSemana({ path, semana }: { path?: string | null; semana?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let vivo = true;
    setUrl(null);
    if (path) urlFotoBitacora(path).then((u) => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [path]);

  if (!semana) return null;

  if (!path) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <ImageIcon className="h-3.5 w-3.5" /> Esta semana no tiene foto guardada (se capturó a mano o antes de esta función).
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground">
        <span className="flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" /> Foto de la semana del {semana}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="block">
              <img src={url} alt={`Bitácora semana ${semana}`} className="max-h-[480px] w-full object-contain rounded border border-border bg-background" />
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary"><ExternalLink className="h-3 w-3" /> Abrir en tamaño completo</span>
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Cargando foto…</p>
          )}
        </div>
      )}
    </div>
  );
}
