// Módulo Presiones diferenciales — bitácora semanal Pa por par de cuartos.
// Inspirado en TempHRModule pero con 1 sola variable (Pa) y catálogo de pares precargado.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Plus, Save, Trash } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useAuth } from "@/lib/auth-context";
import {
  AreaClasificada, Instrumento, ParCuartos,
  listAreas, listInstrumentos, listPares,
} from "@/lib/catalogos";
import {
  Registro, Semana, lunesDe, nombreMes, semanaVacia,
  upsertRegistro, listRegistros, deleteRegistro,
  esSemanaVacia, lecturasCapturadas, lecturasEsperadas, rangoFechasRegistro,
} from "@/lib/semanas";

import { ParCuartosSelector } from "./ParCuartosSelector";
import { WeeklyReadingsTablePresion } from "./WeeklyReadingsTablePresion";

export function PresionesModule() {
  const [pares, setPares] = useState<ParCuartos[]>([]);
  const [areas, setAreas] = useState<AreaClasificada[]>([]);
  const [manometros, setManometros] = useState<Instrumento[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);

  const reload = () =>
    listRegistros("presiones")
      .then(setRegistros)
      .catch((e) => toast.error("No se pudieron cargar registros: " + e.message));

  useEffect(() => {
    listPares(true).then(setPares).catch((e) => toast.error("Pares: " + e.message));
    listAreas(true).then(setAreas).catch((e) => toast.error("Áreas: " + e.message));
    listInstrumentos({ tipo: "manometro_diferencial", soloActivos: true })
      .then(setManometros)
      .catch((e) => toast.error("Instrumentos: " + e.message));
    reload();
  }, []);

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(
    () => registros.find((r) => r.id === activeId) ?? null,
    [registros, activeId],
  );

  const [draftParId, setDraftParId] = useState("");

  const createRegistro = async () => {
    if (!draftParId) {
      toast.error("Selecciona un par de cuartos");
      return;
    }
    const par = pares.find((p) => p.id === draftParId);
    if (!par) return;
    const xCod = areas.find((a) => a.id === par.cuarto_x_id)?.codigo ?? "X";
    const yCod = areas.find((a) => a.id === par.cuarto_y_id)?.codigo ?? "Y";
    const instCod = manometros.find((m) => m.id === par.instrumento_id)?.codigo ?? "";

    const r: Registro = {
      id: crypto.randomUUID(),
      modulo: "presiones",
      nombre: `${xCod} vs ${yCod}${instCod ? ` · ${instCod}` : ""}`,
      par_cuartos_id: par.id,
      instrumento_id: par.instrumento_id ?? null,
      iso: par.iso,
      lse: null,
      lie: par.limite_normativo_pa,
      semanas: [],
      created_at: new Date().toISOString(),
      activo: true,
    };
    try {
      await upsertRegistro(r);
      await reload();
      setActiveId(r.id);
      setDraftParId("");
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
          Captura semanal por par de cuartos (Lunes–Domingo × 3 turnos = 21 lecturas) en Pa.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 rounded-xl border border-border bg-card p-4 space-y-4">
            {active ? (
              <div>
                <h3 className="text-sm font-semibold mb-2">Registro activo</h3>
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                  <div className="font-medium text-foreground">{active.nombre}</div>
                  <div className="text-muted-foreground mt-0.5">
                    {active.iso} · ≥{active.lie} Pa · {rangoFechasRegistro(active)}
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
                    Elige el par de cuartos del catálogo. Si falta alguno, se administra en{" "}
                    <Link to="/configuracion" className="text-primary hover:underline">Configuración</Link>.
                  </p>
                </div>
                <ParCuartosSelector
                  value={draftParId}
                  pares={pares}
                  areas={areas}
                  instrumentos={manometros}
                  onChange={(id) => setDraftParId(id)}
                />
                <Button onClick={createRegistro} className="w-full gap-1">
                  <Plus className="h-4 w-4" /> Crear registro
                </Button>
                {pares.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No hay pares cargados. Ve a Configuración para administrarlos.
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
                pares={pares}
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
function RegistroEditorPresion({ registro, pares, onPersist, onDelete }: {
  registro: Registro;
  pares: ParCuartos[];
  onPersist: (r: Registro) => Promise<void>;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const { canWriteRecords, canDelete } = useAuth();
  const [draft, setDraft] = useState<Registro>(registro);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [postSaveOpen, setPostSaveOpen] = useState(false);
  const [nuevaSemanaFecha, setNuevaSemanaFecha] = useState<string>("");

  useEffect(() => { setDraft(registro); setDirty(false); }, [registro.id]);
  useEffect(() => { if (!dirty) setDraft(registro); }, [registro]);

  const par = pares.find((p) => p.id === draft.par_cuartos_id);
  const limiteMinPa = Number(draft.lie ?? par?.limite_normativo_pa ?? 5);

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

  const handleCerrarPostSave = () => { setPostSaveOpen(false); navigate({ to: "/" }); };

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
          {canWriteRecords && (
            <Button size="sm" variant="outline" onClick={() => addEmptyWeek()} className="gap-1">
              <Plus className="h-4 w-4" /> Nueva semana actual
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
          <span className="text-[10px] text-muted-foreground">Se ajusta automáticamente al lunes.</span>
        </div>
        {draft.semanas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
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
                  {canDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteWeek(s.id); }}
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

      {dirty && (
        <div className="sticky bottom-3 flex justify-end">
          <Button size="lg" onClick={handleSave} disabled={saving} className="gap-2 shadow-lg">
            <Save className="h-4 w-4" /> {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      )}

      <AlertDialog open={postSaveOpen} onOpenChange={setPostSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registro guardado ✓</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>¿Quieres capturar otra semana del mismo registro <span className="font-medium text-foreground">({draft.nombre})</span>?</div>
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
            <AlertDialogAction onClick={handleNuevoRegistro}>Continuar con otra semana</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
