// Módulo Presiones diferenciales — bitácora semanal Pa por par de cuartos.
// Inspirado en TempHRModule pero con 1 sola variable (Pa) y catálogo de pares precargado.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, Plus, Save, Trash, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useAuth } from "@/lib/auth-context";
import {
  AreaClasificada, Instrumento,
  listAreas, listInstrumentos,
} from "@/lib/catalogos";
import {
  ObjetivoPresion, listObjetivosPresion, describirLimite,
} from "@/lib/objetivos-presion";
import {
  Registro, Semana, lunesDe, nombreMes, semanaVacia,
  upsertRegistro, listRegistros, deleteRegistro,
  esSemanaVacia, lecturasCapturadas, lecturasEsperadas, rangoFechasRegistro,
} from "@/lib/semanas";
import { analizarRegistro, type Periodo } from "@/lib/normativo";
import { exportarNormativoPDF } from "@/lib/export-normativo";

import { ObjetivoPresionSelector, type SeleccionPresion } from "./ObjetivoPresionSelector";
import { WeeklyReadingsTablePresion } from "./WeeklyReadingsTablePresion";
import { ImageImporterPresion } from "./ImageImporterPresion";
import { LoteFotosImporter } from "@/components/LoteFotosImporter";
import { FotoSemana } from "@/components/FotoSemana";
import { PresionAnalysis } from "./PresionAnalysis";

export function PresionesModule() {
  const [objetivos, setObjetivos] = useState<ObjetivoPresion[]>([]);
  const [areas, setAreas] = useState<AreaClasificada[]>([]);
  const [manometros, setManometros] = useState<Instrumento[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);

  const reload = () =>
    listRegistros("presiones")
      .then(setRegistros)
      .catch((e) => toast.error("No se pudieron cargar registros: " + e.message));

  useEffect(() => {
    listObjetivosPresion(true).then(setObjetivos).catch((e) => toast.error("Objetivos: " + e.message));
    listAreas(true).then(setAreas).catch((e) => toast.error("Áreas: " + e.message));
    // Ahora aceptamos manómetros de cualquier tipo (diferencial o de filtro)
    listInstrumentos({ soloActivos: true })
      .then((all) => setManometros(all.filter((i) => i.tipo === "manometro_diferencial" || i.tipo === "manometro_filtro")))
      .catch((e) => toast.error("Instrumentos: " + e.message));
    reload();
  }, []);

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(
    () => registros.find((r) => r.id === activeId) ?? null,
    [registros, activeId],
  );

  const [draftSel, setDraftSel] = useState<SeleccionPresion | null>(null);

  const createRegistro = async () => {
    if (!draftSel) {
      toast.error("Selecciona un objetivo de medición");
      return;
    }

    let nombre = "";
    let par_cuartos_id: string | null = null;
    let instrumento_id: string | null = null;
    let iso: string | null = null;
    let lie: number | null = null;
    let lse: number | null = null;

    if (draftSel.tipo === "par_cuartos") {
      const obj = objetivos.find((o) => o.id === draftSel.id);
      if (!obj) return;
      const xCod = areas.find((a) => a.id === obj.cuarto_x_id)?.codigo ?? "X";
      const yCod = areas.find((a) => a.id === obj.cuarto_y_id)?.codigo ?? "Y";
      const instCod = manometros.find((m) => m.id === obj.instrumento_id)?.codigo ?? "";
      nombre = `${xCod} vs ${yCod}${instCod ? ` · ${instCod}` : ""}`;
      par_cuartos_id = obj.id;
      instrumento_id = obj.instrumento_id ?? null;
      iso = obj.iso ?? null;
      lie = obj.limite_normativo_pa;
      lse = obj.lse_pa;
    } else {
      // instrumento o filtro_hepa: la fuente de verdad ES el catálogo de instrumentos
      const inst = manometros.find((m) => m.id === draftSel.id);
      if (!inst) return;
      const tag = draftSel.tipo === "filtro_hepa" ? "Filtro HEPA" : "Instrumento";
      nombre = `${tag} · ${inst.codigo}${inst.especificacion ? ` · ${inst.especificacion.split("|")[0].trim()}` : ""}`;
      instrumento_id = inst.id;
      lie = inst.lie_pa;
      lse = inst.lse_pa;
    }

    const yaExiste = registros.find((x) => x.activo &&
      (x.par_cuartos_id ?? null) === par_cuartos_id &&
      (par_cuartos_id ? true : (x.instrumento_id ?? null) === instrumento_id));
    if (yaExiste) {
      setActiveId(yaExiste.id); setDraftSel(null);
      toast.info("Este instrumento ya tiene registro — se abrió el existente");
      return;
    }
    const r: Registro = {
      id: crypto.randomUUID(),
      modulo: "presiones",
      nombre,
      par_cuartos_id,
      instrumento_id,
      iso: iso as any,
      lse,
      lie,
      semanas: [],
      created_at: new Date().toISOString(),
      activo: true,
    };
    try {
      await upsertRegistro(r);
      await reload();
      setActiveId(r.id);
      setDraftSel(null);
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
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-3">
          <ChevronLeft className="h-4 w-4" /> Tablero
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">Presiones diferenciales</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Captura semanal (Lunes–Domingo × 3 turnos, según aplique) para pares de cuartos, instrumentos (equipos) y filtros HEPA.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 rounded-xl border border-border bg-card p-4 space-y-4">
            {active ? (
              <div>
                <h3 className="text-sm font-semibold mb-2">Registro activo</h3>
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">{active.nombre}</div>
                  <div className="text-muted-foreground mt-0.5">
                    {active.iso ? `${active.iso} · ` : ""}
                    {active.lie != null ? `≥${active.lie} Pa` : ""}
                    {active.lse != null ? ` · ≤${active.lse} Pa` : ""}
                    {" · "}{rangoFechasRegistro(active)}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => setActiveId(null)}>
                  Crear otro registro
                </Button>
                <Link to="/reporte" className="block text-center text-xs text-muted-foreground hover:text-primary mt-2">
                  Ver todos los registros en Reportes →
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-semibold">Nuevo registro</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Elige Par de cuartos, Instrumento (manómetro) o Filtro HEPA y luego selecciona el ítem. El catálogo se administra en{" "}
                    <Link to="/configuracion" className="text-primary hover:underline">Configuración</Link>.
                  </p>
                </div>
                <ObjetivoPresionSelector
                  value={draftSel}
                  objetivos={objetivos}
                  areas={areas}
                  instrumentos={manometros}
                  onChange={setDraftSel}
                />
                <Button onClick={createRegistro} className="w-full gap-1">
                  <Plus className="h-4 w-4" /> Crear registro
                </Button>
                {objetivos.length === 0 && manometros.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No hay objetivos ni instrumentos cargados. Ve a Configuración para administrarlos.
                  </p>
                )}
              </>
            )}

            {registros.length > 0 && (
              <div className="border-t border-border pt-3">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Registros existentes</h4>
                <ul className="space-y-1 max-h-64 overflow-y-auto">
                  {registros.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => setActiveId(r.id)}
                        className={`w-full text-left text-xs px-2 py-1.5 rounded-md border ${activeId === r.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                        <div className="font-medium truncate">{r.nombre}</div>
                        <div className="text-[10px] text-muted-foreground">{rangoFechasRegistro(r)}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            {!active ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Crea un registro nuevo o ábrelo de la lista para empezar a capturar.
              </div>
            ) : (
              <RegistroEditorPresion
                key={active.id}
                registro={active}
                objetivos={objetivos}
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

// =====================================================================
function RegistroEditorPresion({ registro, objetivos, onPersist, onDelete }: {
  registro: Registro;
  objetivos: ObjetivoPresion[];
  onPersist: (r: Registro) => Promise<void>;
  onDelete: () => void;
}) {
  const { canWriteRecords, canDelete } = useAuth();
  const [draft, setDraft] = useState<Registro>(registro);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [postSaveOpen, setPostSaveOpen] = useState(false);
  const [nuevaSemanaFecha, setNuevaSemanaFecha] = useState<string>("");
  const [newWeekOpen, setNewWeekOpen] = useState(false);
  const [manualWeekDate, setManualWeekDate] = useState<string>("");

  // Export PDF normativo
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [exportDesde, setExportDesde] = useState<string>(yearStart);
  const [exportHasta, setExportHasta] = useState<string>(today);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  const handleExportPDF = async () => {
    if (!exportDesde || !exportHasta || exportDesde > exportHasta) {
      toast.error("Rango de fechas inválido"); return;
    }
    setExportingPDF(true);
    const t = toast.loading("Generando PDF normativo…");
    try {
      const periodo: Periodo = { tipo: "custom", desde: exportDesde, hasta: exportHasta };
      const analisis = [analizarRegistro(draft, periodo)];
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

  useEffect(() => { setDraft(registro); setDirty(false); }, [registro.id]);
  useEffect(() => { if (!dirty) setDraft(registro); }, [registro]);

  const objetivo = objetivos.find((o) => o.id === draft.par_cuartos_id);
  const limiteMinPa = Number(draft.lie ?? objetivo?.limite_normativo_pa ?? objetivo?.lie_pa ?? 5);

  const [activeWeekId, setActiveWeekId] = useState<string | null>(draft.semanas[0]?.id ?? null);
  useEffect(() => {
    if (!activeWeekId && draft.semanas[0]) setActiveWeekId(draft.semanas[0].id);
  }, [draft.semanas, activeWeekId]);
  const activeWeek = draft.semanas.find((s) => s.id === activeWeekId) ?? null;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
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
    const s = semanaVacia({
      semana_inicio: lunes, mes: nombreMes(fecha), anio: String(fecha.getFullYear()),
      unidad: "Pa", esTHR: false,
    });
    mutate((r) => ({ ...r, semanas: [...r.semanas, s] }));
    setActiveWeekId(s.id);
  };

  const updateWeek = (s: Semana) =>
    mutate((r) => ({ ...r, semanas: r.semanas.map((x) => (x.id === s.id ? s : x)) }));

  // Corregir la fecha de una semana ya capturada (p. ej. la foto era de otra semana)
  const cambiarFechaSemana = (id: string, valor: string) => {
    if (!valor) return;
    const fecha = new Date(valor + "T00:00:00");
    const lunes = lunesDe(fecha);
    const actual = draft.semanas.find((s) => s.id === id);
    if (!actual) return;
    if (actual.semana_inicio === lunes) return;
    if (draft.semanas.some((s) => s.id !== id && s.semana_inicio === lunes)) {
      toast.error(`Ya existe una semana del ${lunes}. Elimínala primero o elige otra fecha.`);
      return;
    }
    const base = new Date(lunes + "T00:00:00");
    mutate((r) => ({
      ...r,
      semanas: r.semanas.map((x) =>
        x.id === id
          ? { ...x, semana_inicio: lunes, mes: nombreMes(base), anio: String(base.getFullYear()) }
          : x,
      ),
    }));
    toast.success(`Semana movida al ${lunes} — recuerda Guardar`);
  };

  const seleccionarOMoverSemana = (valor: string) => {
    if (!valor) return;
    const lunes = lunesDe(new Date(valor + "T00:00:00"));
    const existing = draft.semanas.find((s) => s.semana_inicio === lunes);
    if (existing) {
      setActiveWeekId(existing.id);
      if (existing.id !== activeWeekId) toast.info(`Semana ${lunes} seleccionada`);
      return;
    }
    if (activeWeek) cambiarFechaSemana(activeWeek.id, valor);
  };


  // Importación por imagen: SOLO actualiza el draft local. NO persiste hasta "Guardar".
  const handleExtracted = (s: Semana) => {
    const existing = draft.semanas.find((x) => x.semana_inicio === s.semana_inicio);
    let semanas: Semana[];
    if (existing) {
      const merged: Semana = {
        ...existing,
        lecturas: s.lecturas.some((p) => p.valor != null) ? s.lecturas : existing.lecturas,
        observaciones: [existing.observaciones, s.observaciones].filter(Boolean).join("\n"),
        source: "imagen",
        saved_at: new Date().toISOString(),
        foto_path: s.foto_path ?? existing.foto_path ?? null,
      };
      semanas = draft.semanas.map((x) => (x.id === existing.id ? merged : x));
      setActiveWeekId(existing.id);
    } else {
      const limpias = draft.semanas.filter((x) => !esSemanaVacia(x, false));
      const removidas = draft.semanas.length - limpias.length;
      semanas = [...limpias, s];
      setActiveWeekId(s.id);
      if (removidas > 0) toast.info(`Se descartó ${removidas} semana(s) vacía(s) sin datos.`);
    }
    setDraft({ ...draft, semanas });
    setDirty(true);
    toast.success("Imagen importada — revisa y presiona Guardar");
  };

  // Lote de fotos: integra varias semanas al borrador de una sola vez (reemplaza la misma semana).
  const handleLote = (nuevas: Semana[]) => {
    const porLunes = new Map(nuevas.map((s) => [s.semana_inicio, s]));
    const conservadas = draft.semanas
      .filter((x) => !esSemanaVacia(x, false) || porLunes.has(x.semana_inicio))
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

  const deleteWeek = (id: string) => {
    const target = draft.semanas.find((x) => x.id === id);
    if (!target) return;
    const cap = lecturasCapturadas(target, false);
    const esp = lecturasEsperadas(target, false);
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
      const base = new Date(`${activeWeek?.semana_inicio ?? lunesDe(new Date())}T00:00:00`);
      base.setDate(base.getDate() + 7);
      let candidato = lunesDe(base);
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

  const handleNuevoRegistro = () => {
    if (!nuevaSemanaFecha) { toast.error("Selecciona una fecha para la nueva semana"); return; }
    const lunes = lunesDe(new Date(nuevaSemanaFecha + "T00:00:00"));
    if (draft.semanas.some((s) => s.semana_inicio === lunes)) {
      toast.error(`Ya existe la semana del ${lunes}`); return;
    }
    setPostSaveOpen(false);
    addEmptyWeek(lunes);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100);
  };

  const handleCrearSemanaManual = () => {
    if (!manualWeekDate) { toast.error("Selecciona una fecha para la nueva semana"); return; }
    const lunes = lunesDe(new Date(manualWeekDate + "T00:00:00"));
    const existing = draft.semanas.find((s) => s.semana_inicio === lunes);
    if (existing) {
      setActiveWeekId(existing.id);
      setNewWeekOpen(false);
      setManualWeekDate("");
      toast.info(`La semana ${lunes} ya existía y quedó seleccionada`);
      return;
    }
    addEmptyWeek(lunes);
    setNewWeekOpen(false);
    setManualWeekDate("");
    toast.success(`Semana ${lunes} creada — captura las lecturas y guarda`);
  };

  const handleDiscard = () => {
    if (!confirm("¿Descartar todos los cambios sin guardar?")) return;
    setDraft(registro); setDirty(false); toast.info("Cambios descartados");
  };

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-4 flex flex-wrap items-end justify-between gap-3 ${dirty ? "border-warning bg-warning/5" : "border-border bg-card"}`}>
        <div>
          <h2 className="text-base font-semibold">{draft.nombre}</h2>
          <p className="text-xs text-muted-foreground">
            {draft.iso} · ≥{limiteMinPa} Pa · {draft.semanas.length} semana(s)
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
                <p className="text-xs text-muted-foreground mt-0.5">Solo este registro, en el rango que elijas.</p>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Desde</label>
                  <input type="date" value={exportDesde} max={exportHasta}
                    onChange={(e) => setExportDesde(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Hasta</label>
                  <input type="date" value={exportHasta} min={exportDesde}
                    onChange={(e) => setExportHasta(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9" />
                </div>
              </div>
              <Button size="sm" onClick={handleExportPDF} disabled={exportingPDF} className="w-full gap-1">
                <FileText className="h-4 w-4" /> {exportingPDF ? "Generando…" : "Generar PDF"}
              </Button>
            </PopoverContent>
          </Popover>
          {canWriteRecords && (
            <Button size="sm" variant="outline" onClick={() => setNewWeekOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" /> Nueva semana
            </Button>
          )}
          {dirty && canWriteRecords && (
            <Button size="sm" variant="ghost" onClick={handleDiscard} className="gap-1">Descartar</Button>
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

      <ImageImporterPresion
        context={{
          codigoArea: objetivo ? `${draft.nombre}` : "",
          nombreArea: draft.nombre,
          instrumento: draft.instrumento_id ?? "",
          iso: draft.iso ?? "",
          limiteMinPa,
        }}
        semanaInicio={activeWeek?.semana_inicio ?? lunesDe(new Date())}
        onExtracted={handleExtracted}
        extra={
          <LoteFotosImporter
            modulo="presiones"
            disabled={!canWriteRecords}
            context={{
              codigoArea: objetivo ? `${draft.nombre}` : "",
              nombreArea: draft.nombre,
              instrumento: draft.instrumento_id ?? "",
              iso: draft.iso ?? "",
              limiteMinPa,
            }}
            semanasExistentes={draft.semanas.filter((s) => !esSemanaVacia(s, false)).map((s) => s.semana_inicio)}
            onApply={handleLote}
          />
        }
      />

      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        {activeWeek && <FotoSemana path={activeWeek.foto_path} semana={activeWeek.semana_inicio} />}
        {activeWeek && canWriteRecords && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-foreground mr-1 flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> Semana seleccionada:
            </span>
            <input
              type="date"
              value={activeWeek.semana_inicio}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              onChange={(e) => seleccionarOMoverSemana(e.target.value)}
            />
            <span className="text-[10px] text-muted-foreground">
              Elige una semana existente o corrige la fecha de ésta. Se ajusta al lunes.
            </span>
          </div>
        )}

        {draft.semanas.length > 0 && (
            <div className={`flex flex-wrap items-center gap-2 ${activeWeek && canWriteRecords ? "border-t border-border pt-3" : ""}`}>
            <span className="text-xs font-medium text-muted-foreground mr-1">Semanas:</span>
            {draft.semanas.slice().sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio)).map((s) => {
              const cap = lecturasCapturadas(s, false);
              const esp = lecturasEsperadas(s, false);
              const vacia = cap === 0;
              const completa = esp > 0 && cap >= esp;
              const isActive = activeWeekId === s.id;
              return (
                <div key={s.id} className={`inline-flex items-stretch rounded-md border overflow-hidden ${isActive ? "border-primary" : "border-border"}`}>
                  <button
                    onClick={() => setActiveWeekId(s.id)}
                    className={`text-xs px-2.5 py-1 flex items-center gap-1.5 ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    <span>{s.semana_inicio}</span>
                    <span className={`text-[10px] px-1 rounded ${
                      isActive ? "bg-primary-foreground/20"
                      : vacia ? "bg-warning/20 text-warning"
                      : completa ? "bg-success/20 text-success"
                      : "bg-muted text-muted-foreground"
                    }`}>
                      {vacia ? "vacía" : completa ? "✓" : `${cap}/${esp}`}
                    </span>
                  </button>
                  <button
                      onClick={(e) => { e.stopPropagation(); if (!canDelete) { toast.info("Solo el super admin puede eliminar semanas"); return; } deleteWeek(s.id); }}
                      title={canDelete ? `Eliminar semana del ${s.semana_inicio}` : "Solo el super admin puede eliminar semanas"}
                      aria-label={`Eliminar semana del ${s.semana_inicio}`}
                      className={`px-1.5 text-xs border-l ${canDelete ? "" : "opacity-40 cursor-not-allowed"} ${isActive ? "border-primary-foreground/30 text-primary-foreground hover:bg-destructive" : "border-border text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"}`}>
                      ✕
                    </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeWeek && (
        <>
          <WeeklyReadingsTablePresion
            semana={activeWeek}
            limiteMinPa={limiteMinPa}
            parLabel={draft.nombre}
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
          </div>
        </>
      )}

      <PresionAnalysis semanas={draft.semanas} limiteMinPa={limiteMinPa} />

      <AlertDialog open={newWeekOpen} onOpenChange={setNewWeekOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nueva semana del mismo instrumento</AlertDialogTitle>
            <AlertDialogDescription>
              Elige cualquier día de la semana que deseas capturar. Se guardará usando el lunes correspondiente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="manual-week-date" className="text-xs font-medium text-foreground">Fecha de la semana</label>
            <input
              id="manual-week-date"
              type="date"
              value={manualWeekDate}
              onChange={(e) => setManualWeekDate(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm h-9"
            />
            {manualWeekDate && (
              <p className="text-[11px] text-muted-foreground">
                Semana que inicia el <span className="font-mono text-foreground">{lunesDe(new Date(manualWeekDate + "T00:00:00"))}</span>
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCrearSemanaManual} disabled={!manualWeekDate}>Crear semana</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={postSaveOpen} onOpenChange={setPostSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambios guardados</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>¿Quieres continuar con otra semana del mismo instrumento <span className="font-medium text-foreground">({draft.nombre})</span>?</div>
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
            <AlertDialogCancel>Finalizar</AlertDialogCancel>
            <AlertDialogAction onClick={handleNuevoRegistro}>Continuar con otra semana</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
