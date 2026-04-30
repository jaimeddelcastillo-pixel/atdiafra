import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Pencil, Trash, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  getRegistro, deleteRegistro, type Registro,
  rangoFechasRegistro, lecturasCapturadas, lecturasEsperadas, esSemanaCompleta,
  type Modulo,
} from "@/lib/semanas";
import { TempHRAnalysis } from "@/components/temp-hr/TempHRAnalysis";
import { type IsoClase } from "@/lib/catalogos";

function moduloSlug(m: Modulo): string {
  const map: Record<Modulo, string> = {
    temphr: "temperatura-humedad",
    filtros: "filtros",
    presiones: "presiones",
    agua: "agua-purificada",
  };
  return map[m];
}

export const Route = createFileRoute("/reporte/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Detalle de registro — DIAFRA` },
      { name: "description", content: `Detalle del registro ${params.id} con sus semanas y análisis.` },
    ],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Registro no encontrado</h1>
        <Link to="/reporte" className="inline-flex mt-6 items-center gap-1 text-primary hover:underline">
          <ChevronLeft className="h-4 w-4" /> Volver a reportes
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-destructive">Error</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  component: () => <AuthGuard><DetallePage /></AuthGuard>,
});

function DetallePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { canDelete } = useAuth();
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRegistro(id)
      .then((r) => {
        if (!r) throw notFound();
        setRegistro(r);
      })
      .catch((e) => toast.error("No se pudo cargar: " + e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!registro) return;
    if (!confirm(`¿Eliminar el registro "${registro.nombre}" (${rangoFechasRegistro(registro)})?\n\nEsto borra TODAS sus semanas. No se puede deshacer.`)) return;
    try {
      await deleteRegistro(registro.id);
      toast.success("Registro eliminado");
      navigate({ to: "/reporte" });
    } catch (e: any) {
      toast.error("No se pudo eliminar: " + e.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </main>
      </div>
    );
  }

  if (!registro) return null;

  const esTHR = registro.modulo === "temphr";
  const iso = (registro.iso ?? "ISO-8") as IsoClase;
  const semanasOrden = [...registro.semanas].sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Link to="/reporte" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-3">
          <ChevronLeft className="h-4 w-4" /> Volver al reporte
        </Link>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{registro.modulo}</div>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground mt-0.5">{registro.nombre}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {iso} · <span className="font-medium text-foreground">{rangoFechasRegistro(registro)}</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              ID: <span className="font-mono">{registro.id.slice(0, 8)}…</span> · Creado {registro.created_at.slice(0, 10)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/modulo/$slug"
              params={{ slug: moduloSlug(registro.modulo) }}
              search={{ registroId: registro.id }}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Pencil className="h-4 w-4" /> Editar en módulo
            </Link>
            {canDelete && (
              <Button size="sm" variant="outline" onClick={handleDelete} className="gap-1 text-destructive hover:text-destructive">
                <Trash className="h-4 w-4" /> Eliminar
              </Button>
            )}
          </div>
        </div>

        {/* Lista de semanas */}
        <section className="mt-6">
          <h2 className="text-base font-semibold text-foreground mb-2">
            <FileText className="h-4 w-4 inline mr-1 text-muted-foreground" />
            Semanas capturadas ({semanasOrden.length})
          </h2>
          {semanasOrden.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin semanas aún.</p>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Lunes</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Mes / Año</th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">Lecturas</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Estado</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Origen</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {semanasOrden.map((s) => {
                    const cap = lecturasCapturadas(s, esTHR);
                    const esp = lecturasEsperadas(s, esTHR);
                    const completa = esSemanaCompleta(s, esTHR);
                    return (
                      <tr key={s.id} className="border-t border-border align-top">
                        <td className="px-3 py-2 font-mono text-foreground">{s.semana_inicio}</td>
                        <td className="px-3 py-2 text-muted-foreground capitalize">{s.mes} {s.anio}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{cap}/{esp}</td>
                        <td className="px-3 py-2">
                          <span className={completa ? "text-success" : cap > 0 ? "text-warning" : "text-destructive"}>
                            {completa ? "✓ completa" : cap > 0 ? "parcial" : "vacía"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{s.source}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-xs">
                          {s.observaciones ? <span className="line-clamp-2">{s.observaciones}</span> : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Análisis solo para temp/HR */}
        {esTHR && registro.semanas.length > 0 && (
          <section className="mt-8">
            <h2 className="text-base font-semibold text-foreground mb-3">Análisis y gráficas</h2>
            <TempHRAnalysis semanas={registro.semanas} iso={iso} />
          </section>
        )}
      </main>
    </div>
  );
}
