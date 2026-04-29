import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, RefreshCw, FileSpreadsheet, FileText, ShieldCheck, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listRegistros, type Registro, type Modulo } from "@/lib/semanas";
import { listAreas, listSistemasHVAC } from "@/lib/catalogos";
import {
  analizarRegistro, claveGrupo, etiquetaGrupo, MINIMO_NORMATIVO,
  type AgruparPor, type AnalisisRegistro, type Periodo, type Trimestre,
} from "@/lib/normativo";
import { exportarNormativoExcel, exportarNormativoPDF } from "@/lib/export-normativo";

export const Route = createFileRoute("/reporte/normativo")({
  head: () => ({
    meta: [
      { title: "Reporte normativo trimestral — DIAFRA" },
      { name: "description", content: "Cumplimiento normativo trimestral y anual con análisis estadístico." },
    ],
  }),
  component: () => <AuthGuard><NormativoPage /></AuthGuard>,
});

const MODULOS: { id: Modulo | ""; label: string }[] = [
  { id: "", label: "Todos los módulos" },
  { id: "temphr", label: "Temperatura y HR" },
  { id: "filtros", label: "Filtros" },
  { id: "presiones", label: "Presiones" },
  { id: "agua", label: "Agua purificada" },
];

function trimestreActual(): Trimestre {
  return Math.ceil((new Date().getMonth() + 1) / 3) as Trimestre;
}

function NormativoPage() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [areasMap, setAreasMap] = useState<Map<string, string>>(new Map());
  const [hvacMap, setHvacMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const [tipo, setTipo] = useState<"trimestre" | "anual" | "custom">("trimestre");
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [trimestre, setTrimestre] = useState<Trimestre>(trimestreActual());
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [desde, setDesde] = useState<string>(yearStart);
  const [hasta, setHasta] = useState<string>(today);
  const [modulo, setModulo] = useState<Modulo | "">("");
  const [agrupar, setAgrupar] = useState<AgruparPor>("registro");
  const [filtroArea, setFiltroArea] = useState<string>("");
  const [filtroHvac, setFiltroHvac] = useState<string>("");
  const [incluirGraficas, setIncluirGraficas] = useState(true);
  // Selección manual de registros (vacío = incluir todos los filtrados)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [seleccionManual, setSeleccionManual] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [regs, areas, hvac] = await Promise.all([listRegistros(), listAreas(), listSistemasHVAC()]);
      setRegistros(regs);
      setAreasMap(new Map(areas.map((a) => [a.id, `${a.codigo} · ${a.nombre}`])));
      setHvacMap(new Map(hvac.map((h) => [h.id, `${h.codigo} · ${h.nombre_uma}`])));
    } catch (e: any) {
      toast.error("No se pudo cargar: " + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const periodo: Periodo = useMemo(
    () =>
      tipo === "anual"
        ? { tipo: "anual", anio }
        : tipo === "custom"
          ? { tipo: "custom", desde, hasta }
          : { tipo: "trimestre", anio, q: trimestre },
    [tipo, anio, trimestre, desde, hasta],
  );

  const filtrados = useMemo(() => {
    return registros.filter((r) => {
      if (modulo && r.modulo !== modulo) return false;
      if (filtroArea && r.area_id !== filtroArea) return false;
      if (filtroHvac && r.hvac_id !== filtroHvac) return false;
      return true;
    });
  }, [registros, modulo, filtroArea, filtroHvac]);

  const filtradosFinal = useMemo(
    () => (seleccionManual ? filtrados.filter((r) => seleccionados.has(r.id)) : filtrados),
    [filtrados, seleccionados, seleccionManual],
  );

  const analisis = useMemo<AnalisisRegistro[]>(
    () => filtradosFinal.map((r) => analizarRegistro(r, periodo)),
    [filtradosFinal, periodo],
  );

  // Agrupación visual
  const grupos = useMemo(() => {
    const g = new Map<string, { etiqueta: string; items: AnalisisRegistro[] }>();
    for (const a of analisis) {
      const k = claveGrupo(a.registro, agrupar);
      const et = etiquetaGrupo(a.registro, agrupar, { areas: areasMap, hvac: hvacMap });
      const cur = g.get(k);
      if (cur) cur.items.push(a);
      else g.set(k, { etiqueta: et, items: [a] });
    }
    return Array.from(g.values()).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
  }, [analisis, agrupar, areasMap, hvacMap]);

  // KPIs
  const kpis = useMemo(() => {
    const total = analisis.length;
    const cumplen = analisis.filter((a) => a.cumpleMinimo).length;
    const conDesviaciones = analisis.filter((a) => a.series.some((s) => s.fueraSpec.total > 0)).length;
    const totalLecturas = analisis.reduce((s, a) => s + a.totalLecturas, 0);
    return { total, cumplen, conDesviaciones, totalLecturas };
  }, [analisis]);

  const periodoEsParcial = tipo === "trimestre" && anio === new Date().getFullYear() && trimestre === trimestreActual();

  const handleExcel = () => {
    try {
      exportarNormativoExcel(analisis, agrupar, { areas: areasMap, hvac: hvacMap });
      toast.success("Excel generado");
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };
  const handlePDF = () => {
    try {
      const t = toast.loading(incluirGraficas ? "Generando PDF con gráficas…" : "Generando PDF…");
      // Pequeño delay para que el toast se muestre antes del bloqueo del canvas
      setTimeout(() => {
        try {
          exportarNormativoPDF(analisis, agrupar, { areas: areasMap, hvac: hvacMap }, { incluirGraficas });
          toast.success("PDF generado", { id: t });
        } catch (e: any) {
          toast.error("Error: " + e.message, { id: t });
        }
      }, 50);
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <Link to="/reporte" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
            <ChevronLeft className="h-4 w-4" /> Reporte operativo
          </Link>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Reporte normativo
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cumplimiento ≥ {MINIMO_NORMATIVO} lecturas por punto de muestreo. Trimestres parciales soportados.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={reload} disabled={loading} className="gap-1">
              <RefreshCw className="h-4 w-4" /> Actualizar
            </Button>
            <Button size="sm" variant="outline" onClick={handleExcel} disabled={loading || analisis.length === 0} className="gap-1">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-input rounded-md px-2 h-9">
              <input
                type="checkbox"
                checked={incluirGraficas}
                onChange={(e) => setIncluirGraficas(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Gráficas en PDF
            </label>
            <Button size="sm" onClick={handlePDF} disabled={loading || analisis.length === 0} className="gap-1">
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        {/* Controles */}
        <Card className="mt-6">
          <CardContent className="pt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Periodo</label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "trimestre" | "anual" | "custom")}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trimestre">Trimestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipo !== "custom" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Año</label>
                <input
                  type="number"
                  value={anio}
                  onChange={(e) => setAnio(parseInt(e.target.value, 10) || new Date().getFullYear())}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9"
                />
              </div>
            )}
            {tipo === "trimestre" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Trimestre</label>
                <Select value={String(trimestre)} onValueChange={(v) => setTrimestre(Number(v) as Trimestre)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tipo === "custom" && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Desde</label>
                  <input
                    type="date"
                    value={desde}
                    max={hasta}
                    onChange={(e) => setDesde(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Hasta</label>
                  <input
                    type="date"
                    value={hasta}
                    min={desde}
                    onChange={(e) => setHasta(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9"
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Módulo</label>
              <Select value={modulo || "all"} onValueChange={(v) => setModulo(v === "all" ? "" : v as Modulo)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {MODULOS.filter((m) => m.id).map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Área</label>
              <Select value={filtroArea || "all"} onValueChange={(v) => setFiltroArea(v === "all" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Array.from(areasMap.entries()).map(([id, label]) => (
                    <SelectItem key={id} value={id}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">HVAC</label>
              <Select value={filtroHvac || "all"} onValueChange={(v) => setFiltroHvac(v === "all" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Array.from(hvacMap.entries()).map(([id, label]) => (
                    <SelectItem key={id} value={id}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 lg:col-span-6">
              <label className="text-xs font-medium text-muted-foreground">Agrupar por</label>
              <div className="mt-1 inline-flex rounded-md border border-input bg-background p-0.5">
                {(["registro", "area", "hvac", "modulo"] as AgruparPor[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setAgrupar(opt)}
                    className={`px-3 py-1 text-xs rounded ${agrupar === opt ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {opt === "registro" ? "Registro" : opt === "area" ? "Área" : opt === "hvac" ? "HVAC" : "Módulo"}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <KPI label="Registros analizados" value={kpis.total} />
          <KPI label="Cumplen mínimo (≥90)" value={`${kpis.cumplen}/${kpis.total}`} tone={kpis.cumplen === kpis.total ? "success" : kpis.cumplen >= kpis.total * 0.8 ? "warning" : "destructive"} />
          <KPI label="Con fuera de spec" value={kpis.conDesviaciones} tone={kpis.conDesviaciones === 0 ? "success" : "warning"} />
          <KPI label="Total de lecturas" value={kpis.totalLecturas.toLocaleString("es-MX")} />
        </div>

        {periodoEsParcial && (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
            <strong>Trimestre parcial:</strong> Q{trimestre} {anio} aún en curso. Las métricas reflejan lo capturado hasta hoy.
          </div>
        )}

        {/* Resultados */}
        <section className="mt-6 space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos para el periodo y filtros seleccionados.</p>
          ) : (
            grupos.map((g) => (
              <Card key={g.etiqueta}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{agrupar === "registro" ? g.items[0].registro.nombre : g.etiqueta}</span>
                    <Badge variant="outline">{g.items.length} registro(s)</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium">Registro</th>
                        <th className="px-2 py-2 text-center font-medium">Lecturas</th>
                        <th className="px-2 py-2 text-center font-medium">vs {MINIMO_NORMATIVO}</th>
                        <th className="px-2 py-2 text-center font-medium">Cumple</th>
                        <th className="px-2 py-2 text-left font-medium">Serie</th>
                        <th className="px-2 py-2 text-center font-medium">Media</th>
                        <th className="px-2 py-2 text-center font-medium">σ</th>
                        <th className="px-2 py-2 text-center font-medium">Min</th>
                        <th className="px-2 py-2 text-center font-medium">Max</th>
                        <th className="px-2 py-2 text-center font-medium">LIE / LSE</th>
                        <th className="px-2 py-2 text-center font-medium">Fuera spec</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.flatMap((a) =>
                        a.series.map((s, idx) => (
                          <tr key={a.registro.id + s.serie} className="border-t border-border align-top">
                            {idx === 0 && (
                              <>
                                <td rowSpan={a.series.length} className="px-2 py-2 font-medium text-foreground">
                                  <div>{a.registro.nombre}</div>
                                  <div className="text-[10px] text-muted-foreground">{a.registro.modulo} · {a.registro.iso ?? "—"}</div>
                                </td>
                                <td rowSpan={a.series.length} className="px-2 py-2 text-center tabular-nums">{a.totalLecturas}</td>
                                <td rowSpan={a.series.length} className="px-2 py-2 text-center tabular-nums">
                                  <span className={a.cumpleMinimo ? "text-success" : a.porcentajeMinimo >= 60 ? "text-warning" : "text-destructive"}>
                                    {a.porcentajeMinimo}%
                                  </span>
                                </td>
                                <td rowSpan={a.series.length} className="px-2 py-2 text-center">
                                  {a.cumpleMinimo
                                    ? <CheckCircle2 className="inline h-5 w-5 text-success" />
                                    : a.porcentajeMinimo >= 60
                                      ? <AlertTriangle className="inline h-5 w-5 text-warning" />
                                      : <XCircle className="inline h-5 w-5 text-destructive" />}
                                </td>
                              </>
                            )}
                            <td className="px-2 py-2">{s.serie} <span className="text-muted-foreground">{s.unidad}</span></td>
                            <td className="px-2 py-2 text-center tabular-nums">{s.media != null ? s.media.toFixed(2) : "—"}</td>
                            <td className="px-2 py-2 text-center tabular-nums">{s.sd != null ? s.sd.toFixed(2) : "—"}</td>
                            <td className="px-2 py-2 text-center tabular-nums">{s.min != null ? s.min.toFixed(2) : "—"}</td>
                            <td className="px-2 py-2 text-center tabular-nums">{s.max != null ? s.max.toFixed(2) : "—"}</td>
                            <td className="px-2 py-2 text-center text-[11px] text-muted-foreground">
                              {s.lie ?? "—"} / {s.lse ?? "—"}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {s.fueraSpec.total === 0 ? (
                                <span className="text-success">0</span>
                              ) : (
                                <span className="text-destructive font-medium">
                                  {s.fueraSpec.total} ({s.fueraSpec.altos}↑ {s.fueraSpec.bajos}↓)
                                </span>
                              )}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))
          )}
        </section>
      </main>
    </div>
  );
}

function KPI({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "success" | "warning" | "destructive" }) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold tabular-nums mt-1 ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
