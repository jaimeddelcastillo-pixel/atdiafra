import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/lib/auth-context";
import { MODULOS } from "@/lib/diafra-data";

import { ImageImporter } from "@/components/temp-hr/ImageImporter";
import { InstrumentoSelector } from "@/components/InstrumentoSelector";
import { AreaSelector } from "@/components/AreaSelector";
import { WeeklyReadingsTable } from "@/components/temp-hr/WeeklyReadingsTable";
import { TempHRAnalysis } from "@/components/temp-hr/TempHRAnalysis";
import { ChevronLeft, Save, Trash, Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  esSemanaVacia, lecturasCapturadas, lecturasEsperadas,
} from "@/lib/semanas";

export const Route = createFileRoute("/modulo/$slug")({
  validateSearch: (search: Record<string, unknown>): { registroId?: string } => ({
    registroId: typeof search.registroId === "string" ? search.registroId : undefined,
  }),
  head: ({ params }) => {
    const m = MODULOS.find((x) => x.slug === params.slug);
    return {
      meta: [
        { title: `${m?.nombre ?? "Módulo"} — Análisis de Tendencias DIAFRA` },
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

  if (modulo.id !== "temp_hr") {
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
  return <TempHRModule />;
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
    iso: "ISO-8 (Clase D)" as IsoClase,
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
      setDraft({ area_id: "", codigoArea: "", nombreArea: "", instrumento_id: "", iso: "ISO-8 (Clase D)" });
      toast.success("Registro creado");
    } catch (e: any) {
      toast.error("No se pudo crear el registro: " + e.message);
    }
  };

  const removeRegistro = async (id: string) => {
    if (!confirm("¿Eliminar este registro y todas sus semanas?")) return;
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
          Captura semanal por área e instrumento (Lunes–Domingo × 3 turnos = 21 lecturas).
        </p>

        {/* Selector / creación de registro */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 rounded-xl border border-border bg-card p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Registros</h3>
              {registros.length === 0 && <p className="text-xs text-muted-foreground">Sin registros aún. Crea uno nuevo abajo.</p>}
              <ul className="space-y-1">
                {registros.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setActiveId(r.id)}
                      className={`w-full text-left rounded-md px-3 py-2 text-xs ${activeId === r.id ? "bg-primary/10 text-foreground border border-primary/30" : "hover:bg-muted"}`}>
                      <div className="font-medium">{r.nombre}</div>
                      <div className="text-muted-foreground mt-0.5">
                        {r.iso} · {r.semanas.length} semana(s)
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="text-sm font-semibold">Nuevo registro</h3>
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
            </div>
          </div>

          <div className="lg:col-span-2">
            {!active ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Selecciona un registro de la lista o crea uno nuevo para empezar a capturar.
              </div>
            ) : (
              <RegistroEditor
                key={active.id}
                registro={active}
                onPersist={async (r) => {
                  try { await upsertRegistro(r); await reload(); }
                  catch (e: any) { toast.error("No se pudo guardar: " + e.message); throw e; }
                }}
                onDelete={() => removeRegistro(active.id)}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function RegistroEditor({ registro, onPersist, onDelete }: {
  registro: Registro; onPersist: (r: Registro) => Promise<void>; onDelete: () => void;
}) {
  const { canWriteRecords, canDelete } = useAuth();
  const iso = (registro.iso ?? "ISO-8 (Clase D)") as IsoClase;
  // Buffer local: cambios no se persisten hasta presionar "Guardar"
  const [draft, setDraft] = useState<Registro>(registro);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

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

  // Importación por imagen: persiste de inmediato (con cualquier cambio sucio pendiente del draft)
  const handleExtracted = async (s: Semana) => {
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
      };
      semanas = draft.semanas.map((x) => (x.id === existing.id ? merged : x));
      setActiveWeekId(existing.id);
    } else {
      // Detectar semanas vacías de OTRA fecha que probablemente se crearon por accidente
      // (e.g. el blank "hoy" creado al abrir el editor). Las eliminamos automáticamente
      // para no dejar semanas huérfanas en blanco.
      const limpias = draft.semanas.filter((x) => !esSemanaVacia(x, true));
      const removidas = draft.semanas.length - limpias.length;
      semanas = [...limpias, s];
      setActiveWeekId(s.id);
      if (removidas > 0) {
        toast.info(`Se descartó ${removidas} semana(s) vacía(s) sin datos para evitar duplicados.`);
      }
    }
    const next = { ...draft, semanas };
    setDraft(next);
    try {
      await onPersist(next);
      setDirty(false);
      toast.success("Imagen importada y guardada en la nube");
    } catch {
      setDirty(true);
    }
  };

  const updateWeek = (s: Semana) => mutate((r) => ({ ...r, semanas: r.semanas.map((x) => (x.id === s.id ? s : x)) }));

  const deleteWeek = (id: string) => {
    if (!confirm("¿Eliminar esta semana? (se guarda al instante)")) return;
    const next = { ...draft, semanas: draft.semanas.filter((x) => x.id !== id) };
    setDraft(next);
    if (activeWeekId === id) setActiveWeekId(null);
    onPersist(next).then(() => { setDirty(false); toast.success("Semana eliminada"); }).catch(() => {});
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onPersist(draft);
      setDirty(false);
      toast.success("Cambios guardados");
    } finally {
      setSaving(false);
    }
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
          {canDelete && (
            <Button size="sm" variant="outline" onClick={onDelete} className="gap-1 text-destructive hover:text-destructive">
              <Trash className="h-4 w-4" /> Eliminar registro
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
      />

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Elegir semana (cualquier fecha):</span>
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
          <span className="text-[10px] text-muted-foreground">Se ajusta automáticamente al lunes de esa semana.</span>
        </div>
        {draft.semanas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs font-medium text-muted-foreground mr-1">Semanas:</span>
            {draft.semanas
              .slice()
              .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))
              .map((s) => (
                <button key={s.id} onClick={() => setActiveWeekId(s.id)}
                  className={`text-xs rounded-md px-2.5 py-1 border ${activeWeekId === s.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                  {s.semana_inicio}
                </button>
              ))}
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
    </div>
  );
}
