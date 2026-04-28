import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { ChevronLeft, Trash, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { listRegistros, deleteRegistro, lunesDe, type Registro, type Modulo } from "@/lib/semanas";
import { MODULOS } from "@/lib/diafra-data";

export const Route = createFileRoute("/reporte")({
  head: () => ({
    meta: [
      { title: "Reporte consolidado — DIAFRA" },
      { name: "description", content: "Vista global de registros, edición, borrado y cumplimiento semanal." },
    ],
  }),
  component: ReportePage,
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
    return registros.filter((r) => {
      if (filtroModulo && r.modulo !== filtroModulo) return false;
      if (busca && !r.nombre.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
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
        const semanasAnio = r.semanas.filter((s) => s.semana_inicio.startsWith(String(anio)));
        const presentes = new Set(semanasAnio.map((s) => s.semana_inicio));
        const completas = semanasAnio.filter((s) => {
          const t = (s.lecturas ?? []).filter((p) => p.valor != null).length;
          const hr = (s.lecturas_hr ?? []).filter((p) => p.valor != null).length;
          const necesarias = r.modulo === "temphr" ? 42 : 21;
          return (t + hr) >= necesarias;
        }).length;
        const faltantes = lunes.filter((l) => !presentes.has(l));
        return { registro: r, totalSemanas: lunes.length, presentes: presentes.size, completas, faltantes };
      });
  }, [registros, filtroAnio, filtroModulo]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-3">
          <ChevronLeft className="h-4 w-4" /> Tablero
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Reporte consolidado</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Todos los registros de todos los módulos. Edita, borra o revisa el cumplimiento semanal.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={reload} className="gap-1">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
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
            Cada fila representa un registro (área + instrumento). Una semana se considera <span className="font-medium text-foreground">completa</span> cuando tiene todas sus lecturas del lunes al domingo.
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
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Lunes faltantes (últimos 8)</th>
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
                            {faltantes.slice(-8).join(", ") || "—"}
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
                      const necesarias = r.modulo === "temphr" ? 42 : 21;
                      const semanasOrden = [...r.semanas].sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));
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
                                  const t = (s.lecturas ?? []).filter((p) => p.valor != null).length;
                                  const hr = (s.lecturas_hr ?? []).filter((p) => p.valor != null).length;
                                  const total = t + hr;
                                  const completa = total >= necesarias;
                                  return (
                                    <div key={s.id} className="flex items-center gap-2">
                                      <span className="font-mono text-foreground">{s.semana_inicio}</span>
                                      <span className="text-muted-foreground">
                                        {r.modulo === "temphr" ? `T:${t} HR:${hr}` : `${total}`} / {necesarias}
                                      </span>
                                      <span className={completa ? "text-success" : total > 0 ? "text-warning" : "text-destructive"}>
                                        {completa ? "✓ completa" : total > 0 ? "parcial" : "vacía"}
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
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                                >
                                  <Eye className="h-3 w-3" /> Abrir
                                </Link>
                              )}
                              <button
                                onClick={() => handleDelete(r.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/5"
                              >
                                <Trash className="h-3 w-3" /> Borrar
                              </button>
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
