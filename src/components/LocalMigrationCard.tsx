// Botón para migrar registros que aún viven en localStorage hacia Lovable Cloud.
import { useEffect, useState } from "react";
import { CloudUpload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getLocalRegistros, migrateLocalToCloud, clearLocalRegistros } from "@/lib/semanas";

export function LocalMigrationCard() {
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = () => setPending(getLocalRegistros().length);
  useEffect(() => { refresh(); }, []);

  if (pending === 0) return null;

  const handleMigrate = async () => {
    setBusy(true);
    try {
      const { registros, semanas } = await migrateLocalToCloud();
      toast.success(`Subidos ${registros} registro(s) y ${semanas} semana(s) a la nube`);
      clearLocalRegistros();
      refresh();
    } catch (e: any) {
      toast.error("No se pudo migrar: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = () => {
    if (!confirm("¿Descartar los registros locales sin subirlos? Esta acción no se puede deshacer.")) return;
    clearLocalRegistros();
    refresh();
    toast.info("Registros locales descartados");
  };

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 mb-6">
      <div className="flex items-start gap-3">
        <CloudUpload className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            Tienes {pending} registro(s) capturados sólo en este dispositivo
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Súbelos a la nube para verlos también en otros dispositivos (móvil, PC, etc.).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={handleMigrate} disabled={busy} className="gap-1">
              <CheckCircle2 className="h-4 w-4" /> {busy ? "Subiendo…" : "Subir a la nube"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDiscard} disabled={busy}>
              Descartar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
