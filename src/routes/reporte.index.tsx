import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/lib/auth-context";
import { ChevronLeft, Trash, Eye, RefreshCw, FileSpreadsheet, FileText, Merge, ChevronRight, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  listRegistros, deleteRegistro, rangoFechasRegistro,
  detectarDuplicados, fusionarRegistros, type Registro,
} from "@/lib/semanas";
import { listAreas, listInstrumentos, listSistemasHVAC, type AreaClasificada, type Instrumento } from "@/lib/catalogos";
import { MODULOS } from "@/lib/diafra-data";
import { exportarNormativoExcel, exportarNormativoPDF } from "@/lib/export-normativo";
import { Input } from "@/components/ui/input";
import { VistaInstrumentos, VistaAvance } from "@/components/reporte/ReporteVistas";
import { MINIMO_NORMATIVO, analizarRegistro, semanasDelPeriodo, type Periodo } from "@/lib/normativo";

export const Route = createFileRoute("/reporte/")({
  head: () => ({
    meta: [
      { title: "Reporte consolidado — TRACEA" },
      { name: "description", content: "Exploración por área e instrumento, exportación con estadísticas y gráficas." },
    ],
  }),
  component: () => <AuthGuard><ReportePage /></AuthGuard>,
});

function moduloSlug(m: string): string {
  const map: Record<string, string> = {
    temphr: "temperatura-humedad",
    filtros: "filtros",
    presiones: "presiones",
    agua: "agua-purificada",
  };
  return map[m] ?? m;
}

/** Área efectiva: la del registro o, si no tiene, la del instrumento asignado. */
function areaEfectiva(
  r: Registro, areasMap: Map<string, AreaClasificada>, instrMap: Map<string, Instrumento>,
): { key: string; etiqueta: string; sinArea: boolean } {
  const deArea = (id: string) => {
    const a = areasMap.get(id);
    return { key: id, etiqueta: a ? `${a.codigo} · ${a.nombre}` : "Área desconocida", sinArea: false };
  };
  // Textos libres tipo "DCC-04 vs DCC-03" o "DSE-11 HVAC…": se agrupa por el área del primer código.
  const porCodigo = (txt: string) => {
    const cod = txt.match(/^\s*([A-Z]{2,4}-\d+)/)?.[1];
    if (!cod) return null;
    for (const a of areasMap.values()) if (a.codigo === cod) return deArea(a.id);
    return null;
  };
  if (r.area_id) return deArea(r.area_id);
  const libre = r.nombre_area_libre || r.codigo_area_libre;
  if (libre) return porCodigo(libre) ?? { key: `libre:${libre}`, etiqueta: libre, sinArea: false };
  const ins = r.instrumento_id ? instrMap.get(r.instrumento_id) : undefined;
  if (ins?.area_id) return deArea(ins.area_id);
  if (ins?.area_libre) return porCodigo(ins.area_libre) ?? { key: `libre:${ins.area_libre}`, etiqueta: ins.area_libre, sinArea: false };
  return { key: "sin-area", etiqueta: "Instrumento sin área asignada", sinArea: true };
}

function etiquetaInstrumento(r: Registro, instrMap: Map<string, Instrumento>): string {
  if (r.instrumento_id) {
    const i = instrMap.get(r.instrumento_id);
    return i ? `${i.codigo} · ${i.parametro}${/ vs /.test(i.area_libre ?? "") ? ` · Mide ${i.area_libre}` : ""}` : "Instrumento desconocido";
  }
  if (r.par_cuartos_id) return `Par cuartos`;
  if (r.hvac_id) return r.etapa ? `HVAC · ${r.etapa}` : "HVAC";
  return r.modulo;
}

function claveInstrumento(r: Registro): string {
  if (r.instrumento_id) return `i:${r.instrumento_id}`;
  if (r.par_cuartos_id) return `p:${r.par_cuartos_id}`;
  if (r.hvac_id) return `h:${r.hvac_id}:${r.etapa ?? ""}`;
  return `m:${r.modulo}`;
}

/**
 * Consolida múltiples registros del mismo instrumento (uno por importación/semana)
 * en un único Registro lógico con TODAS sus semanas fusionadas y ordenadas.
 * Esto garantiza que el reporte genere 1 página por instrumento, no 1 por semana.
 */
function consolidarPorInstrumento(regs: Registro[]): Registro[] {
  const grupos = new Map<string, Registro[]>();
  for (const r of regs) {
    const k = claveInstrumento(r);
    const arr = grupos.get(k);
    if (arr) arr.push(r);
    else grupos.set(k, [r]);
  }
  const out: Registro[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.length === 1) { out.push(grupo[0]); continue; }
    // Tomar el más antiguo como base; combinar semanas dedup por semana_inicio
    const base = [...grupo].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const semanasMap = new Map<string, typeof base.semanas[number]>();
    for (const r of grupo) {
      for (const s of r.semanas) {
        const prev = semanasMap.get(s.semana_inicio);
        // Conservar la más reciente si hay duplicado por fecha
        if (!prev || (s.saved_at ?? "") > (prev.saved_at ?? "")) {
          semanasMap.set(s.semana_inicio, s);
        }
      }
    }
    const semanas = Array.from(semanasMap.values()).sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));
    out.push({ ...base, semanas });
  }
  return out;
}

function ReportePage() {
  const { canDelete } = useAuth();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [areas, setAreas] = useState<AreaClasificada[]>([]);
  const [instrumentos, setInstrumentos] = useState<Instrumento[]>([]);
  const [hvacMap, setHvacMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  // Drill-down: área seleccionada → instrumento seleccionado
  const [vista, setVista] = useState<"area" | "instrumento" | "avance">("area");
  const [areaSel, setAreaSel] = useState<string | null>(null);
  const [instrSel, setInstrSel] = useState<string | null>(null);

  // Filtros de texto
  const [filtroArea, setFiltroArea] = useState("");
  const [filtroInstr, setFiltroInstr] = useState("");

  // Periodo desde / hasta (default: últimos 90 días)
  const hoy = new Date();
  const hace90 = new Date(); hace90.setDate(hoy.getDate() - 90);
  const [desde, setDesde] = useState<Date>(hace90);
  const [hasta, setHasta] = useState<Date>(hoy);

  const reload = async () => {
    setLoading(true);
    try {
      const [regs, ar, ins, hv] = await Promise.all([listRegistros(), listAreas(), listInstrumentos(), listSistemasHVAC()]);
      setRegistros(regs.filter((r) => r.activo !== false)); setAreas(ar); setInstrumentos(ins);
      setHvacMap(new Map(hv.map((h) => [h.id, `${h.codigo} · ${h.nombre_uma}`])));
    } catch (e: any) {
      toast.error("No se pudieron cargar datos: " + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const areasMap = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const instrMap = useMemo(() => new Map(instrumentos.map((i) => [i.id, i])), [instrumentos]);

  const periodo: Periodo = useMemo(() => ({
    tipo: "custom",
    desde: format(desde, "yyyy-MM-dd"),
    hasta: format(hasta, "yyyy-MM-dd"),
  }), [desde, hasta]);

  const periodoEtiqueta = `${format(desde, "dd/MM/yyyy")} – ${format(hasta, "dd/MM/yyyy")}`;

  // Agrupar todo por área (con filtro de texto)
  const grupoPorArea = useMemo(() => {
    const m = new Map<string, { etiqueta: string; registros: Registro[] }>();
    for (const r of registros) {
      const { key: k, etiqueta: et } = areaEfectiva(r, areasMap, instrMap);
      const cur = m.get(k);
      if (cur) cur.registros.push(r);
      else m.set(k, { etiqueta: et, registros: [r] });
    }
    const q = filtroArea.trim().toLowerCase();
    return Array.from(m.entries())
      .map(([k, v]) => ({ key: k, ...v }))
      .filter((g) => !q || g.etiqueta.toLowerCase().includes(q))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
  }, [registros, areasMap, instrMap, filtroArea]);

  // Para el área seleccionada, agrupar por instrumento (con filtro de texto)
  const instrumentosDelArea = useMemo(() => {
    if (!areaSel) return [];
    const grp = grupoPorArea.find((g) => g.key === areaSel);
    if (!grp) return [];
    const m = new Map<string, { etiqueta: string; registros: Registro[] }>();
    for (const r of grp.registros) {
      const k = claveInstrumento(r);
      const et = etiquetaInstrumento(r, instrMap);
      const cur = m.get(k);
      if (cur) cur.registros.push(r);
      else m.set(k, { etiqueta: et, registros: [r] });
    }
    const q = filtroInstr.trim().toLowerCase();
    return Array.from(m.entries())
      .map(([k, v]) => ({ key: k, ...v }))
      .filter((g) => !q || g.etiqueta.toLowerCase().includes(q))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
  }, [areaSel, grupoPorArea, instrMap, filtroInstr]);

  // Registros del instrumento seleccionado
  const registrosDelInstrumento = useMemo(() => {
    if (!instrSel) return [];
    const grp = instrumentosDelArea.find((g) => g.key === instrSel);
    return grp ? grp.registros : [];
  }, [instrSel, instrumentosDelArea]);

  // Conteo de lecturas en el periodo (para badge "≥90")
  const lecturasPeriodo = (r: Registro): number => {
    const sems = semanasDelPeriodo(r, periodo);
    const esTHR = r.modulo === "temphr";
    let n = 0;
    for (const s of sems) {
      n += (s.lecturas ?? []).filter((p) => !p._na && p.valor != null && Number.isFinite(p.valor)).length;
      if (esTHR) n += (s.lecturas_hr ?? []).filter((p) => !p._na && p.valor != null && Number.isFinite(p.valor)).length;
    }
    return n;
  };

  // Selección efectiva para exportar: si hay drill-down, usa eso; si no, todos.
  const registrosParaExportar: Registro[] = useMemo(() => {
    if (instrSel) return registrosDelInstrumento;
    if (areaSel) {
      const grp = grupoPorArea.find((g) => g.key === areaSel);
      return grp ? grp.registros : [];
    }
    return registros;
  }, [areaSel, instrSel, grupoPorArea, registrosDelInstrumento, registros]);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este registro y todas sus semanas?")) return;
    try {
      await deleteRegistro(id);
      await reload();
      toast.success("Registro eliminado");
    } catch (e: any) { toast.error("No se pudo eliminar: " + e.message); }
  };

  const duplicados = useMemo(() => detectarDuplicados(registros), [registros]);

  const handleFusionarGrupo = async (grupo: Registro[]) => {
    const principal = [...grupo].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const semanasTotales = grupo.reduce((acc, r) => acc + r.semanas.length, 0);
    if (!confirm(`Fusionar ${grupo.length} registros en uno solo.\n\nSe conserva: "${principal.nombre}".\nSe moverán ${semanasTotales} semanas. Los otros ${grupo.length - 1} se eliminarán.\n\n¿Continuar?`)) return;
    const t = toast.loading("Fusionando…");
    try {
      const res = await fusionarRegistros(grupo);
      await reload();
      toast.success(`Fusión OK: +${res.semanas} semanas, ${res.eliminados.length} eliminados`, { id: t });
    } catch (e: any) { toast.error("No se pudo fusionar: " + e.message, { id: t }); }
  };

  const onExport = (tipo: "excel" | "pdf") => {
    if (registrosParaExportar.length === 0) {
      toast.error("No hay registros para exportar en la selección actual");
      return;
    }
    try {
      // Consolida múltiples registros del mismo instrumento en uno solo
      // (1 página por instrumento, no 1 por semana/importación)
      const consolidados = consolidarPorInstrumento(registrosParaExportar);
      const analisis = consolidados.map((r) => analizarRegistro(r, periodo));
      const cat = {
        areas: new Map(areas.map((a) => [a.id, `${a.codigo} · ${a.nombre}`])),
        hvac: hvacMap,
      };
      if (tipo === "excel") exportarNormativoExcel(analisis, "area", cat);
      else exportarNormativoPDF(analisis, "area", cat, { incluirGraficas: true });
      toast.success(`${tipo === "excel" ? "Excel" : "PDF"} generado (${consolidados.length} instrumento(s) de ${registrosParaExportar.length} registros)`);
    } catch (e: any) {
      toast.error("No se pudo exportar: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-3">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
            <ChevronLeft className="h-4 w-4" /> Tablero
          </Link>
          <Link to="/reporte/normativo" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Reporte normativo (≥{MINIMO_NORMATIVO} lecturas) →
          </Link>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Reporte consolidado</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Navega <span className="font-medium text-foreground">Área → Instrumento → Registro</span>. Define un periodo y exporta con estadísticas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={reload} className="gap-1">
              <RefreshCw className="h-4 w-4" /> Actualizar
            </Button>
            <Button size="sm" variant="outline" onClick={() => onExport("excel")} disabled={loading} className="gap-1">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => onExport("pdf")} disabled={loading} className="gap-1">
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        </div>

        {/* Periodo */}
        <div className="mt-6 rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Desde</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !desde && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {desde ? format(desde, "dd/MM/yyyy") : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={desde}
                  onSelect={(d) => d && setDesde(d)}
                  initialFocus
                  captionLayout="dropdown"
                  defaultMonth={desde}
                  startMonth={new Date(2000, 0)}
                  endMonth={new Date(new Date().getFullYear() + 1, 11)}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Hasta</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !hasta && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {hasta ? format(hasta, "dd/MM/yyyy") : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={hasta}
                  onSelect={(d) => d && setHasta(d)}
                  initialFocus
                  captionLayout="dropdown"
                  defaultMonth={hasta}
                  startMonth={new Date(2000, 0)}
                  endMonth={new Date(new Date().getFullYear() + 1, 11)}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-wrap gap-1">
            {(() => {
              const a = new Date(); const y = a.getFullYear(); const m = a.getMonth();
              const q = Math.floor(m / 3); const s = m < 6 ? 0 : 6;
              const hace = (d: number) => { const b = new Date(); b.setDate(a.getDate() - d); return b; };
              const presets: { label: string; d: Date; h: Date }[] = [
                { label: "Últimos 90 días", d: hace(90), h: a },
                { label: "Trimestre actual", d: new Date(y, q * 3, 1), h: new Date(y, q * 3 + 3, 0) },
                { label: "Semestre actual", d: new Date(y, s, 1), h: new Date(y, s + 6, 0) },
                { label: "Año actual", d: new Date(y, 0, 1), h: new Date(y, 11, 31) },
                { label: "Últimos 12 meses", d: hace(365), h: a },
              ];
              const k = (x: Date) => format(x, "yyyy-MM-dd");
              return presets.map((p) => {
                const on = k(p.d) === k(desde) && k(p.h) === k(hasta);
                return (
                  <Button key={p.label} size="sm" variant={on ? "secondary" : "ghost"} onClick={() => { setDesde(p.d); setHasta(p.h); }}>
                    {p.label}
                  </Button>
                );
              });
            })()}
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Exportar usará la selección actual: <span className="font-medium text-foreground">{registrosParaExportar.length}</span> registro(s) · mínimo recomendado <span className="font-medium text-foreground">≥{MINIMO_NORMATIVO}</span> lecturas
          </div>
        </div>

        {/* Pestañas */}
        <div className="mt-6 inline-flex rounded-lg border border-border bg-card p-1 gap-1">
          {([
            ["area", "Por área"],
            ["instrumento", "Por instrumento"],
            ["avance", "Avance semanal"],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setVista(k)}
              className={cn("px-3 py-1.5 text-sm rounded-md", vista === k ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted")}>
              {l}
            </button>
          ))}
        </div>

        {vista === "instrumento" && !loading && (
          <VistaInstrumentos registros={registros} areaDe={(r) => areaEfectiva(r, areasMap, instrMap)} instrMap={instrMap} catalogo={instrumentos} areasMap={areasMap} desde={desde} hasta={hasta} />
        )}
        {vista === "avance" && !loading && (
          <VistaAvance registros={registros} areaDe={(r) => areaEfectiva(r, areasMap, instrMap)} instrMap={instrMap} catalogo={instrumentos} areasMap={areasMap} desde={desde} hasta={hasta} />
        )}

        {vista === "area" && (<>
        <p className="mt-3 text-xs text-muted-foreground">
          Cada área agrupa sus registros. Los registros de presiones toman el área de su instrumento. Da clic en una fila para ver sus instrumentos y registros.
        </p>
        {/* Breadcrumb drill-down */}
        <div className="mt-3 flex items-center flex-wrap gap-1 text-sm">
          <button
            onClick={() => { setAreaSel(null); setInstrSel(null); }}
            className={cn("px-2 py-1 rounded hover:bg-muted", !areaSel && "font-semibold text-foreground")}
          >
            Todas las áreas ({grupoPorArea.length})
          </button>
          {areaSel && (
            <>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button
                onClick={() => setInstrSel(null)}
                className={cn("px-2 py-1 rounded hover:bg-muted", !instrSel && "font-semibold text-foreground")}
              >
                {grupoPorArea.find((g) => g.key === areaSel)?.etiqueta ?? "—"} ({instrumentosDelArea.length} inst.)
              </button>
            </>
          )}
          {instrSel && (
            <>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="px-2 py-1 font-semibold text-foreground">
                {instrumentosDelArea.find((g) => g.key === instrSel)?.etiqueta ?? "—"} ({registrosDelInstrumento.length} reg.)
              </span>
            </>
          )}
        </div>

        {/* Filtros de búsqueda contextuales */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!areaSel && (
            <Input
              placeholder="Filtrar áreas por código o nombre…"
              value={filtroArea}
              onChange={(e) => setFiltroArea(e.target.value)}
              className="max-w-xs h-9"
            />
          )}
          {areaSel && !instrSel && (
            <Input
              placeholder="Filtrar instrumentos por código o parámetro…"
              value={filtroInstr}
              onChange={(e) => setFiltroInstr(e.target.value)}
              className="max-w-xs h-9"
            />
          )}
          {(filtroArea || filtroInstr) && (
            <Button size="sm" variant="ghost" onClick={() => { setFiltroArea(""); setFiltroInstr(""); }}>
              Limpiar filtro
            </Button>
          )}
        </div>

        {/* Duplicados (colapsable / pequeño) */}
        {duplicados.length > 0 && !areaSel && (
          <section className="mt-4 rounded-xl border border-warning/40 bg-warning/5 p-3">
            <details>
              <summary className="cursor-pointer text-sm font-medium flex items-center gap-2">
                <Merge className="h-4 w-4 text-warning" />
                {duplicados.length} grupo(s) de registros duplicados detectados
              </summary>
              <div className="mt-3 space-y-2">
                {duplicados.map((grupo, i) => (
                  <div key={i} className="rounded-md border border-border bg-card p-3 flex items-start justify-between gap-3 flex-wrap">
                    <div className="text-xs text-muted-foreground">
                      <div className="font-medium text-foreground text-sm">{grupo[0].nombre}</div>
                      {grupo.length} registros con semanas que se solapan
                    </div>
                    {canDelete && (
                      <Button size="sm" variant="outline" onClick={() => handleFusionarGrupo(grupo)} className="gap-1">
                        <Merge className="h-3.5 w-3.5" /> Fusionar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </section>
        )}

        {/* Tabla principal: cambia según drill-down */}
        <section className="mt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : !areaSel ? (
            <TablaAreas
              grupos={grupoPorArea}
              onSelect={(k) => setAreaSel(k)}
              lecturasPeriodo={lecturasPeriodo}
            />
          ) : !instrSel ? (
            <TablaInstrumentos
              grupos={instrumentosDelArea}
              onSelect={(k) => setInstrSel(k)}
              lecturasPeriodo={lecturasPeriodo}
            />
          ) : (
            <TablaRegistros
              registros={registrosDelInstrumento}
              lecturasPeriodo={lecturasPeriodo}
              onDelete={canDelete ? handleDelete : undefined}
            />
          )}
        </section>
        </>)}
      </main>
    </div>
  );
}

// ===== Sub-tablas =====

function TablaAreas({
  grupos, onSelect, lecturasPeriodo,
}: {
  grupos: { key: string; etiqueta: string; registros: Registro[] }[];
  onSelect: (k: string) => void;
  lecturasPeriodo: (r: Registro) => number;
}) {
  if (grupos.length === 0) return <p className="text-sm text-muted-foreground">Sin registros.</p>;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Área</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Instrumentos</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Registros</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Lecturas en periodo</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground"></th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const instrumentosCount = new Set(g.registros.map((r) => claveInstrumento(r))).size;
            const lecturas = g.registros.reduce((s, r) => s + lecturasPeriodo(r), 0);
            return (
              <tr key={g.key} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(g.key)}>
                <td className="px-3 py-3 font-medium text-foreground">{g.etiqueta}</td>
                <td className="px-3 py-3 text-center tabular-nums">{instrumentosCount}</td>
                <td className="px-3 py-3 text-center tabular-nums">{g.registros.length}</td>
                <td className={cn("px-3 py-3 text-center tabular-nums font-semibold", lecturas >= MINIMO_NORMATIVO ? "text-success" : "text-warning")}>
                  {lecturas}
                </td>
                <td className="px-3 py-3 text-right">
                  <ChevronRight className="h-4 w-4 inline text-muted-foreground" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TablaInstrumentos({
  grupos, onSelect, lecturasPeriodo,
}: {
  grupos: { key: string; etiqueta: string; registros: Registro[] }[];
  onSelect: (k: string) => void;
  lecturasPeriodo: (r: Registro) => number;
}) {
  if (grupos.length === 0) return <p className="text-sm text-muted-foreground">Sin instrumentos.</p>;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Instrumento</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Registros</th>
            <th className="px-3 py-2 text-center font-medium text-muted-foreground">Lecturas en periodo</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground"></th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const lecturas = g.registros.reduce((s, r) => s + lecturasPeriodo(r), 0);
            return (
              <tr key={g.key} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(g.key)}>
                <td className="px-3 py-3 font-medium text-foreground">{g.etiqueta}</td>
                <td className="px-3 py-3 text-center tabular-nums">{g.registros.length}</td>
                <td className={cn("px-3 py-3 text-center tabular-nums font-semibold", lecturas >= MINIMO_NORMATIVO ? "text-success" : "text-warning")}>
                  {lecturas}
                </td>
                <td className="px-3 py-3 text-right">
                  <ChevronRight className="h-4 w-4 inline text-muted-foreground" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TablaRegistros({
  registros, lecturasPeriodo, onDelete,
}: {
  registros: Registro[];
  lecturasPeriodo: (r: Registro) => number;
  onDelete?: (id: string) => void;
}) {
  if (registros.length === 0) return <p className="text-sm text-muted-foreground">Sin registros.</p>;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Registro</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rango</th>
              <th className="px-3 py-2 text-center font-medium text-muted-foreground">Semanas (totales)</th>
              <th className="px-3 py-2 text-center font-medium text-muted-foreground">Lecturas en periodo</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => {
              const moduloDef = MODULOS.find((m) => moduloSlug(r.modulo) === m.slug);
              const editable = moduloDef?.enabled;
              const lecturas = lecturasPeriodo(r);
              return (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{r.nombre}</div>
                    <div className="text-[11px] text-muted-foreground">{r.modulo} · {r.iso ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{rangoFechasRegistro(r)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.semanas.length}</td>
                  <td className={cn("px-3 py-2 text-center tabular-nums font-semibold", lecturas >= MINIMO_NORMATIVO ? "text-success" : "text-warning")}>
                    {lecturas}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Link
                        to="/reporte/$id"
                        params={{ id: r.id }}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        <Eye className="h-3 w-3" /> Detalle
                      </Link>
                      {editable && (
                        <Link
                          to="/modulo/$slug"
                          params={{ slug: moduloSlug(r.modulo) }}
                          search={{ registroId: r.id }}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                          title="Editar en módulo"
                        >
                          ✎
                        </Link>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(r.id)}
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
  );
}
