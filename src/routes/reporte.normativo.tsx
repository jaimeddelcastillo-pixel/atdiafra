import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment as FragmentWithKey, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, RefreshCw, FileSpreadsheet, FileText, ShieldCheck,
  AlertTriangle, XCircle, CheckCircle2, ChevronDown, ChevronRight,
  X, ArrowUp, ArrowDown, Link2, Filter,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { listRegistros, type Registro, type Modulo } from "@/lib/semanas";
import { listAreas, listSistemasHVAC } from "@/lib/catalogos";
import {
  analizarRegistro, claveGrupo, etiquetaGrupo, MINIMO_NORMATIVO, CPK_WARN, CPK_FAIL,
  tipoRegistroReporte, etiquetaTipoRegistro,
  type AgruparPor, type AnalisisRegistro, type Periodo, type Trimestre, type TipoRegistroReporte,
} from "@/lib/normativo";
import { exportarNormativoExcel, exportarNormativoPDF } from "@/lib/export-normativo";

type TabKey = "todos" | "areas" | "instrumentos";
type SortKey = "nombre" | "lecturas" | "porcentaje" | "cpk" | "fuera";
type SortDir = "asc" | "desc";
type Severidad = "ok" | "warning" | "critical";

type SearchState = {
  tipo?: "trimestre" | "anual" | "custom";
  anio?: number;
  q?: Trimestre;
  desde?: string;
  hasta?: string;
  modulo?: Modulo | "";
  area?: string;
  hvac?: string;
  agrupar?: AgruparPor;
  tab?: TabKey;
  sort?: SortKey;
  dir?: SortDir;
  nc?: boolean;
};

export const Route = createFileRoute("/reporte/normativo")({
  head: () => ({
    meta: [
      { title: "Reporte normativo trimestral — TRACEA" },
      { name: "description", content: "Cumplimiento normativo trimestral y anual con análisis estadístico." },
    ],
  }),
  validateSearch: (raw: Record<string, unknown>): SearchState => {
    const asStr = (v: unknown) => (typeof v === "string" ? v : undefined);
    const asNum = (v: unknown) => {
      const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
      return Number.isFinite(n) ? n : undefined;
    };
    const asBool = (v: unknown) => v === true || v === "true" || v === "1";
    const tipo = ["trimestre", "anual", "custom"].includes(String(raw.tipo)) ? (raw.tipo as SearchState["tipo"]) : undefined;
    const modulo = ["temphr", "filtros", "presiones", "agua", ""].includes(String(raw.modulo)) ? (raw.modulo as SearchState["modulo"]) : undefined;
    const agrupar = ["registro", "area", "hvac", "modulo"].includes(String(raw.agrupar)) ? (raw.agrupar as AgruparPor) : undefined;
    const tab = ["todos", "areas", "instrumentos"].includes(String(raw.tab)) ? (raw.tab as TabKey) : undefined;
    const sort = ["nombre", "lecturas", "porcentaje", "cpk", "fuera"].includes(String(raw.sort)) ? (raw.sort as SortKey) : undefined;
    const dir = ["asc", "desc"].includes(String(raw.dir)) ? (raw.dir as SortDir) : undefined;
    const qN = asNum(raw.q);
    return {
      tipo,
      anio: asNum(raw.anio),
      q: (qN && qN >= 1 && qN <= 4 ? (qN as Trimestre) : undefined),
      desde: asStr(raw.desde),
      hasta: asStr(raw.hasta),
      modulo,
      area: asStr(raw.area),
      hvac: asStr(raw.hvac),
      agrupar,
      tab,
      sort,
      dir,
      nc: raw.nc !== undefined ? asBool(raw.nc) : undefined,
    };
  },
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

/** Peor Cpk (mínimo entre series con n suficiente). null si ninguna. */
function peorCpk(a: AnalisisRegistro): number | null {
  const vals = a.series.filter((s) => !s.cpkInsuficiente && s.cpk != null).map((s) => s.cpk as number);
  return vals.length ? Math.min(...vals) : null;
}

function hayFueraSpec(a: AnalisisRegistro): number {
  return a.series.reduce((s, r) => s + r.fueraSpec.total, 0);
}

/**
 * Tono de fila:
 *  · critical → No Conformidad real (fueraSpec o sin mínimo normativo).
 *  · warning  → Sin NC, pero hay alerta estadística (Cpk < 1.33).
 *  · ok       → Conforme y capaz. NUNCA se marca critical por Cpk solo.
 */
function severidad(a: AnalisisRegistro): Severidad {
  const fs = hayFueraSpec(a);
  const cpk = peorCpk(a);
  if (fs > 0 || !a.cumpleMinimo) return "critical";
  if (cpk != null && cpk < CPK_WARN) return "warning";
  return "ok";
}

function NormativoPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/reporte/normativo" });

  // Defaults derivados
  const currentYear = new Date().getFullYear();
  const tipo: "trimestre" | "anual" | "custom" = search.tipo ?? "trimestre";
  const anio = search.anio ?? currentYear;
  const trimestre = (search.q ?? trimestreActual()) as Trimestre;
  const desde = search.desde ?? `${currentYear}-01-01`;
  const hasta = search.hasta ?? new Date().toISOString().slice(0, 10);
  const modulo: Modulo | "" = search.modulo ?? "";
  const filtroArea = search.area ?? "";
  const filtroHvac = search.hvac ?? "";
  const agrupar: AgruparPor = search.agrupar ?? "registro";
  const tab: TabKey = search.tab ?? "todos";
  const sort: SortKey = search.sort ?? "porcentaje";
  const dir: SortDir = search.dir ?? "asc";
  const soloNC = search.nc ?? false;

  const updateSearch = (patch: Partial<SearchState>) => {
    navigate({ search: (prev: SearchState) => ({ ...prev, ...patch }), replace: true });
  };

  const [registros, setRegistros] = useState<Registro[]>([]);
  const [areasMap, setAreasMap] = useState<Map<string, string>>(new Map());
  const [hvacMap, setHvacMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [incluirGraficas, setIncluirGraficas] = useState(true);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
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

  const analisisAll = useMemo<AnalisisRegistro[]>(
    () => filtradosFinal.map((r) => analizarRegistro(r, periodo)),
    [filtradosFinal, periodo],
  );

  // Split por tipo
  const analisisAreas = useMemo(
    () => analisisAll.filter((a) => tipoRegistroReporte(a.registro) !== "instrumento"),
    [analisisAll],
  );
  const analisisInstrumentos = useMemo(
    () => analisisAll.filter((a) => tipoRegistroReporte(a.registro) === "instrumento"),
    [analisisAll],
  );

  // Analisis para exportar/analizar según tab activo
  const analisisTab = tab === "areas" ? analisisAreas : tab === "instrumentos" ? analisisInstrumentos : analisisAll;

  // Aplicar filtro "solo no conformidades"
  const analisisVisible = useMemo(() => {
    const base = soloNC ? analisisTab.filter((a) => severidad(a) !== "ok") : analisisTab;
    // Sort
    const sorted = [...base].sort((a, b) => {
      let av = 0, bv = 0, cmp = 0;
      switch (sort) {
        case "nombre":
          cmp = a.registro.nombre.localeCompare(b.registro.nombre); break;
        case "lecturas":
          av = a.totalLecturas; bv = b.totalLecturas; cmp = av - bv; break;
        case "porcentaje":
          av = a.porcentajeMinimo; bv = b.porcentajeMinimo; cmp = av - bv; break;
        case "cpk": {
          const ac = peorCpk(a); const bc = peorCpk(b);
          if (ac == null && bc == null) cmp = 0;
          else if (ac == null) cmp = 1;
          else if (bc == null) cmp = -1;
          else cmp = ac - bc;
          break;
        }
        case "fuera":
          cmp = hayFueraSpec(a) - hayFueraSpec(b); break;
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [analisisTab, soloNC, sort, dir]);

  // KPIs sobre analisisTab (no filtrado por NC — la barra siempre refleja el total del tab)
  const kpis = useMemo(() => {
    const total = analisisTab.length;
    const cumplen = analisisTab.filter((a) => a.cumpleMinimo).length;
    const criticos = analisisTab.filter((a) => severidad(a) === "critical").length;
    const advertencias = analisisTab.filter((a) => severidad(a) === "warning").length;
    const totalLecturas = analisisTab.reduce((s, a) => s + a.totalLecturas, 0);
    return { total, cumplen, criticos, advertencias, totalLecturas };
  }, [analisisTab]);

  const periodoEsParcial = tipo === "trimestre" && anio === currentYear && trimestre === trimestreActual();

  const handleExcel = () => {
    try {
      exportarNormativoExcel(analisisTab, agrupar, { areas: areasMap, hvac: hvacMap });
      toast.success("Excel generado");
    } catch (e: any) {
      toast.error("Error: " + e.message);
    }
  };
  const handlePDF = () => {
    const t = toast.loading(incluirGraficas ? "Generando PDF con gráficas…" : "Generando PDF…");
    setTimeout(() => {
      try {
        exportarNormativoPDF(analisisTab, agrupar, { areas: areasMap, hvac: hvacMap }, { incluirGraficas });
        toast.success("PDF generado", { id: t });
      } catch (e: any) {
        toast.error("Error: " + e.message, { id: t });
      }
    }, 50);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Enlace copiado — mismos filtros y ordenamiento");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandidos);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandidos(next);
  };

  const toggleSort = (key: SortKey) => {
    if (sort === key) updateSearch({ dir: dir === "asc" ? "desc" : "asc" });
    else updateSearch({ sort: key, dir: key === "nombre" ? "asc" : "desc" });
  };

  // Chips de filtros activos
  const chips: { key: string; label: string; onRemove?: () => void }[] = [];
  const periodoLabel =
    tipo === "anual" ? `Anual ${anio}` :
    tipo === "custom" ? `${desde} → ${hasta}` :
    `Q${trimestre} ${anio}`;
  chips.push({ key: "periodo", label: `Periodo: ${periodoLabel}` });
  if (modulo) {
    const l = MODULOS.find((m) => m.id === modulo)?.label ?? modulo;
    chips.push({ key: "modulo", label: `Módulo: ${l}`, onRemove: () => updateSearch({ modulo: "" }) });
  }
  if (filtroArea) {
    chips.push({ key: "area", label: `Área: ${areasMap.get(filtroArea) ?? filtroArea}`, onRemove: () => updateSearch({ area: "" }) });
  }
  if (filtroHvac) {
    chips.push({ key: "hvac", label: `HVAC: ${hvacMap.get(filtroHvac) ?? filtroHvac}`, onRemove: () => updateSearch({ hvac: "" }) });
  }
  if (soloNC) {
    chips.push({ key: "nc", label: "Solo no conformidades", onRemove: () => updateSearch({ nc: false }) });
  }

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
            <Button size="sm" variant="outline" onClick={handleCopyLink} className="gap-1">
              <Link2 className="h-4 w-4" /> Copiar enlace
            </Button>
            <Button size="sm" variant="outline" onClick={handleExcel} disabled={loading || analisisTab.length === 0} className="gap-1">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <label className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-input rounded-md px-2 h-9">
              <input
                type="checkbox"
                checked={incluirGraficas}
                onChange={(e) => setIncluirGraficas(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Gráficas
            </label>
            <Button size="sm" onClick={handlePDF} disabled={loading || analisisTab.length === 0} className="gap-1">
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        {/* Controles */}
        <Card className="mt-6">
          <CardContent className="pt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Periodo</label>
              <Select value={tipo} onValueChange={(v) => updateSearch({ tipo: v as SearchState["tipo"] })}>
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
                  onChange={(e) => updateSearch({ anio: parseInt(e.target.value, 10) || currentYear })}
                  className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9"
                />
              </div>
            )}
            {tipo === "trimestre" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Trimestre</label>
                <Select value={String(trimestre)} onValueChange={(v) => updateSearch({ q: Number(v) as Trimestre })}>
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
                    onChange={(e) => updateSearch({ desde: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Hasta</label>
                  <input
                    type="date"
                    value={hasta}
                    min={desde}
                    onChange={(e) => updateSearch({ hasta: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9"
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Módulo</label>
              <Select value={modulo || "all"} onValueChange={(v) => updateSearch({ modulo: v === "all" ? "" : v as Modulo })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {MODULOS.filter((m) => m.id).map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Área</label>
              <Select value={filtroArea || "all"} onValueChange={(v) => updateSearch({ area: v === "all" ? "" : v })}>
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
              <Select value={filtroHvac || "all"} onValueChange={(v) => updateSearch({ hvac: v === "all" ? "" : v })}>
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
              <label className="text-xs font-medium text-muted-foreground">Agrupar en el reporte (PDF/Excel)</label>
              <div className="mt-1 inline-flex rounded-md border border-input bg-background p-0.5">
                {(["registro", "area", "hvac", "modulo"] as AgruparPor[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => updateSearch({ agrupar: opt })}
                    className={`px-3 py-1 text-xs rounded ${agrupar === opt ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {opt === "registro" ? "Registro" : opt === "area" ? "Área" : opt === "hvac" ? "HVAC" : "Módulo"}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Selección manual (colapsable) */}
        <Card className="mt-4">
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={seleccionManual}
                  onChange={(e) => {
                    setSeleccionManual(e.target.checked);
                    if (e.target.checked && seleccionados.size === 0) {
                      setSeleccionados(new Set(filtrados.map((r) => r.id)));
                    }
                  }}
                />
                Selección manual de registros
                <span className="text-xs text-muted-foreground">
                  ({seleccionManual ? `${seleccionados.size} de ${filtrados.length}` : `todos: ${filtrados.length}`})
                </span>
              </label>
              {seleccionManual && (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSeleccionados(new Set(filtrados.map((r) => r.id)))}>
                    Todos
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSeleccionados(new Set())}>
                    Ninguno
                  </Button>
                </div>
              )}
            </div>
            {seleccionManual && (
              <div className="max-h-56 overflow-y-auto rounded-md border border-border p-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {filtrados.length === 0 ? (
                  <p className="text-xs text-muted-foreground col-span-full">Ningún registro coincide con los filtros.</p>
                ) : (
                  filtrados.map((r) => (
                    <label key={r.id} className="inline-flex items-center gap-2 text-xs text-foreground hover:bg-muted/50 rounded px-1 py-0.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={seleccionados.has(r.id)}
                        onChange={(e) => {
                          const next = new Set(seleccionados);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          setSeleccionados(next);
                        }}
                      />
                      <span className="truncate">{r.nombre}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{r.modulo}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPIs semáforo */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KPI label="Registros" value={kpis.total} tone="default" />
          <KPI label="Cumplen normativo" value={`${kpis.total - kpis.criticos}/${kpis.total}`} tone={kpis.criticos === 0 ? "success" : "destructive"} />
          <KPI label="No conformidades" value={kpis.criticos} tone={kpis.criticos === 0 ? "success" : "destructive"} />
          <KPI label="Alertas estadísticas" value={kpis.advertencias} tone={kpis.advertencias === 0 ? "success" : "warning"} />
          <KPI label="Lecturas" value={kpis.totalLecturas.toLocaleString("es-MX")} tone="default" />
        </div>

        {periodoEsParcial && (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
            <strong>Trimestre parcial:</strong> Q{trimestre} {anio} aún en curso. Las métricas reflejan lo capturado hasta hoy.
          </div>
        )}

        {/* Chips de filtros activos */}
        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /> Filtros:
            </span>
            {chips.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground"
              >
                {c.label}
                {c.onRemove && (
                  <button
                    onClick={c.onRemove}
                    className="hover:text-destructive rounded-full"
                    aria-label={`Quitar ${c.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
            {chips.some((c) => c.onRemove) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => updateSearch({ modulo: "", area: "", hvac: "", nc: false })}
              >
                Limpiar todo
              </Button>
            )}
          </div>
        )}

        {/* Tabs + acciones de tabla */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={(v) => updateSearch({ tab: v as TabKey })}>
            <TabsList>
              <TabsTrigger value="todos">Todos <Badge variant="secondary" className="ml-2">{analisisAll.length}</Badge></TabsTrigger>
              <TabsTrigger value="areas">Áreas / pares <Badge variant="secondary" className="ml-2">{analisisAreas.length}</Badge></TabsTrigger>
              <TabsTrigger value="instrumentos">Instrumentos <Badge variant="secondary" className="ml-2">{analisisInstrumentos.length}</Badge></TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-foreground border border-input rounded-md px-2 h-9 cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                checked={soloNC}
                onChange={(e) => updateSearch({ nc: e.target.checked })}
              />
              Solo no conformidades
            </label>
          </div>
        </div>

        {/* Tabla */}
        <Card className="mt-4">
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <p className="text-sm text-muted-foreground p-6">Cargando…</p>
            ) : analisisVisible.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6">
                {soloNC ? "Sin no conformidades en el periodo seleccionado." : "Sin datos para el periodo y filtros seleccionados."}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 px-2 py-3"></th>
                    <SortableTh label="Registro" onClick={() => toggleSort("nombre")} active={sort === "nombre"} dir={dir} align="left" />
                    <th className="px-3 py-3 text-left font-medium">Tipo</th>
                    <SortableTh label="Lecturas" onClick={() => toggleSort("lecturas")} active={sort === "lecturas"} dir={dir} />
                    <SortableTh label={`% vs ${MINIMO_NORMATIVO}`} onClick={() => toggleSort("porcentaje")} active={sort === "porcentaje"} dir={dir} />
                    <SortableTh label="Cpk peor" onClick={() => toggleSort("cpk")} active={sort === "cpk"} dir={dir} />
                    <SortableTh label="Fuera spec" onClick={() => toggleSort("fuera")} active={sort === "fuera"} dir={dir} />
                    <th className="px-3 py-3 text-center font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {analisisVisible.map((a) => {
                    const isOpen = expandidos.has(a.registro.id);
                    const sev = severidad(a);
                    const cpk = peorCpk(a);
                    const fs = hayFueraSpec(a);
                    const rowTone =
                      sev === "critical" ? "bg-destructive/5 hover:bg-destructive/10" :
                      sev === "warning" ? "bg-warning/5 hover:bg-warning/10" :
                      "hover:bg-muted/30";
                    const tipoReg: TipoRegistroReporte = tipoRegistroReporte(a.registro);
                    return (
                      <FragmentWithKey key={a.registro.id}>
                        <tr
                          className={`border-t border-border cursor-pointer transition-colors ${rowTone}`}
                          onClick={() => toggleExpand(a.registro.id)}
                        >
                          <td className="px-2 py-3 text-center">
                            {isOpen
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground inline" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground inline" />}
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-foreground">{a.registro.nombre}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {a.registro.modulo}
                              {a.registro.iso ? ` · ${a.registro.iso}` : ""}
                              {a.registro.area_id && areasMap.get(a.registro.area_id)
                                ? ` · ${areasMap.get(a.registro.area_id)}`
                                : ""}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Badge
                              variant="outline"
                              className={
                                tipoReg === "instrumento" ? "border-accent text-accent-foreground" :
                                tipoReg === "par_cuartos" ? "border-primary/40 text-primary" : ""
                              }
                            >
                              {etiquetaTipoRegistro(tipoReg)}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-center tabular-nums">{a.totalLecturas}</td>
                          <td className="px-3 py-3 text-center tabular-nums">
                            <span className={a.cumpleMinimo ? "text-success font-medium" : a.porcentajeMinimo >= 60 ? "text-warning font-medium" : "text-destructive font-medium"}>
                              {a.porcentajeMinimo}%
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center tabular-nums">
                            {cpk == null ? (
                              <span className="text-[11px] italic text-muted-foreground">n insuf.</span>
                            ) : (
                              <span
                                className={cpk < CPK_WARN ? "text-warning font-medium" : "text-success font-medium"}
                                title={cpk < CPK_FAIL ? "Capacidad baja — alerta estadística (no NC)" : cpk < CPK_WARN ? "Capacidad marginal" : "Capacidad adecuada"}
                              >
                                {cpk.toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {fs === 0 ? (
                              <span className="text-success">0</span>
                            ) : (
                              <span className="text-destructive font-medium">{fs}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {sev === "critical" ? <XCircle className="inline h-5 w-5 text-destructive" /> :
                             sev === "warning" ? <AlertTriangle className="inline h-5 w-5 text-warning" /> :
                             <CheckCircle2 className="inline h-5 w-5 text-success" />}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-muted/20 border-t border-border">
                            <td colSpan={8} className="p-4">
                              <SerieDetail a={a} />
                            </td>
                          </tr>
                        )}
                      </FragmentWithKey>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <p className="mt-3 text-xs text-muted-foreground">
          Se muestran {analisisVisible.length} de {analisisTab.length} registro(s) en la vista "{tab === "todos" ? "Todos" : tab === "areas" ? "Áreas / pares" : "Instrumentos"}"
          {soloNC ? " · filtrando solo no conformidades" : ""}
          {" · "}Agrupación en reporte: {agrupar}
        </p>
      </main>
    </div>
  );
}

function SortableTh({
  label, onClick, active, dir, align = "center",
}: { label: string; onClick: () => void; active: boolean; dir: SortDir; align?: "left" | "center" }) {
  return (
    <th className={`px-3 py-3 font-medium ${align === "left" ? "text-left" : "text-center"}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

function SerieDetail({ a }: { a: AnalisisRegistro }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Serie</th>
            <th className="px-2 py-1.5 text-center font-medium">n</th>
            <th className="px-2 py-1.5 text-center font-medium">Media</th>
            <th className="px-2 py-1.5 text-center font-medium">σ</th>
            <th className="px-2 py-1.5 text-center font-medium">Min</th>
            <th className="px-2 py-1.5 text-center font-medium">Max</th>
            <th className="px-2 py-1.5 text-center font-medium">LIE / LSE</th>
            <th className="px-2 py-1.5 text-center font-medium">% dentro</th>
            <th className="px-2 py-1.5 text-center font-medium">Cpk</th>
            <th className="px-2 py-1.5 text-center font-medium">Fuera spec</th>
          </tr>
        </thead>
        <tbody>
          {a.series.map((s) => (
            <tr key={s.serie} className="border-t border-border/60">
              <td className="px-2 py-1.5">
                {s.serie} <span className="text-muted-foreground">{s.unidad}</span>
              </td>
              <td className="px-2 py-1.5 text-center tabular-nums">{s.n}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{s.media != null ? s.media.toFixed(2) : "—"}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{s.sd != null ? s.sd.toFixed(2) : "—"}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{s.min != null ? s.min.toFixed(2) : "—"}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{s.max != null ? s.max.toFixed(2) : "—"}</td>
              <td className="px-2 py-1.5 text-center text-muted-foreground">{s.lie ?? "—"} / {s.lse ?? "—"}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">
                {s.pctDentroSpec != null ? `${s.pctDentroSpec.toFixed(1)}%` : "—"}
              </td>
              <td className="px-2 py-1.5 text-center tabular-nums">
                {s.cpkInsuficiente ? (
                  <span className="text-[10px] italic text-muted-foreground">n insuf.</span>
                ) : s.cpk != null ? (
                  <span
                    className={s.cpk < CPK_WARN ? "text-warning font-medium" : "text-success font-medium"}
                    title={s.cpk < CPK_FAIL ? "Capacidad baja — alerta estadística" : s.cpk < CPK_WARN ? "Capacidad marginal" : "Capacidad adecuada"}
                  >
                    {s.cpk.toFixed(2)}
                  </span>
                ) : "—"}
              </td>
              <td className="px-2 py-1.5 text-center">
                {s.fueraSpec.total === 0 ? (
                  <span className="text-success">0</span>
                ) : (
                  <span className="text-destructive font-medium">
                    {s.fueraSpec.total} <span className="text-[10px]">({s.fueraSpec.altos}↑ {s.fueraSpec.bajos}↓)</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KPI({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "success" | "warning" | "destructive" }) {
  const toneClass = {
    default: "text-foreground border-l-border",
    success: "text-success border-l-success",
    warning: "text-warning border-l-warning",
    destructive: "text-destructive border-l-destructive",
  }[tone];
  const [textColor, borderColor] = toneClass.split(" ");
  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold tabular-nums mt-1 ${textColor}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
