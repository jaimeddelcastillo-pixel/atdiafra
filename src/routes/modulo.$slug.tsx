import { CorregirFechaSemana } from "@/components/CorregirFechaSemana";
import { EliminarRegistroZona } from "@/components/EliminarRegistroZona";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/lib/auth-context";
import { MODULOS } from "@/lib/diafra-data";

import { PresionesModule } from "@/components/presiones/PresionesModule";
import { ImageImporter } from "@/components/temp-hr/ImageImporter";
import { LoteFotosImporter } from "@/components/LoteFotosImporter";
import { FotoSemana } from "@/components/FotoSemana";
import { InstrumentoSelector } from "@/components/InstrumentoSelector";
import { AreaSelector } from "@/components/AreaSelector";
import { WeeklyReadingsTable } from "@/components/temp-hr/WeeklyReadingsTable";
import { TempHRAnalysis } from "@/components/temp-hr/TempHRAnalysis";
import { ChevronLeft, Save, Trash, Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { analizarRegistro, type Periodo } from "@/lib/normativo";
import { exportarNormativoPDF } from "@/lib/export-normativo";
import { toast } from "sonner";
import {
  Instrumento, IsoClase, ISO_TEMP_HR, AreaClasificada,
  listInstrumentos, listAreas,
} from "@/lib/catalogos";
import {
  Registro, Semana, lunesDe, nombreMes, semanaVacia,
  upsertRegistro, listRegistros, deleteRegistro,
  esSemanaVacia, lecturasCapturadas, lecturasEsperadas, rangoFechasRegistro,
} from "@/lib/semanas";

export const Route = createFileRoute("/modulo/$slug")({
  validateSearch: (search: Record<string, unknown>): { registroId?: string } => ({
    registroId: typeof search.registroId === "string" ? search.registroId : undefined,
  }),
  head: ({ params }) => {
    const m = MODULOS.find((x) => x.slug === params.slug);
    return {
      meta: [
        { title: `${m?.nombre ?? "Módulo"} — Análisis de Tendencias TRACEA` },
        { name: "description", content: m?.descripcion ?? "Módulo de análisis de tendencias." },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Módulo no disponible</h1>
        <Link to="/" className="inline-flex mt-6 items-center gap-1 text-primary hover:underline">
          <ChevronLeft className="h-4 w-4" /> Volver al tablero
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-destructive">Ocurrió un error</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  component: () => <AuthGuard><ModuloPage /></AuthGuard>,
});

function ModuloPage() {
  const { slug } = Route.useParams();
  const modulo = MODULOS.find((m) => m.slug === slug);
  if (!modulo) throw notFound();

  if (modulo.id === "temp_hr") return <TempHRModule />;
  if (modulo.id === "presiones") {
    return (
      <>
        <AppHeader />
        <PresionesModule />
      </>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Link to="/" className="inline-flex items-center gap-1 text-primary hover:underline mb-6">
          <ChevronLeft className="h-4 w-4" /> Volver al tablero
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{modulo.nombre}</h1>
        <p className="mt-2 text-muted-foreground">Este módulo estará disponible próximamente.</p>
      </div>
    </div>
  );
}



function TempHRModule() {
  // Catálogo de termohigrómetros activos
  const [termohigrometros, setTermohigrometros] = useState<Instrumento[]>([]);
  const [areas, setAreas] = useState<AreaClasificada[]>([]);
  useEffect(() => {
    listInstrumentos({ tipo: "termohigrometro", soloActivos: true })
      .then(setTermohigrometros)
      .catch((e) => toast.error("No se pudieron cargar instrumentos: " + e.message));
    listAreas(true)
      .then(setAreas)
      .catch((e) => toast.error("No se pudieron cargar áreas: " + e.message));
  }, []);

  // Lista de registros existentes en este módulo
  const [registros, setRegistros] = useState<Registro[]>([]);
  const reload = () => listRegistros("temphr").then(setRegistros).catch((e) => toast.error("No se pudieron cargar registros: " + e.message));
  useEffect(() => { reload(); }, []);

  const { registroId: registroIdFromUrl } = Route.useSearch();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Preseleccionar al cargar la lista si viene ?registroId= en la URL
  useEffect(() => {
    if (registroIdFromUrl && registros.some((r) => r.id === registroIdFromUrl)) {
      setActiveId(registroIdFromUrl);
    }
  }, [registroIdFromUrl, registros]);
  const active = useMemo(() => registros.find((r) => r.id === activeId) ?? null, [registros, activeId]);

  // Estado del formulario nuevo registro
  const [draft, setDraft] = useState({
    area_id: "",
    codigoArea: "",
    nombreArea: "",
    instrumento_id: "",
    iso: "ISO-8" as IsoClase,
  });

  const createRegistro = async () => {
    if (!draft.area_id) {
      toast.error("Selecciona o crea un área");
      return;
    }
    if (!draft.instrumento_id) {
      toast.error("Selecciona el termohigrómetro");
      return;
    }
    // Nota: NO bloqueamos por área+instrumento ya que un mismo punto de medición
    // puede tener múltiples registros legítimos correspondientes a distintos periodos
    // (ej. un registro por trimestre). Lo único que se considera duplicado es cuando
    // dos registros comparten alguna semana (mismo lunes) — eso lo detecta el banner
    // de duplicados en /reporte.
    const yaExiste = registros.find((x) => x.activo && x.area_id === draft.area_id && x.instrumento_id === draft.instrumento_id);
    if (yaExiste) {
      setActiveId(yaExiste.id);
      toast.info("Ya existe un registro para esta área e instrumento — se abrió el existente");
      return;
    }
    const area = areas.find((a) => a.id === draft.area_id);
    const instr = termohigrometros.find((i) => i.id === draft.instrumento_id);
    const iso = (area?.iso ?? draft.iso) as IsoClase;
    const limits = ISO_TEMP_HR[iso];
    const codigoArea = area?.codigo ?? "";
    const nombreArea = area?.nombre ?? "";
    const r: Registro = {
      id: crypto.randomUUID(),
      modulo: "temphr",
      nombre: `${codigoArea} ${nombreArea} · ${instr?.codigo ?? ""}`,
      area_id: draft.area_id,
      instrumento_id: draft.instrumento_id,
      codigo_area_libre: codigoArea,
      nombre_area_libre: nombreArea,
      iso,
      lse_t: limits.tempMax, lie_t: limits.tempMin,
      lse_hr: limits.hrMax, lie_hr: limits.hrMin,
      semanas: [],
      created_at: new Date().toISOString(),
      activo: true,
    };
    try {
      await upsertRegistro(r);
      await reload();
      setActiveId(r.id);
      setDraft({ area_id: "", codigoArea: "", nombreArea: "", instrumento_id: "", iso: "ISO-8" });
      toast.success("Registro creado");
    } catch (e: any) {
      toast.error("No se pudo crear el registro: " + e.message);
    }
  };

  const { canDelete: isSuperAdminParent } = useAuth();
  const removeRegistro = async (id: string) => {
    try {
      await deleteRegistro(id);
      if (activeId === id) setActiveId(null);
      await reload();
    } catch (e: any) {
      toast.error("No se pudo eliminar: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-3">
          <ChevronLeft className="h-4 w-4" /> Tablero
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">Temperatura y Humedad Relativa</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Captura semanal por área e instrumento (Lunes–Domingo × 3 turnos, según aplique).
        </p>

        {/* Selector / creación de registro */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 rounded-xl border border-border bg-card p-4 space-y-4">
            {active ? (
              <div>
                <h3 className="text-sm font-semibold mb-2">Registro activo</h3>
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">{active.nombre}</div>
                  <div className="text-muted-foreground mt-0.5">
                    {active.iso} · {rangoFechasRegistro(active)}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                    ID {active.id.slice(0, 8)}…
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-3"
                  onClick={() => setActiveId(null)}>
                  Crear otro registro
                </Button>
                <Link
                  to="/reporte"
                  className="block text-center text-xs text-muted-foreground hover:text-primary mt-2">
                  Ver todos los registros en Reportes →
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-semibold">Nuevo registro</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    El listado completo vive en{" "}
                    <Link to="/reporte" className="text-primary hover:underline">Reportes</Link>.
                  </p>
                </div>
                <div className="space-y-2">
                  <AreaSelector
                    value={draft.area_id}
                    areas={areas}
                    onChange={(id, a) => setDraft({ ...draft, area_id: id, iso: (a?.iso ?? draft.iso) as IsoClase })}
                    onCatalogChanged={setAreas}
                    defaultIso={draft.iso}
                  />
                  <InstrumentoSelector
                    tipo="termohigrometro"
                    tipoLabel="termohigrómetro"
                    parametroDefault="Temperatura/HR"
                    value={draft.instrumento_id}
                    instrumentos={termohigrometros}
                    onChange={(id) => setDraft({ ...draft, instrumento_id: id })}
                    onCatalogChanged={setTermohigrometros}
                    placeholderCodigo="INS-CMB-20"
                    areas={areas}
                  />
                  {draft.area_id && (
                    <p className="text-[11px] text-muted-foreground">
                      Clasificación del área: <span className="font-medium text-foreground">{draft.iso}</span>
                    </p>
                  )}
                </div>
                <Button onClick={createRegistro} className="w-full gap-1"><Plus className="h-4 w-4" /> Crear registro</Button>
                {areas.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay áreas aún. Usa "Nueva área" para agregar la primera.</p>
                )}
                {termohigrometros.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay termohigrómetros aún. Usa "Nuevo INS" para agregar el primero.</p>
                )}
              </>
            )}
          </div>

          <div className="lg:col-span-2">
            {!active ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Crea un registro nuevo o ábrelo desde{" "}
                <Link to="/reporte" className="text-primary hover:underline">Reportes</Link>{" "}
                para empezar a capturar.
              </div>
            ) : (<>
              <RegistroEditor
                key={active.id}
                registro={active}
                onPersist={async (r) => {
                  try { await upsertRegistro(r); await reload(); }
                  catch (e: any) { toast.error("No se pudo guardar: " + e.message); throw e; }
                }}
                onDelete={() => removeRegistro(active.id)}
              />
              {isSuperAdminParent && <EliminarRegistroZona key={'z'+active.id} nombre={active.nombre} onConfirm={() => removeRegistro(active.id)} />}
            </>)}
          </div>
        </div>
      </main>
    </div>
  );
}

function RegistroEditor({ registro, onPersist, onDelete }: {
  registro: Registro; onPersist: (r: Registro) => Promise<void>; onDelete: () => void;
}) {
  const navigate = useNavigate();
  const { canWriteRecords, canDelete } = useAuth();
  const iso = (registro.iso ?? "ISO-8") as IsoClase;
  // Buffer local: cambios no se persisten hasta presionar "Guardar"
  const [draft, setDraft] = useState<Registro>(registro);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [postSaveOpen, setPostSaveOpen] = useState(false);
  const [nuevaSemanaFecha, setNuevaSemanaFecha] = useState<string>("");

  // Export PDF normativo (rango personalizado por registro)
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [exportDesde, setExportDesde] = useState<string>(yearStart);
  const [exportHasta, setExportHasta] = useState<string>(today);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  const handleExportPDF = async () => {
    if (!exportDesde || !exportHasta || exportDesde > exportHasta) {
      toast.error("Rango de fechas inválido");
      return;
    }
    setExportingPDF(true);
    const t = toast.loading("Generando PDF normativo…");
    try {
      const periodo: Periodo = { tipo: "custom", desde: exportDesde, hasta: exportHasta };
      const analisis = [analizarRegistro(draft, periodo)];
      // Sin catálogos: agrupar por "registro" usa el nombre del registro
      await new Promise((r) => setTimeout(r, 50));
      exportarNormativoPDF(analisis, "registro", { areas: new Map(), hvac: new Map() }, { incluirGraficas: true });
      toast.success("PDF generado", { id: t });
      setExportOpen(false);
    } catch (e: any) {
      toast.error("No se pudo exportar: " + e.message, { id: t });
    } finally {
      setExportingPDF(false);
    }
  };

  // Si entra otro registro (cambio de activeId), reset
  useEffect(() => {
    setDraft(registro);
    setDirty(false);
  }, [registro.id]);

  // Si la prop registro cambia (por reload tras persistir/importar imagen), sincronizar si no hay cambios sucios
  useEffect(() => {
    if (!dirty) setDraft(registro);
  }, [registro]);

  const [activeWeekId, setActiveWeekId] = useState<string | null>(draft.semanas[0]?.id ?? null);
  useEffect(() => {
    if (!activeWeekId && draft.semanas[0]) setActiveWeekId(draft.semanas[0].id);
  }, [draft.semanas, activeWeekId]);

  const activeWeek = draft.semanas.find((s) => s.id === activeWeekId) ?? null;

  // Aviso al salir/recargar si hay cambios sin guardar
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const mutate = (updater: (r: Registro) => Registro) => {
    setDraft((d) => updater(d));
    setDirty(true);
  };

  const addEmptyWeek = (semana_inicio?: string) => {
    const fecha = semana_inicio ? new Date(semana_inicio + "T00:00:00") : new Date();
    const lunes = semana_inicio ?? lunesDe(fecha);
    if (draft.semanas.some((s) => s.semana_inicio === lunes)) {
      toast.error("Ya existe una semana con ese lunes");
      return;
    }
    const s = semanaVacia({ semana_inicio: lunes, mes: nombreMes(fecha), anio: String(fecha.getFullYear()), unidad: "°C / %HR", esTHR: true });
    mutate((r) => ({ ...r, semanas: [...r.semanas, s] }));
    setActiveWeekId(s.id);
  };

  // Importación por imagen: SOLO actualiza el draft local. NO persiste.
  // El usuario debe revisar y dar "Guardar" para que se mande a la nube.
  const handleExtracted = (s: Semana) => {
    const existing = draft.semanas.find((x) => x.semana_inicio === s.semana_inicio);
    let semanas: Semana[];
    if (existing) {
      const merged: Semana = {
        ...existing,
        lecturas: s.lecturas.some((p) => p.valor != null) ? s.lecturas : existing.lecturas,
        lecturas_hr: s.lecturas_hr?.some((p) => p.valor != null) ? s.lecturas_hr : existing.lecturas_hr,
        observaciones: [existing.observaciones, s.observaciones].filter(Boolean).join("\n"),
        source: "imagen",
        saved_at: new Date().toISOString(),
        foto_path: s.foto_path ?? existing.foto_path ?? null,
      };
      semanas = draft.semanas.map((x) => (x.id === existing.id ? merged : x));
      setActiveWeekId(existing.id);
    } else {
      // Descartar semanas vacías de OTRA fecha (e.g. blank "hoy" creado al abrir el editor).
      const limpias = draft.semanas.filter((x) => !esSemanaVacia(x, true));
      const removidas = draft.semanas.length - limpias.length;
      semanas = [...limpias, s];
      setActiveWeekId(s.id);
      if (removidas > 0) {
        toast.info(`Se descartó ${removidas} semana(s) vacía(s) sin datos.`);
      }
    }
    setDraft({ ...draft, semanas });
    setDirty(true);
    toast.success("Imagen importada — revisa y presiona Guardar");
  };

  // Lote de fotos: integra varias semanas al borrador de una sola vez (reemplaza la misma semana).
  const handleLote = (nuevas: Semana[]) => {
    const porLunes = new Map(nuevas.map((s) => [s.semana_inicio, s]));
    const conservadas = draft.semanas
      .filter((x) => !esSemanaVacia(x, true) || porLunes.has(x.semana_inicio))
      .map((x) => {
        const n = porLunes.get(x.semana_inicio);
        if (!n) return x;
        porLunes.delete(x.semana_inicio);
        return { ...n, id: x.id };
      });
    const semanas = [...conservadas, ...porLunes.values()];
    setDraft({ ...draft, semanas });
    setDirty(true);
    const primera = semanas.slice().sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))[0];
    if (primera) setActiveWeekId(primera.id);
    toast.success(`${nuevas.length} semana(s) integradas — revisa y presiona Guardar`);
  };

  const updateWeek = (s: Semana) => mutate((r) => ({ ...r, semanas: r.semanas.map((x) => (x.id === s.id ? s : x)) }));

  const deleteWeek = (id: string) => {
    const target = draft.semanas.find((x) => x.id === id);
    if (!target) return;
    const cap = lecturasCapturadas(target, true);
    const esp = lecturasEsperadas(target, true);
    const detalle = cap === 0
      ? "Esta semana está VACÍA (0 lecturas)."
      : `Esta semana tiene ${cap}/${esp} lecturas capturadas.`;
    if (!confirm(`¿Eliminar la semana del ${target.semana_inicio}?\n\n${detalle}\n\nSe guarda al instante y no se puede deshacer.`)) return;
    const next = { ...draft, semanas: draft.semanas.filter((x) => x.id !== id) };
    setDraft(next);
    if (activeWeekId === id) setActiveWeekId(next.semanas[0]?.id ?? null);
    onPersist(next).then(() => { setDirty(false); toast.success(`Semana ${target.semana_inicio} eliminada`); }).catch(() => {});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onPersist(draft);
      setDirty(false);
      toast.success("Cambios guardados");
      // Sugerir fecha inicial: siguiente lunes que no exista
      const hoy = new Date();
      let candidato = lunesDe(hoy);
      let intentos = 0;
      while (draft.semanas.some((s) => s.semana_inicio === candidato) && intentos < 60) {
        const d = new Date(candidato + "T00:00:00");
        d.setDate(d.getDate() + 7);
        candidato = lunesDe(d);
        intentos++;
      }
      setNuevaSemanaFecha(candidato);
      setPostSaveOpen(true);
    } finally {
      setSaving(false);
    }
  };

  // "Continuar con otra semana" tras guardar = nueva semana en blanco con la fecha
  // que el usuario elija, en el mismo registro (misma área/instrumento).
  const handleNuevoRegistro = () => {
    if (!nuevaSemanaFecha) {
      toast.error("Selecciona una fecha para la nueva semana");
      return;
    }
    const lunes = lunesDe(new Date(nuevaSemanaFecha + "T00:00:00"));
    if (draft.semanas.some((s) => s.semana_inicio === lunes)) {
      toast.error(`Ya existe la semana del ${lunes} en este registro`);
      return;
    }
    setPostSaveOpen(false);
    addEmptyWeek(lunes);
    toast.success(`Nueva semana ${lunes} agregada — sube la foto o captura manualmente`);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100);
  };

  // "Cerrar" en el diálogo post-guardado = volver al tablero inicial.
  const handleCerrarPostSave = () => {
    setPostSaveOpen(false);
    navigate({ to: "/" });
  };

  const handleDiscard = () => {
    if (!confirm("¿Descartar todos los cambios sin guardar?")) return;
    setDraft(registro);
    setDirty(false);
    toast.info("Cambios descartados");
  };

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-4 flex flex-wrap items-end justify-between gap-3 ${dirty ? "border-warning bg-warning/5" : "border-border bg-card"}`}>
        <div>
          <h2 className="text-base font-semibold">{draft.nombre}</h2>
          <p className="text-xs text-muted-foreground">
            {iso} · {draft.semanas.length} semana(s)
            {dirty && <span className="ml-2 inline-block rounded bg-warning/20 text-warning px-1.5 py-0.5 text-[10px] font-medium">Cambios sin guardar</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Popover open={exportOpen} onOpenChange={setExportOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1">
                <FileText className="h-4 w-4" /> Exportar PDF
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div>
                <h4 className="text-sm font-semibold">PDF normativo</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Solo este registro, en el rango que elijas.
                </p>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Desde</label>
                  <input
                    type="date"
                    value={exportDesde}
                    max={exportHasta}
                    onChange={(e) => setExportDesde(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Hasta</label>
                  <input
                    type="date"
                    value={exportHasta}
                    min={exportDesde}
                    onChange={(e) => setExportHasta(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9"
                  />
                </div>
              </div>
              <Button size="sm" onClick={handleExportPDF} disabled={exportingPDF} className="w-full gap-1">
                <FileText className="h-4 w-4" /> {exportingPDF ? "Generando…" : "Generar PDF"}
              </Button>
            </PopoverContent>
          </Popover>
          {canWriteRecords && (
            <Button size="sm" variant="outline" onClick={() => addEmptyWeek()} className="gap-1">
              <Plus className="h-4 w-4" /> Nueva semana actual
            </Button>
          )}
          {dirty && canWriteRecords && (
            <Button size="sm" variant="ghost" onClick={handleDiscard} className="gap-1">
              Descartar
            </Button>
          )}
          {canWriteRecords && (
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving} className="gap-1">
              <Save className="h-4 w-4" /> {saving ? "Guardando…" : "Guardar"}
            </Button>
          )}
          {!canWriteRecords && (
            <span className="text-xs text-muted-foreground self-center">Solo lectura — no tienes permisos para editar.</span>
          )}
        </div>
      </div>

      <ImageImporter
        context={{
          codigoArea: draft.codigo_area_libre ?? "",
          nombreArea: draft.nombre_area_libre ?? "",
          instrumento: draft.instrumento_id ?? "",
          iso,
        }}
        semanaInicio={activeWeek?.semana_inicio ?? lunesDe(new Date())}
        onExtracted={handleExtracted}
        extra={
          <LoteFotosImporter
            modulo="temp_hr"
            context={{
              codigoArea: draft.codigo_area_libre ?? "",
              nombreArea: draft.nombre_area_libre ?? "",
              instrumento: draft.instrumento_id ?? "",
              iso,
            }}
            semanasExistentes={draft.semanas.filter((s) => !esSemanaVacia(s, true)).map((s) => s.semana_inicio)}
            onApply={handleLote}
          />
        }
      />

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        {activeWeek && <FotoSemana path={activeWeek.foto_path} semana={activeWeek.semana_inicio} />}
        {activeWeek && canWriteRecords && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-foreground mr-1">Semana seleccionada:</span>
            <input
              type="date"
              value={activeWeek.semana_inicio}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              onChange={(e) => {
                const valor = e.target.value;
                if (!valor) return;
                const lunes = lunesDe(new Date(valor + "T00:00:00"));
                if (lunes === activeWeek.semana_inicio) return;
                const existing = draft.semanas.find((s) => s.semana_inicio === lunes);
                if (existing) { setActiveWeekId(existing.id); toast.info(`Semana ${lunes} seleccionada`); return; }
                const base = new Date(lunes + "T00:00:00");
                mutate((r) => ({
                  ...r,
                  semanas: r.semanas.map((x) => x.id === activeWeek.id
                    ? { ...x, semana_inicio: lunes, mes: nombreMes(base), anio: String(base.getFullYear()) } : x),
                }));
                toast.success(`Semana movida al ${lunes} — recuerda Guardar`);
              }}
            />
            <CorregirFechaSemana
              actual={activeWeek.semana_inicio}
              existentes={draft.semanas.filter((s) => s.id !== activeWeek.id).map((s) => s.semana_inicio)}
              onConfirm={(lunes) => {
                const base = new Date(lunes + "T00:00:00");
                mutate((r) => ({
                  ...r,
                  semanas: r.semanas.map((x) => x.id === activeWeek.id
                    ? { ...x, semana_inicio: lunes, mes: nombreMes(base), anio: String(base.getFullYear()) } : x),
                }));
                toast.success(`Semana movida al ${lunes} — recuerda Guardar`);
              }}
            />
            <span className="text-[10px] text-muted-foreground">Elige una semana existente, o usa «Corregir fecha» para mover ésta sin perder lecturas. Se ajusta al lunes.</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Agregar semana (cualquier fecha):</span>
          <input
            type="date"
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            onChange={(e) => {
              if (!e.target.value) return;
              const lunes = lunesDe(new Date(e.target.value + "T00:00:00"));
              const existing = draft.semanas.find((s) => s.semana_inicio === lunes);
              if (existing) { setActiveWeekId(existing.id); toast.info(`Semana ${lunes} ya existe — seleccionada`); }
              else { addEmptyWeek(lunes); toast.success(`Semana ${lunes} agregada (recuerda Guardar)`); }
              e.target.value = "";
            }}
          />
        </div>
        {draft.semanas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs font-medium text-muted-foreground mr-1">Semanas:</span>
            {draft.semanas
              .slice()
              .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))
              .map((s) => {
                const cap = lecturasCapturadas(s, true);
                const esp = lecturasEsperadas(s, true);
                const vacia = cap === 0;
                const completa = esp > 0 && cap >= esp;
                const isActive = activeWeekId === s.id;
                return (
                  <div key={s.id} className={`inline-flex items-stretch rounded-md border overflow-hidden ${isActive ? "border-primary" : "border-border"}`}>
                    <button
                      onClick={() => setActiveWeekId(s.id)}
                      title={`Semana del ${s.semana_inicio} — ${cap}/${esp} lecturas`}
                      className={`text-xs px-2.5 py-1 flex items-center gap-1.5 ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                      <span>{s.semana_inicio}</span>
                      <span className={`text-[10px] px-1 rounded ${
                        isActive
                          ? "bg-primary-foreground/20"
                          : vacia
                            ? "bg-warning/20 text-warning"
                            : completa
                              ? "bg-success/20 text-success"
                              : "bg-muted text-muted-foreground"
                      }`}>
                        {vacia ? "vacía" : completa ? "✓" : `${cap}/${esp}`}
                      </span>
                    </button>
                    {canDelete && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteWeek(s.id); }}
                        title={`Eliminar semana del ${s.semana_inicio}`}
                        className={`px-1.5 text-xs border-l ${isActive ? "border-primary-foreground/30 text-primary-foreground hover:bg-destructive" : "border-border text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"}`}>
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {activeWeek && (
        <>
          <WeeklyReadingsTable
            semana={activeWeek}
            iso={iso}
            yaGuardada={registro.semanas.some((s) => s.id === activeWeek.id)}
            onChange={updateWeek}
          />
          <div className="rounded-xl border border-border bg-card p-4">
            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Save className="h-4 w-4 text-muted-foreground" /> Observaciones de la semana
            </label>
            <textarea
              value={activeWeek.observaciones}
              onChange={(e) => updateWeek({ ...activeWeek, observaciones: e.target.value })}
              rows={3}
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
            />
            <div className="mt-3 flex justify-end">
              {canDelete && (
                <Button size="sm" variant="ghost" onClick={() => deleteWeek(activeWeek.id)} className="text-destructive">
                  <Trash className="h-3.5 w-3.5 mr-1" /> Eliminar semana
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Botón Guardar inferior fijo cuando hay cambios */}
      {dirty && (
        <div className="sticky bottom-3 flex justify-end">
          <Button size="lg" onClick={handleSave} disabled={saving} className="gap-2 shadow-lg">
            <Save className="h-4 w-4" /> {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      )}

      <TempHRAnalysis semanas={draft.semanas} iso={iso} />

      <AlertDialog open={postSaveOpen} onOpenChange={setPostSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registro guardado ✓</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  ¿Quieres capturar otra semana del mismo registro
                  <span className="font-medium text-foreground"> ({draft.nombre})</span>?
                </div>
                <div className="text-xs space-y-1">
                  <div><b>Continuar con otra semana</b>: elige la fecha y se añade una semana nueva en blanco para seguir capturando aquí.</div>
                  <div><b>Cerrar</b>: regresa al tablero principal.</div>
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Fecha de la nueva semana (cualquier día — se ajusta al lunes)
                  </label>
                  <input
                    type="date"
                    value={nuevaSemanaFecha}
                    onChange={(e) => setNuevaSemanaFecha(e.target.value)}
                    className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9"
                  />
                  {nuevaSemanaFecha && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Lunes resultante:{" "}
                      <span className="font-mono text-foreground">
                        {lunesDe(new Date(nuevaSemanaFecha + "T00:00:00"))}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCerrarPostSave}>Cerrar (volver al tablero)</AlertDialogCancel>
            <AlertDialogAction onClick={handleNuevoRegistro}>
              Continuar con otra semana
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
