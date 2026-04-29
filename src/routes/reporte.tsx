import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/lib/auth-context";
import { ChevronLeft, Trash, Eye, RefreshCw, FileSpreadsheet, FileText, Merge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { listRegistros, deleteRegistro, lunesDe, esSemanaCompleta, lecturasCapturadas, lecturasEsperadas, rangoFechasRegistro, detectarDuplicados, fusionarRegistros, type Registro, type Modulo } from "@/lib/semanas";
import { MODULOS } from "@/lib/diafra-data";
import { exportarReporteExcel, exportarReportePDF } from "@/lib/export-utils";

export const Route = createFileRoute("/reporte")({
  head: () => ({
    meta: [
      { title: "Reporte consolidado — DIAFRA" },
      { name: "description", content: "Vista global de registros, edición, borrado y cumplimiento semanal." },
    ],
  }),
  component: () => <AuthGuard><ReportePage /></AuthGuard>,
});

const MODULOS_VALIDOS: { id: Modulo; label: string }[] = [
  { id: "temphr", label: "Temperatura y HR" },
  { id: "filtros", label: "Filtros" },
  { id: "presiones", label: "Presiones" },
  { id: "agua", label: "Agua purificada" },
];

function moduloSlug(m: Modulo): string {
  const map: Record<Modulo, string> = {
    temphr: "temperatura-humedad",
    filtros: "filtros",
    presiones: "presiones",
    agua: "agua-purificada",
  };
  return map[m];
}

function ReportePage() {
  const { canDelete } = useAuth();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroModulo, setFiltroModulo] = useState<Modulo | "">("");
  const [filtroAnio, setFiltroAnio] = useState<string>(String(new Date().getFullYear()));
  const [busca, setBusca] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      setRegistros(await listRegistros());
    } catch (e: any) {
      toast.error("No se pudieron cargar registros: " + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const filtrados = useMemo(() => {
    return registros
      .filter((r) => {
        if (filtroModulo && r.modulo !== filtroModulo) return false;
        if (busca && !r.nombre.toLowerCase().includes(busca.toLowerCase())) return false;
        return true;
      })
      .slice()
      .sort((a, b) => {
        // Orden por la semana más reciente capturada (desc); si no hay semanas, por created_at desc.
        const ultA = a.semanas.length ? a.semanas.map((s) => s.semana_inicio).sort().slice(-1)[0] : a.created_at.slice(0, 10);
        const ultB = b.semanas.length ? b.semanas.map((s) => s.semana_inicio).sort().slice(-1)[0] : b.created_at.slice(0, 10);
        if (ultA !== ultB) return ultB.localeCompare(ultA);
        return a.nombre.localeCompare(b.nombre);
      });
  }, [registros, filtroModulo, busca]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este registro y todas sus semanas?")) return;
    try {
      await deleteRegistro(id);
      await reload();
      toast.success("Registro eliminado");
    } catch (e: any) {
      toast.error("No se pudo eliminar: " + e.message);
    }
  };

  // ===== Cumplimiento =====
  const cumplimiento = useMemo(() => {
    const anio = parseInt(filtroAnio, 10);
    if (!Number.isFinite(anio)) return [];
    // Generar lunes desde el 1 enero hasta hoy (o fin de año si no es vigente)
    const inicio = new Date(anio, 0, 1);
    const hoy = new Date();
    const fin = anio === hoy.getFullYear() ? hoy : new Date(anio, 11, 31);
    const lunes: string[] = [];
    let cursor = new Date(lunesDe(inicio) + "T00:00:00");
    while (cursor <= fin) {
      lunes.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 7);
    }
    return registros
      .filter((r) => !filtroModulo || r.modulo === filtroModulo)
      .map((r) => {
        const esTHR = r.modulo === "temphr";
        const semanasAnio = r.semanas.filter((s) => s.semana_inicio.startsWith(String(anio)));
        const presentes = new Set(semanasAnio.map((s) => s.semana_inicio));
        const completas = semanasAnio.filter((s) => esSemanaCompleta(s, esTHR)).length;
        const faltantes = lunes.filter((l) => !presentes.has(l));
        return { registro: r, totalSemanas: lunes.length, presentes: presentes.size, completas, faltantes };
      });
  }, [registros, filtroAnio, filtroModulo]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-3">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
            <ChevronLeft className="h-4 w-4" /> Tablero
          </Link>
          <Link to="/reporte/normativo" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Reporte normativo (≥90 lecturas) →
          </Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Reporte consolidado</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Todos los registros de todos los módulos. Edita, borra o revisa el cumplimiento semanal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={reload} className="gap-1">
              <RefreshCw className="h-4 w-4" /> Actualizar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                try {
                  exportarReporteExcel(registros, cumplimiento, filtroAnio);
                  toast.success("Excel generado");
                } catch (e: any) {
                  toast.error("No se pudo exportar: " + e.message);
                }
              }}
              disabled={loading || registros.length === 0}
              className="gap-1"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                try {
                  exportarReportePDF(registros, cumplimiento, filtroAnio);
                  toast.success("PDF generado");
                } catch (e: any) {
                  toast.error("No se pudo exportar: " + e.message);
                }
              }}
              disabled={loading || registros.length === 0}
              className="gap-1"
            >
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="mt-6 rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Módulo</label>
            <select
              value={filtroModulo}
              onChange={(e) => setFiltroModulo(e.target.value as Modulo | "")}
              className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Todos</option>
              {MODULOS_VALIDOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Año (cumplimiento)</label>
            <input
              type="number"
              value={filtroAnio}
              onChange={(e) => setFiltroAnio(e.target.value)}
              className="mt-1 block w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-muted-foreground">Buscar</label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Por nombre, área o instrumento…"
              className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        {/* Cumplimiento */}
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">Cumplimiento {filtroAnio}</h2>
          <p className="text-xs text-muted-foreground mb-3">
            El año se determina por el <span className="font-medium text-foreground">lunes</span> de cada semana, no por la fecha de captura. Una semana es <span className="font-medium text-foreground">completa</span> cuando todas sus lecturas no marcadas como NA tienen valor (semana inglesa: Sáb/Dom NA por defecto).
          </p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : cumplimiento.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin registros para evaluar.</p>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Registro</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground" title={`Lunes esperados desde 01-ene-${filtroAnio} a la fecha`}>Semanas esperadas</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">Capturadas</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">Completas</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">Faltantes</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Semanas capturadas (lunes)</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Lunes faltantes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cumplimiento.map(({ registro, totalSemanas, presentes, completas, faltantes }) => {
                      const pct = totalSemanas > 0 ? Math.round((completas / totalSemanas) * 100) : 0;
                      const color = pct >= 90 ? "text-success" : pct >= 60 ? "text-warning" : "text-destructive";
                      const semanasAnio = registro.semanas
                        .filter((s) => s.semana_inicio.startsWith(filtroAnio))
                        .map((s) => s.semana_inicio)
                        .sort();
                      return (
                        <tr key={registro.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <div className="font-medium text-foreground">{registro.nombre}</div>
                            <div className="text-muted-foreground text-[11px]">{registro.modulo} · {registro.iso ?? "—"}</div>
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums">{totalSemanas}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{presentes}</td>
                          <td className={`px-3 py-2 text-center tabular-nums font-semibold ${color}`}>{completas} ({pct}%)</td>
                          <td className="px-3 py-2 text-center tabular-nums">{faltantes.length}</td>
                          <td className="px-3 py-2 text-[11px] text-muted-foreground">
                            {semanasAnio.length > 0 ? semanasAnio.join(", ") : "—"}
                          </td>
                          <td className="px-3 py-2 text-[11px] text-muted-foreground">
                            {faltantes.length === 0 ? (
                              <span className="text-success">Ninguno ✓</span>
                            ) : (
                              <details>
                                <summary className="cursor-pointer hover:text-foreground">Ver {faltantes.length} faltante(s)</summary>
                                <div className="mt-1 max-h-40 overflow-y-auto leading-5">
                                  {faltantes.join(", ")}
                                </div>
                              </details>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Lista detallada */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">Registros ({filtrados.length})</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay registros con esos filtros.</p>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Módulo</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">ISO</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground">Semanas</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Detalle de semanas (lunes · lecturas · estado)</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Creado</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((r) => {
                      const moduloDef = MODULOS.find((m) => moduloSlug(r.modulo) === m.slug);
                      const editable = moduloDef?.enabled;
                      
                      const semanasOrden = [...r.semanas].sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));
                      const esTHR = r.modulo === "temphr";
                      return (
                        <tr key={r.id} className="border-t border-border align-top">
                          <td className="px-3 py-2 font-medium text-foreground">{r.nombre}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.modulo}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.iso ?? "—"}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{r.semanas.length}</td>
                          <td className="px-3 py-2 text-[11px]">
                            {semanasOrden.length === 0 ? (
                              <span className="text-muted-foreground">Sin semanas</span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {semanasOrden.map((s) => {
                                  const cap = lecturasCapturadas(s, esTHR);
                                  const esp = lecturasEsperadas(s, esTHR);
                                  const completa = esSemanaCompleta(s, esTHR);
                                  return (
                                    <div key={s.id} className="flex items-center gap-2">
                                      <span className="font-mono text-foreground">{s.semana_inicio}</span>
                                      <span className="text-muted-foreground">
                                        {cap}/{esp}
                                      </span>
                                      <span className={completa ? "text-success" : cap > 0 ? "text-warning" : "text-destructive"}>
                                        {completa ? "✓ completa" : cap > 0 ? "parcial" : "vacía"}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{r.created_at.slice(0, 10)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex gap-1">
                              {editable && (
                                <Link
                                  to="/modulo/$slug"
                                  params={{ slug: moduloSlug(r.modulo) }}
                                  search={{ registroId: r.id }}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                                >
                                  <Eye className="h-3 w-3" /> Abrir
                                </Link>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => handleDelete(r.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/5"
                                >
                                  <Trash className="h-3 w-3" /> Borrar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
