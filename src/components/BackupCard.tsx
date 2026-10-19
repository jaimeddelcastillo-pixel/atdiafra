import { useState } from "react";
import { DatabaseBackup } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { exportarRespaldo } from "@/lib/backup.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function descargarBase64(base64: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Respaldo completo (BD + fotos) en un ZIP. Visible solo para super_admin. */
export function BackupCard() {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    try {
      setBusy(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      const res = await exportarRespaldo({ data: { accessToken } });
      descargarBase64(res.base64, res.filename);
      const total = Object.values(res.tablas).reduce((a, b) => a + b, 0);
      toast.success(`Respaldo descargado: ${total} registros y ${res.fotos} fotos.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo generar el respaldo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Respaldo de información</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Descarga un ZIP con un JSON por tabla, el manifiesto con conteos y fecha, y las fotos de
          las bitácoras con su ruta original.
        </p>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={busy}>
          <DatabaseBackup />
          {busy ? "Generando…" : "Exportar respaldo"}
        </Button>
      </CardContent>
    </Card>
  );
}
