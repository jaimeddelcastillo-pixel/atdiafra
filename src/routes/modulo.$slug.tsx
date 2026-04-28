import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { MODULOS, ISO_LIMITS, IsoClass } from "@/lib/diafra-data";
import { Input } from "@/components/ui/input";
import { ImageImporter, type ExtractedReading } from "@/components/temp-hr/ImageImporter";
import { ReadingsTable } from "@/components/temp-hr/ReadingsTable";
import { TempHRAnalysis } from "@/components/temp-hr/TempHRAnalysis";
import { Reading, ModuleState } from "@/components/temp-hr/types";
import { loadJSON, saveJSON } from "@/lib/storage";
import { ChevronLeft, Save, Download, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
        <p className="mt-2 text-muted-foreground">El módulo solicitado no existe o aún no está habilitado.</p>
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

interface ContextState {
  codigoArea: string;
  nombreArea: string;
  instrumento: string;
  iso: IsoClass;
}

const CONTEXT_KEY = "temp_hr:context";
const DEFAULT_CONTEXT: ContextState = {
  codigoArea: "",
  nombreArea: "",
  instrumento: "",
  iso: "ISO-8",
};

function TempHRModule() {
  // Contexto editable: código de área, nombre del área, instrumento, ISO
  const [ctx, setCtx] = useState<ContextState>(DEFAULT_CONTEXT);
  const [ctxLoaded, setCtxLoaded] = useState(false);

  // Cargar contexto persistido
  useEffect(() => {
    const saved = loadJSON<ContextState | null>(CONTEXT_KEY, null);
    if (saved) setCtx({ ...DEFAULT_CONTEXT, ...saved });
    setCtxLoaded(true);
  }, []);
  useEffect(() => {
    if (ctxLoaded) saveJSON(CONTEXT_KEY, ctx);
  }, [ctx, ctxLoaded]);

  const { codigoArea, nombreArea, instrumento, iso } = ctx;
  const setIso = (v: IsoClass) => setCtx((c) => ({ ...c, iso: v }));

  // Clave de almacenamiento por instrumento + área + ISO (con fallback)
  const storageKey = useMemo(() => {
    const a = (codigoArea || "sin-area").trim().replace(/\s+/g, "_");
    const i = (instrumento || "sin-instrumento").trim().replace(/\s+/g, "_");
    return `temp_hr:${a}:${i}:${iso}`;
  }, [codigoArea, instrumento, iso]);

  const [rows, setRows] = useState<Reading[]>([]);
  const [notas, setNotas] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  // Cargar al cambiar contexto
  useEffect(() => {
    const state = loadJSON<ModuleState | null>(storageKey, null);
    setRows(state?.readings ?? []);
    setNotas(state?.notas ?? "");
    setLoaded(true);
  }, [storageKey]);

  // Auto-persist
  useEffect(() => {
    if (!loaded) return;
    const state: ModuleState = {
      sistemaId: `${codigoArea}|${instrumento}`,
      iso,
      readings: rows,
      notas,
      updatedAt: new Date().toISOString(),
    };
    saveJSON(storageKey, state);
  }, [rows, notas, loaded, storageKey, codigoArea, instrumento, iso]);

  const handleExtracted = (extracted: ExtractedReading[], notasIA?: string) => {
    const newRows: Reading[] = extracted.map((r) => ({
      id: crypto.randomUUID(),
      fecha: r.fecha,
      hora: r.hora,
      temperatura: r.temperatura,
      humedad: r.humedad,
      turno: r.turno ?? "",
      operador: r.operador ?? "",
    }));
    setRows((prev) => [...prev, ...newRows]);
    if (notasIA) setNotas((n) => (n ? `${n}\n${notasIA}` : notasIA));
  };

  const exportCSV = () => {
    const header = ["Fecha", "Hora", "Temperatura (C)", "Humedad (%)", "Turno", "Operador"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      lines.push(
        [r.fecha ?? "", r.hora ?? "", r.temperatura ?? "", r.humedad ?? "", r.turno ?? "", r.operador ?? ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = `${(codigoArea || "area").trim()}_${(instrumento || "instr").trim()}`.replace(/\s+/g, "-");
    a.download = `temp-hr_${slug}_${iso}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (!confirm("¿Eliminar todas las lecturas de este contexto? Esta acción no se puede deshacer.")) return;
    setRows([]);
    setNotas("");
    toast.success("Lecturas eliminadas");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-3">
            <ChevronLeft className="h-4 w-4" /> Tablero
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Temperatura y Humedad Relativa</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {(codigoArea || "—")} · {(nombreArea || "Sin nombre de área")} · {(instrumento || "—")} · {iso}
                {ISO_LIMITS[iso].clase ? ` (${ISO_LIMITS[iso].clase})` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={!rows.length} className="gap-1">
                <Download className="h-4 w-4" /> Exportar CSV
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll} disabled={!rows.length} className="gap-1 text-destructive hover:text-destructive">
                <Trash className="h-4 w-4" /> Limpiar
              </Button>
            </div>
          </div>
        </div>

        {/* Contexto del área e instrumento */}
        <div className="rounded-xl border border-border bg-card p-4 mb-6 space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Código de área</label>
              <Input
                value={codigoArea}
                onChange={(e) => setCtx((c) => ({ ...c, codigoArea: e.target.value }))}
                placeholder="DCC-03"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nombre del área</label>
              <Input
                value={nombreArea}
                onChange={(e) => setCtx((c) => ({ ...c, nombreArea: e.target.value }))}
                placeholder="Siembras I"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Código del termohigrómetro</label>
              <Input
                value={instrumento}
                onChange={(e) => setCtx((c) => ({ ...c, instrumento: e.target.value }))}
                placeholder="INS-CMB-20"
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Clasificación ISO</label>
              <select
                value={iso}
                onChange={(e) => setIso(e.target.value as IsoClass)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {(Object.keys(ISO_LIMITS) as IsoClass[]).map((k) => (
                  <option key={k} value={k}>
                    {k}{ISO_LIMITS[k].clase ? ` — ${ISO_LIMITS[k].clase}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              <p><span className="font-medium text-foreground">Límites aplicables:</span></p>
              <p>T {ISO_LIMITS[iso].tempMin}–{ISO_LIMITS[iso].tempMax} °C · HR {ISO_LIMITS[iso].hrMin}–{ISO_LIMITS[iso].hrMax} %</p>
              <p className="mt-1">Persistencia automática · {rows.length} lectura(s)</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2 space-y-6">
            <ImageImporter
              context={{ codigoArea, nombreArea, instrumento, iso }}
              onExtracted={handleExtracted}
            />
            <div className="rounded-xl border border-border bg-card p-5">
              <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Save className="h-4 w-4 text-muted-foreground" /> Notas y observaciones
              </label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={5}
                placeholder="Observaciones de la bitácora, desviaciones, acciones tomadas…"
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              />
            </div>
          </div>
          <div className="lg:col-span-3 space-y-6">
            <ReadingsTable rows={rows} iso={iso} onChange={setRows} />
            <TempHRAnalysis rows={rows} iso={iso} />
          </div>
        </div>
      </main>
    </div>
  );
}
