import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import logoDefault from "@/assets/diafra-logo.jpg";
import { FORMATO_DEFAULT, SECCIONES_FIJAS, cargarFormato, guardarFormato, type FormatoForVal16 } from "@/lib/formato-forval16";

/** Reduce el logo a máx. 600 px y lo guarda como PNG en base64. */
async function logoADataURL(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Imagen no válida")); img.src = url; });
    const k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

export function FormatoForVal16Tab() {
  const { user, hasRole } = useAuth();
  const esAdmin = hasRole("admin") || hasRole("super_admin");
  const [f, setF] = useState<FormatoForVal16 | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { cargarFormato().then(setF).catch((e) => toast.error(e.message)); }, []);
  if (!f) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const guardar = async () => {
    setGuardando(true);
    try {
      const v = await guardarFormato(f, user?.email ?? null);
      setF(await cargarFormato());
      toast.success(`Formato guardado como versión ${v}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="font-medium text-foreground">Plantilla del Word «Análisis de tendencias»</p>
        <p className="text-muted-foreground">
          {f.version ? `Versión ${f.version} de la plantilla · guardada por ${f.created_by_email ?? "—"}${f.created_at ? ` el ${new Date(f.created_at).toLocaleDateString("es-MX")}` : ""}.` : "Aún no se ha guardado: se usan los textos precargados del A2025-001."}
          {" "}Cada vez que guardas se crea una versión nueva; las anteriores se conservan.
          {!esAdmin && " Solo admin o super_admin pueden modificarla."}
        </p>
      </div>

      <fieldset disabled={!esAdmin} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Logo de DIAFRA</Label>
            <div className="flex items-center gap-3">
              <img src={f.logo || logoDefault} alt="Logo" className="h-14 max-w-40 rounded border border-border bg-card object-contain p-1" />
              <Input type="file" accept="image/png,image/jpeg" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                try { const logo = await logoADataURL(file); setF({ ...f, logo }); } catch (er) { toast.error((er as Error).message); }
              }} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="vf">Versión del formato (pie de página)</Label>
            <Input id="vf" value={f.version_formato} onChange={(e) => setF({ ...f, version_formato: e.target.value })} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Firmantes</Label>
          <div className="grid gap-3 md:grid-cols-3">
            {f.firmantes.map((s, i) => (
              <div key={s.rol} className="space-y-1.5 rounded-md border border-border p-3">
                <p className="text-sm font-medium">{s.rol}</p>
                <Input placeholder="Nombre" value={s.nombre} onChange={(e) => setF({ ...f, firmantes: f.firmantes.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} />
                <Input placeholder="Cargo" value={s.cargo} onChange={(e) => setF({ ...f, firmantes: f.firmantes.map((x, j) => (j === i ? { ...x, cargo: e.target.value } : x)) })} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Cada línea es un párrafo. Empieza la línea con «- » para un inciso numerado (1.1.), «-- » para 1.1.1. y «--- » para 1.1.1.1.
          Puedes usar <code>{"{sistema}"}</code>, <code>{"{periodo}"}</code>, <code>{"{areas}"}</code> y <code>{"{clases_iso}"}</code>; se reemplazan solos al exportar.
          Las secciones 2, 8, 9, 10, 11, 13 y 14 se llenan desde cada registro AT.
        </div>

        {SECCIONES_FIJAS.map(({ k, titulo, ayuda }) => (
          <div key={k} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={k}>{titulo}</Label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, textos: { ...f.textos, [k]: FORMATO_DEFAULT.textos[k] } })}>Restaurar precargado</Button>
            </div>
            {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
            <Textarea id={k} rows={Math.min(14, Math.max(3, f.textos[k].split("\n").length + 1))} className="font-mono text-xs"
              value={f.textos[k]} onChange={(e) => setF({ ...f, textos: { ...f.textos, [k]: e.target.value } })} />
          </div>
        ))}

        <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar nueva versión del formato"}</Button>
      </fieldset>
    </div>
  );
}
