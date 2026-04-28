import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { MODULOS } from "@/lib/diafra-data";
import { Input } from "@/components/ui/input";
import { ImageImporter } from "@/components/temp-hr/ImageImporter";
import { InstrumentoSelector } from "@/components/InstrumentoSelector";
import { AreaSelector } from "@/components/AreaSelector";
import { WeeklyReadingsTable } from "@/components/temp-hr/WeeklyReadingsTable";
import { TempHRAnalysis } from "@/components/temp-hr/TempHRAnalysis";
import { ChevronLeft, Save, Trash, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Instrumento, IsoClase, ISO_TEMP_HR, AreaClasificada,
  listInstrumentos, listAreas,
} from "@/lib/catalogos";
import {
  Registro, Semana, lunesDe, nombreMes, semanaVacia,
  upsertRegistro, listRegistros, deleteRegistro,
} from "@/lib/semanas";

export const Route = createFileRoute("/modulo/$slug")({
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
  component: ModuloPage,
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

const ISO_OPTIONS: IsoClase[] = ["ISO-5", "ISO-7 (Clase C)", "ISO-8 (Clase D)", "ISO-9"];

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
  const reload = () => setRegistros(listRegistros("temphr"));
  useEffect(() => { reload(); }, []);

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(() => registros.find((r) => r.id === activeId) ?? null, [registros, activeId]);

  // Estado del formulario nuevo registro
  const [draft, setDraft] = useState({
    area_id: "",
    codigoArea: "",
    nombreArea: "",
    instrumento_id: "",
    iso: "ISO-8 (Clase D)" as IsoClase,
  });

  const createRegistro = () => {
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
    upsertRegistro(r);
    reload();
    setActiveId(r.id);
    setDraft({ area_id: "", codigoArea: "", nombreArea: "", instrumento_id: "", iso: "ISO-8 (Clase D)" });
    toast.success("Registro creado");
  };

  const removeRegistro = (id: string) => {
    if (!confirm("¿Eliminar este registro y todas sus semanas?")) return;
    deleteRegistro(id);
    if (activeId === id) setActiveId(null);
    reload();
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
                <Input placeholder="Código de área (DCC-03)" value={draft.codigoArea} onChange={(e) => setDraft({ ...draft, codigoArea: e.target.value })} />
                <Input placeholder="Nombre del área (Siembras I)" value={draft.nombreArea} onChange={(e) => setDraft({ ...draft, nombreArea: e.target.value })} />
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

                <select
                  value={draft.iso}
                  onChange={(e) => setDraft({ ...draft, iso: e.target.value as IsoClase })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {ISO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <Button onClick={createRegistro} className="w-full gap-1"><Plus className="h-4 w-4" /> Crear registro</Button>
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
                registro={active}
                onChange={(r) => { upsertRegistro(r); reload(); }}
                onDelete={() => removeRegistro(active.id)}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function RegistroEditor({ registro, onChange, onDelete }: {
  registro: Registro; onChange: (r: Registro) => void; onDelete: () => void;
}) {
  const iso = (registro.iso ?? "ISO-8 (Clase D)") as IsoClase;
  const [activeWeekId, setActiveWeekId] = useState<string | null>(registro.semanas[0]?.id ?? null);
  useEffect(() => {
    if (!activeWeekId && registro.semanas[0]) setActiveWeekId(registro.semanas[0].id);
  }, [registro.semanas, activeWeekId]);

  const activeWeek = registro.semanas.find((s) => s.id === activeWeekId) ?? null;

  const addEmptyWeek = (semana_inicio?: string) => {
    const fecha = semana_inicio ? new Date(semana_inicio + "T00:00:00") : new Date();
    const lunes = semana_inicio ?? lunesDe(fecha);
    if (registro.semanas.some((s) => s.semana_inicio === lunes)) {
      toast.error("Ya existe una semana con ese lunes");
      return;
    }
    const s = semanaVacia({ semana_inicio: lunes, mes: nombreMes(fecha), anio: String(fecha.getFullYear()), unidad: "°C / %HR", esTHR: true });
    const next = { ...registro, semanas: [...registro.semanas, s] };
    onChange(next);
    setActiveWeekId(s.id);
  };

  const handleExtracted = (s: Semana) => {
    // Si ya existe una semana con ese lunes, fusionamos las lecturas (la IA puede traer solo T o HR)
    const existing = registro.semanas.find((x) => x.semana_inicio === s.semana_inicio);
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
      semanas = registro.semanas.map((x) => (x.id === existing.id ? merged : x));
      setActiveWeekId(existing.id);
    } else {
      semanas = [...registro.semanas, s];
      setActiveWeekId(s.id);
    }
    onChange({ ...registro, semanas });
  };

  const updateWeek = (s: Semana) => {
    onChange({ ...registro, semanas: registro.semanas.map((x) => (x.id === s.id ? s : x)) });
  };
  const deleteWeek = (id: string) => {
    if (!confirm("¿Eliminar esta semana?")) return;
    onChange({ ...registro, semanas: registro.semanas.filter((x) => x.id !== id) });
    if (activeWeekId === id) setActiveWeekId(null);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{registro.nombre}</h2>
          <p className="text-xs text-muted-foreground">{iso} · {registro.semanas.length} semana(s)</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => addEmptyWeek()} className="gap-1">
            <Plus className="h-4 w-4" /> Nueva semana actual
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete} className="gap-1 text-destructive hover:text-destructive">
            <Trash className="h-4 w-4" /> Eliminar registro
          </Button>
        </div>
      </div>

      <ImageImporter
        context={{
          codigoArea: registro.codigo_area_libre ?? "",
          nombreArea: registro.nombre_area_libre ?? "",
          instrumento: registro.instrumento_id ?? "",
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
              const existing = registro.semanas.find((s) => s.semana_inicio === lunes);
              if (existing) { setActiveWeekId(existing.id); toast.info(`Semana ${lunes} ya existe — seleccionada`); }
              else { addEmptyWeek(lunes); toast.success(`Semana ${lunes} creada`); }
              e.target.value = "";
            }}
          />
          <span className="text-[10px] text-muted-foreground">Se ajusta automáticamente al lunes de esa semana.</span>
        </div>
        {registro.semanas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs font-medium text-muted-foreground mr-1">Semanas guardadas:</span>
            {registro.semanas
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
          <WeeklyReadingsTable semana={activeWeek} iso={iso} onChange={updateWeek} />
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
              <Button size="sm" variant="ghost" onClick={() => deleteWeek(activeWeek.id)} className="text-destructive">
                <Trash className="h-3.5 w-3.5 mr-1" /> Eliminar semana
              </Button>
            </div>
          </div>
        </>
      )}

      <TempHRAnalysis semanas={registro.semanas} iso={iso} />
    </div>
  );
}
