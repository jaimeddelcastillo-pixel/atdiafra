import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import JSZip from "jszip";
import { ChevronLeft, Copy, Download, FileSpreadsheet, FileText, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { listRegistros, type Registro } from "@/lib/semanas";
import { listAreas, listCambiosFiltro, listInstrumentos, listSistemasHVAC, type AreaClasificada, type CambioFiltro, type Instrumento, type SistemaHVAC } from "@/lib/catalogos";
import { construirBloques, etiquetaPeriodo, exportarPaqueteForVal16 } from "@/lib/export-forval16";
import { codigoRegistro, hvacDe, unirPorInstrumento } from "@/lib/seleccion-forval16";
import { coberturaReal, recortarSemanasPorFecha } from "@/lib/fechas-lectura";
import { SECCIONES, dictamenGlobal, generarTexto, type TextoForVal16 } from "@/lib/texto-forval16";
import { TendenciaCard, pngsDeTarjeta } from "@/components/tendencias/TendenciaCard";
import { descargarBlob } from "@/lib/imagen-grafica";

type Search = { ids?: string; desde?: string; hasta?: string; hvac?: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/reporte/tendencias")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ids: typeof s.ids === "string" ? s.ids : undefined,
    desde: typeof s.desde === "string" && ISO.test(s.desde) ? s.desde : undefined,
    hasta: typeof s.hasta === "string" && ISO.test(s.hasta) ? s.hasta : undefined,
    hvac: typeof s.hvac === "string" ? s.hvac : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Análisis de tendencias FOR-VAL-16-02 — TRACEA" },
      { name: "description", content: "Vista previa de gráficas de tendencia, calidad de datos y texto propuesto del FOR-VAL-16-02." },
      { property: "og:title", content: "Análisis de tendencias FOR-VAL-16-02 — TRACEA" },
      { property: "og:description", content: "Gráficas, límites y texto del reporte de tendencias listos para Word y Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AuthGuard><TendenciasPage /></AuthGuard>,
});

const pad = (n: number) => String(n).padStart(2, "0");
const finMes = (y: number, m: number) => `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
function periodosDe(y: number) {
  return [
    { l: "Año", d: `${y}-01-01`, h: `${y}-12-31` },
    { l: "S1", d: `${y}-01-01`, h: finMes(y, 6) }, { l: "S2", d: `${y}-07-01`, h: `${y}-12-31` },
    ...[1, 2, 3, 4].map((q) => ({ l: `T${q}`, d: `${y}-${pad((q - 1) * 3 + 1)}-01`, h: finMes(y, q * 3) })),
  ];
}

interface RegistroAT { id: string; codigo: string; justificaciones: Record<string, string>; texto: Partial<TextoForVal16> }

function TendenciasPage() {
  const search = Route.useSearch();
  const { user, hasRole } = useAuth();
  const puedeEditar = hasRole("editor") || hasRole("admin") || hasRole("super_admin");
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [instr, setInstr] = useState<Instrumento[]>([]);
  const [areas, setAreas] = useState<AreaClasificada[]>([]);
  const [hvacs, setHvacs] = useState<SistemaHVAC[]>([]);
  const [cambios, setCambios] = useState<CambioFiltro[]>([]);
  const [cargando, setCargando] = useState(true);

  const hoy = new Date();
  const [anio, setAnio] = useState(Number((search.desde ?? "").slice(0, 4)) || hoy.getFullYear());
  const [desde, setDesde] = useState(search.desde ?? `${hoy.getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(search.hasta ?? format(hoy, "yyyy-MM-dd"));
  const [modo, setModo] = useState<"hvac" | "instrumentos">(search.ids ? "instrumentos" : "hvac");
  const [hvacId, setHvacId] = useState(search.hvac ?? "");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [at, setAt] = useState("");
  const [registroAT, setRegistroAT] = useState<RegistroAT | null>(null);
  const [justif, setJustif] = useState<Record<string, string>>({});
  const [texto, setTexto] = useState<TextoForVal16 | null>(null);
  const [editado, setEditado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const tarjetasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([listRegistros(), listInstrumentos(), listAreas(), listSistemasHVAC(true), listCambiosFiltro().catch(() => [])])
      .then(([r, i, a, h, c]) => { setRegistros(r); setInstr(i); setAreas(a); setHvacs(h); setCambios(c); })
      .catch((e) => toast.error(`No se pudieron cargar los datos: ${e.message}`))
      .finally(() => setCargando(false));
  }, []);

  const instrMap = useMemo(() => new Map(instr.map((i) => [i.id, i])), [instr]);
  const areasMap = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const unidos = useMemo(() => unirPorInstrumento(registros), [registros]);

  // Preselección desde el botón FOR-VAL-16-02 de un instrumento
  useEffect(() => {
    if (!search.ids || !registros.length) return;
    const ids = new Set(search.ids.split(","));
    setSel(new Set(unidos.filter((u) => registros.some((r) => ids.has(r.id) && (r.instrumento_id ?? r.id) === (u.instrumento_id ?? u.id) && r.modulo === u.modulo)).map((u) => u.id)));
  }, [search.ids, registros, unidos]);

  // Siguiente consecutivo AT del año
  const sugerirAT = async (y: number) => {
    const { data } = await supabase.from("registro_analisis_tendencias").select("codigo").like("codigo", `AT-${y}-%`);
    const max = Math.max(0, ...(data ?? []).map((d) => Number(d.codigo.slice(8)) || 0));
    return `AT-${y}-${String(max + 1).padStart(3, "0")}`;
  };
  useEffect(() => { sugerirAT(new Date().getFullYear()).then((c) => setAt((v) => v || c)); }, []);

  // Cargar registro AT existente si el código ya existe
  useEffect(() => {
    if (!/^AT-\d{4}-\d{3}$/.test(at)) { setRegistroAT(null); return; }
    supabase.from("registro_analisis_tendencias").select("id,codigo,justificaciones,texto").eq("codigo", at).maybeSingle()
      .then(({ data }) => setRegistroAT(data ? { id: data.id, codigo: data.codigo, justificaciones: (data.justificaciones ?? {}) as Record<string, string>, texto: (data.texto ?? {}) as Partial<TextoForVal16> } : null));
  }, [at]);

  const elegidos = modo === "hvac" ? unidos.filter((r) => hvacId && hvacDe(r, instrMap, areasMap) === hvacId) : unidos.filter((r) => sel.has(r.id));
  const hvac = hvacs.find((h) => h.id === hvacId);
  const sistema = modo === "hvac" ? (hvac ? `${hvac.codigo} ${hvac.nombre_uma}` : "")
    : elegidos.length === 1 ? codigoRegistro(elegidos[0], instrMap) : elegidos.length ? "Instrumentos seleccionados" : "";
  const alcance: AlcanceTexto = modo === "hvac"
    ? { tipo: "hvac", codigo: hvac?.codigo ?? "", nombreUma: hvac?.nombre_uma ?? "", descripcion: hvac?.descripcion ?? "" }
    : { tipo: "instrumentos", codigos: [...new Set(elegidos.map((r) => codigoRegistro(r, instrMap)))].sort() };
  const fechasOk = ISO.test(desde) && ISO.test(hasta) && desde <= hasta;

  const { bloques } = useMemo(
    () => (fechasOk && elegidos.length ? construirBloques({ registros: elegidos, instrMap, areasMap, desde, hasta, hvac, cambiosFiltro: cambios }) : { bloques: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fechasOk, elegidos.map((e) => e.id).join(","), instrMap, areasMap, desde, hasta, hvac, cambios],
  );
  const cobertura = useMemo(() => coberturaReal(elegidos.flatMap((r) => recortarSemanasPorFecha(r.semanas, desde, hasta))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elegidos.map((e) => e.id).join(","), desde, hasta]);
  const textoAuto = useMemo(() => generarTexto(bloques, cobertura, alcance), [bloques, cobertura, alcance]);

  // Texto: el guardado del registro AT gana; si no, el generado (mientras no se edite).
  useEffect(() => {
    if (registroAT && Object.keys(registroAT.texto).length) { setTexto({ ...textoAuto, ...registroAT.texto }); setEditado(true); }
    else if (!editado) setTexto(textoAuto);
    if (registroAT) setJustif(registroAT.justificaciones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registroAT, textoAuto]);

  const insuficientes = bloques.filter((b) => b.calidad.suficiencia.startsWith("Insuficiente"));
  const faltaJustif = insuficientes.filter((b) => !justif[b.hoja]?.trim());
  const atValido = /^AT-\d{4}-\d{3}$/.test(at);
  const g = dictamenGlobal(bloques);

  const guardar = async (): Promise<boolean> => {
    if (!puedeEditar) { toast.error("Tu rol solo permite consultar. Pide a un editor que guarde el registro."); return false; }
    if (!atValido) { toast.error("Escribe un código con formato AT-AAAA-NNN."); return false; }
    if (faltaJustif.length) { toast.error(`Falta la justificación técnica de: ${faltaJustif.map((b) => b.hoja).join(", ")}`); return false; }
    const fila = {
      codigo: at, sistema: sistema || "Sin sistema", periodo_desde: desde, periodo_hasta: hasta,
      periodo_etiqueta: etiquetaPeriodo(desde, hasta).replaceAll("_", " "),
      instrumentos: bloques.map((b) => ({ codigo: b.codigo, variable: b.variable, bitacora: b.bitacora, n: b.n, dictamen: b.dict ? `${b.dict.estadoControl} · ${b.dict.cumplimientoEspecificacion}` : null })),
      usuario_id: user?.id ?? null, usuario_email: user?.email ?? null,
      dictamen_global: `${g.estado} · ${g.cumplimiento}`,
      justificaciones: Object.fromEntries(insuficientes.map((b) => [b.hoja, justif[b.hoja].trim()])),
      texto: texto ?? {},
    };
    if (registroAT) {
      const { error } = await supabase.from("registro_analisis_tendencias").update({ ...fila, updated_at: new Date().toISOString() }).eq("id", registroAT.id);
      if (error) { toast.error(`No se pudo guardar: ${error.message}`); return false; }
    } else {
      const { data, error } = await supabase.from("registro_analisis_tendencias").insert(fila).select("id").single();
      if (error) {
        toast.error(error.code === "23505" ? `El código ${at} ya está registrado. Usa otro.` : `No se pudo guardar: ${error.message}`);
        return false;
      }
      setRegistroAT({ id: data.id, codigo: at, justificaciones: fila.justificaciones, texto: fila.texto });
    }
    toast.success(`Registro ${at} guardado`);
    return true;
  };

  const exportar = async () => {
    if (!bloques.length) { toast.info("No hay lecturas en este periodo."); return; }
    setOcupado(true);
    try {
      if (!(await guardar())) return;
      const r = await exportarPaqueteForVal16({
        codigoAT: at, sistema: sistema || "Instrumentos", registros: elegidos, instrMap, areasMap, desde, hasta, hvac, cambiosFiltro: cambios,
        texto: texto ? SECCIONES.map((s) => ({ titulo: s.titulo, cuerpo: texto[s.k] })) : undefined,
      });
      toast.success(`Descargado ${r.archivo}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error al exportar"); }
    finally { setOcupado(false); }
  };

  const zipTodas = async () => {
    setOcupado(true);
    const t = toast.loading("Preparando imágenes…");
    try {
      const zip = new JSZip();
      for (const b of bloques) {
        const el = tarjetasRef.current?.querySelector<HTMLElement>(`[data-tarjeta="${CSS.escape(b.hoja)}"]`);
        if (el) for (const p of await pngsDeTarjeta(el, b)) zip.file(p.nombre, p.blob);
      }
      descargarBlob(await zip.generateAsync({ type: "blob" }), `Graficas_${at || "tendencias"}_${etiquetaPeriodo(desde, hasta)}.zip`);
      toast.success("ZIP descargado", { id: t });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear el ZIP", { id: t }); }
    finally { setOcupado(false); }
  };

  const visibles = unidos.filter((r) => !filtro.trim() || `${codigoRegistro(r, instrMap)} ${r.nombre}`.toLowerCase().includes(filtro.trim().toLowerCase()))
    .sort((a, b) => codigoRegistro(a, instrMap).localeCompare(codigoRegistro(b, instrMap)));
  const anios = [hoy.getFullYear() - 2, hoy.getFullYear() - 1, hoy.getFullYear()];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Link to="/reporte" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ChevronLeft className="h-4 w-4" /> Reporte consolidado
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Análisis de tendencias (FOR-VAL-16-02)</h1>
          <p className="text-sm text-muted-foreground mt-1">Elige qué analizar, revisa las gráficas y el texto, y llévalos a Word. Los números son los mismos del Excel.</p>
        </div>

        {/* 1. Selección */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h2 className="font-semibold">1. Qué analizar</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="at">Código de reporte</Label>
              <Input id="at" value={at} onChange={(e) => setAt(e.target.value.toUpperCase().trim())} placeholder="AT-2026-001" />
              <p className="text-xs text-muted-foreground">
                {!atValido ? "Formato: AT-AAAA-NNN." : registroAT ? "Este código ya está registrado: se actualizará al guardar." : "Código nuevo (siguiente consecutivo sugerido)."}
              </p>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Periodo (cada día por su fecha real)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>{anios.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
                {periodosDe(anio).map((p) => (
                  <Button key={p.l} size="sm" variant={desde === p.d && hasta === p.h ? "default" : "outline"} onClick={() => { setDesde(p.d); setHasta(p.h); }}>{p.l}</Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" aria-label="Desde" />
                <span>a</span>
                <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" aria-label="Hasta" />
                {!fechasOk && <span className="text-destructive text-xs">Revisa las fechas.</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={modo === "hvac" ? "default" : "outline"} onClick={() => setModo("hvac")}>Por sistema HVAC</Button>
            <Button size="sm" variant={modo === "instrumentos" ? "default" : "outline"} onClick={() => setModo("instrumentos")}>Elegir instrumentos</Button>
          </div>
          {modo === "hvac" ? (
            <div className="max-w-md space-y-1.5">
              <Select value={hvacId} onValueChange={setHvacId}>
                <SelectTrigger><SelectValue placeholder="Selecciona un sistema" /></SelectTrigger>
                <SelectContent>{hvacs.map((x) => <SelectItem key={x.id} value={x.id}>{x.codigo} · {x.nombre_uma}</SelectItem>)}</SelectContent>
              </Select>
              {hvacId && <p className="text-xs text-muted-foreground">{elegidos.length} instrumento(s): {elegidos.map((r) => codigoRegistro(r, instrMap)).sort().join(", ") || "ninguno ligado a este sistema"}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar instrumento…" className="max-w-sm" />
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
                {visibles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted cursor-pointer">
                    <Checkbox checked={sel.has(r.id)} onCheckedChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n; })} />
                    <span className="font-medium">{codigoRegistro(r, instrMap)}</span>
                    <span className="truncate text-xs text-muted-foreground">{r.modulo === "temphr" ? "T/HR" : "Presión"}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>

        {cargando ? <p className="text-sm text-muted-foreground">Cargando capturas…</p>
          : !elegidos.length ? <p className="text-sm text-muted-foreground">Elige un sistema o instrumentos para ver el análisis.</p>
          : !bloques.length ? <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">Ninguno de los instrumentos elegidos tiene lecturas entre {desde} y {hasta}. Cambia el periodo.</p>
          : (
          <>
            {/* 2. Calidad de datos */}
            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h2 className="font-semibold">2. Calidad de datos</h2>
              <p className="text-xs text-muted-foreground">
                Datos reales {cobertura.primera ? `del ${cobertura.primera.split("-").reverse().join("/")} al ${cobertura.ultima!.split("-").reverse().join("/")}` : "—"} · {cobertura.dias} días con lectura.
                Suficiencia según PNO-VAL-16 Tabla 2 (T/HR: días; presiones: lecturas). Días hábiles sin lectura no cuentan los marcados N/A.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground"><tr className="border-b border-border">
                    <th className="text-left p-2">Instrumento</th><th className="p-2">Variable</th><th className="p-2">Lecturas</th><th className="p-2">Días</th>
                    <th className="p-2">Hábiles sin lectura</th><th className="p-2">Dudosas (IA)</th><th className="p-2">Suficiencia</th>
                  </tr></thead>
                  <tbody>
                    {bloques.map((b) => {
                      const ins = b.calidad.suficiencia.startsWith("Insuficiente");
                      return (
                        <tr key={b.hoja} className="border-b border-border/60 align-top">
                          <td className="p-2 font-medium">{b.codigo}</td>
                          <td className="p-2 text-center">{b.variable}</td>
                          <td className="p-2 text-center tabular-nums">{b.calidad.nLecturas}</td>
                          <td className="p-2 text-center tabular-nums">{b.calidad.nDias}</td>
                          <td className={cn("p-2 text-center tabular-nums", b.calidad.habilesSinLectura > 0 && "text-warning font-medium")}>{b.calidad.habilesSinLectura}</td>
                          <td className={cn("p-2 text-center tabular-nums", b.calidad.dudosas > 0 && "text-warning font-medium")}>{b.calidad.dudosas}</td>
                          <td className="p-2">
                            <span className={cn("text-xs font-medium", ins ? "text-destructive" : b.calidad.suficiencia === "Aceptable" ? "text-warning" : "text-success")}>
                              {b.calidad.suficiencia} (n = {b.calidad.nSuficiencia})
                            </span>
                            {ins && (
                              <Textarea value={justif[b.hoja] ?? ""} onChange={(e) => setJustif((j) => ({ ...j, [b.hoja]: e.target.value }))}
                                placeholder="Justificación técnica obligatoria" className="mt-1 min-h-16 text-xs" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 3. Gráficas */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">3. Gráficas ({bloques.length})</h2>
                <Button size="sm" variant="outline" className="gap-1" onClick={zipTodas} disabled={ocupado}><Download className="h-4 w-4" /> Descargar todas (ZIP)</Button>
              </div>
              <div ref={tarjetasRef} className="grid gap-4 lg:grid-cols-2">
                {bloques.map((b) => <TendenciaCard key={b.hoja} b={b} />)}
              </div>
            </section>

            {/* 4. Texto */}
            {texto && (
              <section className="rounded-xl border border-border bg-card p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">4. Texto propuesto</h2>
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => { setTexto(textoAuto); setEditado(false); }}>
                    <RotateCcw className="h-4 w-4" /> Regenerar desde los datos
                  </Button>
                </div>
                {SECCIONES.map((s) => (
                  <div key={s.k} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>{s.titulo}</Label>
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={async () => {
                        try { await navigator.clipboard.writeText(texto[s.k]); toast.success("Texto copiado"); } catch { toast.error("No se pudo copiar"); }
                      }}><Copy className="h-3.5 w-3.5" /> Copiar</Button>
                    </div>
                    <Textarea value={texto[s.k]} onChange={(e) => { setTexto({ ...texto, [s.k]: e.target.value }); setEditado(true); }}
                      className={cn("text-sm", s.k === "s9" ? "min-h-48" : "min-h-20")} />
                  </div>
                ))}
              </section>
            )}

            {/* 5. Acciones */}
            <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
              <span className="mr-auto text-sm">Dictamen global: <b>{g.estado} · {g.cumplimiento}</b></span>
              <Button variant="outline" className="gap-1" onClick={() => { setOcupado(true); guardar().finally(() => setOcupado(false)); }} disabled={ocupado || !puedeEditar}>
                <Save className="h-4 w-4" /> Guardar registro
              </Button>
              <Button className="gap-1" onClick={exportar} disabled={ocupado || !atValido || faltaJustif.length > 0}>
                <FileSpreadsheet className="h-4 w-4" /> Exportar paquete Excel
              </Button>
              <Button variant="outline" className="gap-1" disabled title="Próximamente"><FileText className="h-4 w-4" /> Exportar Word</Button>
              {faltaJustif.length > 0 && <p className="w-full text-xs text-destructive">Escribe la justificación técnica de los instrumentos con muestra insuficiente para poder exportar.</p>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
