import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import JSZip from "jszip";
import { ChevronLeft, Copy, FolderOpen, Lock, Unlock, BadgeCheck, Download, FileSpreadsheet, FileText, Save, RotateCcw } from "lucide-react";
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
import { SECCIONES, dictamenGlobal, generarTexto, type AlcanceTexto, type TextoForVal16 } from "@/lib/texto-forval16";
import { TendenciaCard, pngsDeTarjeta } from "@/components/tendencias/TendenciaCard";
import { descargarBlob } from "@/lib/imagen-grafica";

type Search = { ids?: string; desde?: string; hasta?: string; hvac?: string; at?: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/reporte/tendencias")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ids: typeof s.ids === "string" ? s.ids : undefined,
    desde: typeof s.desde === "string" && ISO.test(s.desde) ? s.desde : undefined,
    hasta: typeof s.hasta === "string" && ISO.test(s.hasta) ? s.hasta : undefined,
    hvac: typeof s.hvac === "string" ? s.hvac : undefined,
    at: typeof s.at === "string" && /^AT-\d{4}-\d{3}$/.test(s.at) ? s.at : undefined,
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

interface RegistroAT {
  id: string; codigo: string; justificaciones: Record<string, string>; texto: Partial<TextoForVal16>;
  sistema: string; periodo_desde: string; periodo_hasta: string; periodo_etiqueta: string | null;
  created_by: string | null; updated_by: string | null; created_at: string; created_by_email: string | null; updated_at: string; updated_by_email: string | null; version: number;
  estado: string; emitido_at: string | null; emitido_by_email: string | null; motivo_version: string | null;
  seleccion: { modo?: "hvac" | "instrumentos"; hvacId?: string; codigos?: string[] } | null;
  instrumentos: { codigo: string }[] | null;
}
const COLS_AT = "id,codigo,justificaciones,texto,sistema,periodo_desde,periodo_hasta,periodo_etiqueta,created_by,updated_by,created_at,created_by_email,usuario_email,updated_at,updated_by_email,version,estado,emitido_at,emitido_by_email,motivo_version,seleccion,instrumentos";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aRegistroAT = (d: any): RegistroAT => ({
  ...d, justificaciones: (d.justificaciones ?? {}) as Record<string, string>, texto: (d.texto ?? {}) as Partial<TextoForVal16>,
  created_by_email: d.created_by_email ?? d.usuario_email ?? null,
});
const fechaHora = (iso: string) => format(new Date(iso), "dd/MM/yyyy HH:mm");

function TendenciasPage() {
  const search = Route.useSearch();
  const { user, hasRole } = useAuth();
  const esAdmin = hasRole("admin") || hasRole("super_admin");
  const puedeEditar = hasRole("editor") || esAdmin;
  const [autoemision, setAutoemision] = useState(false);
  useEffect(() => {
    supabase.from("app_config").select("permitir_autoemision").eq("id", 1).maybeSingle()
      .then(({ data }) => setAutoemision(!!data?.permitir_autoemision));
  }, []);
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
  const [at, setAt] = useState(search.at ?? "");
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

  // Abrir reporte guardado (?at=…): fija sistema/instrumentos, periodo y código
  const abiertoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!search.at || cargando || abiertoRef.current === search.at) return;
    abiertoRef.current = search.at;
    supabase.from("registro_analisis_tendencias").select(COLS_AT).eq("codigo", search.at).maybeSingle().then(({ data }) => {
      if (!data) { toast.error(`No existe el registro ${search.at}`); return; }
      const r = aRegistroAT(data);
      setAt(r.codigo); setDesde(r.periodo_desde); setHasta(r.periodo_hasta); setAnio(Number(r.periodo_desde.slice(0, 4)));
      const hv = (r.seleccion?.hvacId && hvacs.find((h) => h.id === r.seleccion!.hvacId)) || hvacs.find((h) => `${h.codigo} ${h.nombre_uma}` === r.sistema);
      if (r.seleccion?.modo !== "instrumentos" && hv) { setModo("hvac"); setHvacId(hv.id); }
      else {
        const cods = new Set(r.seleccion?.codigos ?? (r.instrumentos ?? []).map((i) => i.codigo));
        setModo("instrumentos"); setSel(new Set(unidos.filter((u) => cods.has(codigoRegistro(u, instrMap))).map((u) => u.id)));
      }
      setEditado(false);
      setRegistroAT(r);
    });
  }, [search.at, cargando, hvacs, unidos, instrMap]);

  // Cargar registro AT existente si el código ya existe
  useEffect(() => {
    if (!/^AT-\d{4}-\d{3}$/.test(at)) { setRegistroAT(null); return; }
    supabase.from("registro_analisis_tendencias").select(COLS_AT).eq("codigo", at).maybeSingle()
      .then(({ data }) => setRegistroAT(data ? aRegistroAT(data) : null));
  }, [at]);

  const elegidos = modo === "hvac" ? unidos.filter((r) => hvacId && hvacDe(r, instrMap, areasMap) === hvacId) : unidos.filter((r) => sel.has(r.id));
  const hvac = hvacs.find((h) => h.id === hvacId);
  const sistema = modo === "hvac" ? (hvac ? `${hvac.codigo} ${hvac.nombre_uma}` : "")
    : elegidos.length === 1 ? codigoRegistro(elegidos[0], instrMap) : elegidos.length ? "Instrumentos seleccionados" : "";
  // Integridad: un código existente solo se edita si coincide sistema y periodo.
  const conflicto = !!registroAT && (registroAT.sistema !== (sistema || "Sin sistema") || registroAT.periodo_desde !== desde || registroAT.periodo_hasta !== hasta);
  const registroEditable = conflicto ? null : registroAT;
  const soloLectura = registroEditable?.estado === "emitido";
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
  const alcanceKey = JSON.stringify(alcance);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const textoAuto = useMemo(() => generarTexto(bloques, cobertura, alcance), [bloques, cobertura, alcanceKey]);

  // Texto: el guardado del registro AT gana; si no, el generado (mientras no se edite).
  useEffect(() => {
    if (registroEditable && Object.keys(registroEditable.texto).length) { setTexto({ ...textoAuto, ...registroEditable.texto }); setEditado(true); }
    else if (!editado) setTexto(textoAuto);
    if (registroEditable) setJustif(registroEditable.justificaciones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registroEditable, textoAuto]);

  const insuficientes = bloques.filter((b) => b.calidad.suficiencia.startsWith("Insuficiente"));
  const faltaJustif = insuficientes.filter((b) => !justif[b.hoja]?.trim());
  const atValido = /^AT-\d{4}-\d{3}$/.test(at);
  const g = dictamenGlobal(bloques);

  const guardar = async (): Promise<boolean> => {
    if (soloLectura) { toast.error("El registro está emitido; crea una nueva versión para modificarlo."); return false; }
    if (!puedeEditar) { toast.error("Tu rol solo permite consultar. Pide a un editor que guarde el registro."); return false; }
    if (!atValido) { toast.error("Escribe un código con formato AT-AAAA-NNN."); return false; }
    if (conflicto && registroAT) { toast.error(`El código ${at} ya está registrado para ${registroAT.sistema} ${registroAT.periodo_etiqueta ?? ""}. Cambia el código.`); return false; }
    if (faltaJustif.length) { toast.error(`Falta la justificación técnica de: ${faltaJustif.map((b) => b.hoja).join(", ")}`); return false; }
    const fila = {
      codigo: at, sistema: sistema || "Sin sistema", periodo_desde: desde, periodo_hasta: hasta,
      periodo_etiqueta: etiquetaPeriodo(desde, hasta).replaceAll("_", " "),
      instrumentos: bloques.map((b) => ({ codigo: b.codigo, variable: b.variable, bitacora: b.bitacora, n: b.n, dictamen: b.dict ? `${b.dict.estadoControl} · ${b.dict.cumplimientoEspecificacion}` : null })),
      usuario_id: user?.id ?? null, usuario_email: user?.email ?? null,
      dictamen_global: `${g.estado} · ${g.cumplimiento}`,
      justificaciones: Object.fromEntries(insuficientes.map((b) => [b.hoja, justif[b.hoja].trim()])),
      texto: texto ?? {},
      seleccion: modo === "hvac" ? { modo, hvacId } : { modo, codigos: [...new Set(elegidos.map((r) => codigoRegistro(r, instrMap)))].sort() },
    };
    if (registroEditable) {
      const quien = registroEditable.created_by_email ?? "otro usuario";
      if (!window.confirm(`Vas a modificar el registro existente ${at} (creado por ${quien} el ${fechaHora(registroEditable.created_at)}).\nLa versión anterior se conservará en el historial. ¿Guardar los cambios?`)) return false;
      const { usuario_id: _u, usuario_email: _e, ...cambios } = fila;
      const { data, error } = await supabase.from("registro_analisis_tendencias").update(cambios).eq("id", registroEditable.id).select(COLS_AT).single();
      if (error) { toast.error(`No se pudo guardar: ${error.message}`); return false; }
      setRegistroAT(aRegistroAT(data));
    } else {
      const { data, error } = await supabase.from("registro_analisis_tendencias").insert(fila).select(COLS_AT).single();
      if (error) {
        toast.error(error.code === "23505" ? `El código ${at} ya está registrado. Usa otro.` : `No se pudo guardar: ${error.message}`);
        return false;
      }
      setRegistroAT(aRegistroAT(data));
    }
    toast.success(`Registro ${at} guardado`);
    return true;
  };

  const exportar = async () => {
    if (!bloques.length) { toast.info("No hay lecturas en este periodo."); return; }
    setOcupado(true);
    try {
      if (!soloLectura && !(await guardar())) return;
      const r = await exportarPaqueteForVal16({
        codigoAT: at, sistema: sistema || "Instrumentos", registros: elegidos, instrMap, areasMap, desde, hasta, hvac, cambiosFiltro: cambios,
        texto: texto ? SECCIONES.map((s) => ({ titulo: s.titulo, cuerpo: texto[s.k] })) : undefined,
      });
      toast.success(`Descargado ${r.archivo}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error al exportar"); }
    finally { setOcupado(false); }
  };

  const exportarWord = async () => {
    if (!registroEditable || !texto) { toast.error("Guarda primero el registro AT para exportar el Word."); return; }
    if (editado && !soloLectura && JSON.stringify(texto) !== JSON.stringify({ ...textoAuto, ...registroEditable.texto })) {
      toast.error("Hay cambios sin guardar. Guarda el registro antes de exportar el Word."); return;
    }
    setOcupado(true);
    try {
      const [{ generarWordForVal16 }, { cargarFormato }] = await Promise.all([import("@/lib/word-forval16"), import("@/lib/formato-forval16")]);
      const formato = await cargarFormato();
      // Control de cambios: v1 «Documento nuevo» + cada «Nueva versión» con su motivo
      const { data: hist } = await supabase.from("registro_analisis_tendencias_historial").select("version,datos").eq("registro_id", registroEditable.id).order("version");
      type V = { version: number; motivo_version?: string | null; updated_at?: string; updated_by_email?: string | null };
      const versiones: V[] = [...(hist ?? []).map((h) => h.datos as unknown as V), registroEditable as unknown as V].sort((x, y) => x.version - y.version);
      const cambiosV = [{ de: "N/A", a: "Nuevo", fecha: fechaHora(registroEditable.created_at).slice(0, 10), descripcion: "Documento nuevo.", por: registroEditable.created_by_email ?? "—" }];
      versiones.forEach((v, i) => {
        if (i > 0 && v.motivo_version && v.motivo_version !== versiones[i - 1].motivo_version)
          cambiosV.push({ de: String(versiones[i - 1].version), a: String(v.version), fecha: v.updated_at ? fechaHora(v.updated_at).slice(0, 10) : "—", descripcion: v.motivo_version, por: v.updated_by_email ?? "—" });
      });
      const periodo = registroEditable.periodo_etiqueta ?? `${desde}_${hasta}`;
      const tituloSistema = modo === "hvac" && hvac ? `Sistema HVAC ${hvac.codigo} ${hvac.nombre_uma} (${hvac.descripcion})` : `Instrumentos ${alcance.tipo === "instrumentos" ? alcance.codigos.join(", ") : sistema}`;
      const { blob, archivo } = await generarWordForVal16({
        formato, codigoAT: registroEditable.codigo, version: registroEditable.version,
        estado: registroEditable.estado === "emitido" ? "emitido" : "borrador", emitidoAt: registroEditable.emitido_at,
        sistema: registroEditable.sistema, tituloSistema, periodo, desde, hasta, bloques, texto,
        justificaciones: registroEditable.justificaciones, cambios: cambiosV, png: (b) => pngsDeTarjeta(null, b),
      });
      descargarBlob(blob, archivo);
      const { error: eAud } = await supabase.rpc("registrar_exportacion_at", { _registro_id: registroEditable.id, _version: registroEditable.version, _estado: registroEditable.estado, _archivo: archivo });
      if (eAud) toast.warning(`Word descargado, pero no se registró en Auditoría: ${eAud.message}`);
      else toast.success(`Descargado ${archivo}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error al exportar Word"); }
    finally { setOcupado(false); }
  };

  const marcarEmitido = async () => {
    if (!registroEditable) return;
    if (!autoemision && user && user.id === (registroEditable.updated_by ?? registroEditable.created_by)) {
      toast.error("Separación de funciones: tú creaste o modificaste esta versión; debe emitirla otro admin o super_admin."); return;
    }
    if (editado && !window.confirm("Hay cambios sin guardar que no se incluirán. ¿Emitir la última versión guardada?")) return;
    if (!window.confirm(`¿Marcar ${registroEditable.codigo} como EMITIDO?\nYa no se podrá editar el texto, el sistema ni el periodo.`)) return;
    const { data, error } = await supabase.from("registro_analisis_tendencias").update({ estado: "emitido" }).eq("id", registroEditable.id).select(COLS_AT).single();
    if (error) { toast.error(error.message); return; }
    setEditado(false); setRegistroAT(aRegistroAT(data)); toast.success(`${registroEditable.codigo} emitido`);
  };
  const nuevaVersion = async () => {
    if (!registroEditable) return;
    const motivo = window.prompt(`Motivo de la nueva versión de ${registroEditable.codigo} (queda en el historial):`)?.trim();
    if (!motivo) { if (motivo === "") toast.error("El motivo es obligatorio."); return; }
    const { data, error } = await supabase.from("registro_analisis_tendencias").update({ estado: "borrador", motivo_version: motivo }).eq("id", registroEditable.id).select(COLS_AT).single();
    if (error) { toast.error(error.message); return; }
    setRegistroAT(aRegistroAT(data)); toast.success(`${registroEditable.codigo} regresó a borrador (versión ${data.version})`);
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
          <h1 className="text-2xl font-semibold text-foreground">Análisis de tendencias (FOR-VAL-16-02)</h1>
          <p className="text-sm text-muted-foreground mt-1">Elige qué analizar, revisa las gráficas y el texto, y llévalos a Word. Los números son los mismos del Excel.</p>
          </div>
          <Button variant="outline" size="sm" asChild className="gap-1">
            <Link to="/reporte/registro-at"><FolderOpen className="h-4 w-4" /> Abrir reporte guardado</Link>
          </Button>
        </div>
        {soloLectura && registroEditable && (
          <p className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm">
            <Lock className="h-4 w-4" /> {registroEditable.codigo} está <b>emitido</b>{registroEditable.emitido_by_email ? ` por ${registroEditable.emitido_by_email}` : ""}{registroEditable.emitido_at ? ` el ${fechaHora(registroEditable.emitido_at)}` : ""}. Modo lectura: puedes exportar, pero no editar.
          </p>
        )}

        {/* 1. Selección */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h2 className="font-semibold">1. Qué analizar</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="at">Código de reporte</Label>
              <Input id="at" value={at} onChange={(e) => setAt(e.target.value.toUpperCase().trim())} placeholder="AT-2026-001" />
              <p className="text-xs text-muted-foreground">
                {!atValido ? "Formato: AT-AAAA-NNN." : registroAT ? "" : "Código nuevo (siguiente consecutivo sugerido)."}
              </p>
              {atValido && conflicto && registroAT && (
                <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                  El código {at} ya está registrado para {registroAT.sistema} {registroAT.periodo_etiqueta ?? `${registroAT.periodo_desde} – ${registroAT.periodo_hasta}`}. Cambia el código para poder guardar o exportar.
                </p>
              )}
              {atValido && registroEditable && (
                soloLectura ? (
                <div className="rounded-md border border-success/40 bg-success/10 p-2 text-xs">
                  <p className="font-medium">Registro emitido · versión {registroEditable.version} · solo lectura</p>
                  <p className="text-muted-foreground">Creado por {registroEditable.created_by_email ?? "—"} el {fechaHora(registroEditable.created_at)}{registroEditable.emitido_by_email ? ` · emitido por ${registroEditable.emitido_by_email}` : ""}{registroEditable.emitido_at ? ` el ${fechaHora(registroEditable.emitido_at)}` : ""}</p>
                </div>
              ) : (
                <div className="rounded-md border border-primary/40 bg-primary/10 p-2 text-xs">
                  <p className="font-medium">Editando registro existente {at} (creado por {registroEditable.created_by_email ?? "—"} el {fechaHora(registroEditable.created_at)})</p>
                  <p className="text-muted-foreground">Versión {registroEditable.version} · estado {registroEditable.estado === "emitido" ? "Emitido" : "Borrador"}{registroEditable.motivo_version ? ` · motivo de versión: ${registroEditable.motivo_version}` : ""} · última modificación por {registroEditable.updated_by_email ?? registroEditable.created_by_email ?? "—"} el {fechaHora(registroEditable.updated_at)}. Se pedirá confirmación al guardar.</p>
                </div>
              )
              )}
            </div>
            <fieldset disabled={soloLectura} className="space-y-1.5 md:col-span-2">
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
            </fieldset>
          </div>
          <fieldset disabled={soloLectura} className="space-y-4">
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
          </fieldset>
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
                              <Textarea readOnly={soloLectura} value={justif[b.hoja] ?? ""} onChange={(e) => setJustif((j) => ({ ...j, [b.hoja]: e.target.value }))}
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
                  <Button size="sm" variant="ghost" className="gap-1" disabled={soloLectura} onClick={() => { setTexto(textoAuto); setEditado(false); }}>
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
                    <Textarea readOnly={soloLectura} value={texto[s.k]} onChange={(e) => { setTexto({ ...texto, [s.k]: e.target.value }); setEditado(true); }}
                      className={cn("text-sm", s.k === "s9" ? "min-h-48" : "min-h-20")} />
                  </div>
                ))}
              </section>
            )}

            {/* 5. Acciones */}
            <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
              <span className="mr-auto text-sm">Dictamen global: <b>{g.estado} · {g.cumplimiento}</b></span>
              <Button variant="outline" className="gap-1" onClick={() => { setOcupado(true); guardar().finally(() => setOcupado(false)); }} disabled={ocupado || !puedeEditar || conflicto || soloLectura}>
                <Save className="h-4 w-4" /> Guardar registro
              </Button>
              <Button className="gap-1" onClick={exportar} disabled={ocupado || !atValido || conflicto || faltaJustif.length > 0}>
                <FileSpreadsheet className="h-4 w-4" /> Exportar paquete Excel
              </Button>
              {esAdmin && registroEditable && !soloLectura && (
                <Button variant="outline" className="gap-1" onClick={marcarEmitido} disabled={ocupado}><BadgeCheck className="h-4 w-4" /> Marcar como emitido</Button>
              )}
              {esAdmin && soloLectura && (
                <Button variant="outline" className="gap-1" onClick={nuevaVersion} disabled={ocupado}><Unlock className="h-4 w-4" /> Nueva versión</Button>
              )}
              <Button variant="outline" className="gap-1" onClick={exportarWord} disabled={ocupado || !registroEditable || conflicto} title={!registroEditable ? "Guarda el registro AT para exportar el Word" : undefined}><FileText className="h-4 w-4" /> Exportar Word{registroEditable && !soloLectura ? " (borrador)" : ""}</Button>
              {faltaJustif.length > 0 && <p className="w-full text-xs text-destructive">Escribe la justificación técnica de los instrumentos con muestra insuficiente para poder exportar.</p>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
