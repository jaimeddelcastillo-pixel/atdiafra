import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { ChevronLeft, FileSpreadsheet, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reporte/registro-at")({
  head: () => ({
    meta: [
      { title: "Registro de análisis de tendencias (FOR-VAL-16-01) — TRACEA" },
      { name: "description", content: "Listado de reportes AT guardados: sistema, periodo, versión, dictamen y estado." },
      { property: "og:title", content: "Registro de análisis de tendencias (FOR-VAL-16-01) — TRACEA" },
      { property: "og:description", content: "Consulta, abre y exporta los reportes de análisis de tendencias guardados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AuthGuard><RegistroATPage /></AuthGuard>,
});

interface Fila {
  codigo: string; sistema: string; periodo_desde: string; periodo_hasta: string; periodo_etiqueta: string | null;
  created_at: string; created_by_email: string | null; usuario_email: string | null; updated_at: string; updated_by_email: string | null;
  version: number; dictamen_global: string | null; estado: string;
}
const fecha = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
const periodo = (f: Fila) => f.periodo_etiqueta ?? `${f.periodo_desde} – ${f.periodo_hasta}`;
const estadoTxt = (e: string) => (e === "emitido" ? "Emitido" : "Borrador");
const TODOS = "__todos";

function RegistroATPage() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [anio, setAnio] = useState(TODOS);
  const [sistema, setSistema] = useState(TODOS);
  const [estado, setEstado] = useState(TODOS);

  useEffect(() => {
    supabase.from("registro_analisis_tendencias")
      .select("codigo,sistema,periodo_desde,periodo_hasta,periodo_etiqueta,created_at,created_by_email,usuario_email,updated_at,updated_by_email,version,dictamen_global,estado")
      .order("codigo", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(`No se pudo cargar el registro: ${error.message}`);
        setFilas((data ?? []) as Fila[]);
        setCargando(false);
      });
  }, []);

  const anios = useMemo(() => [...new Set(filas.map((f) => f.codigo.slice(3, 7)))].sort().reverse(), [filas]);
  const sistemas = useMemo(() => [...new Set(filas.map((f) => f.sistema))].sort(), [filas]);
  const visibles = filas.filter((f) =>
    (!q.trim() || f.codigo.includes(q.trim().toUpperCase())) &&
    (anio === TODOS || f.codigo.slice(3, 7) === anio) &&
    (sistema === TODOS || f.sistema === sistema) &&
    (estado === TODOS || f.estado === estado));

  const exportar = () => {
    const datos = visibles.map((f) => ({
      "Código AT": f.codigo, Sistema: f.sistema, Periodo: periodo(f),
      "Fecha de creación": fecha(f.created_at), "Creado por": f.created_by_email ?? f.usuario_email ?? "",
      "Última modificación": fecha(f.updated_at), "Modificado por": f.updated_by_email ?? "",
      Versión: f.version, "Dictamen global": f.dictamen_global ?? "", Estado: estadoTxt(f.estado),
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    ws["!cols"] = [14, 30, 22, 18, 30, 18, 30, 9, 40, 11].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "FOR-VAL-16-01");
    XLSX.writeFile(wb, `FOR-VAL-16-01_Registro_AT_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex flex-wrap gap-4">
          <Link to="/reporte" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ChevronLeft className="h-4 w-4" /> Reporte consolidado</Link>
          <Link to="/reporte/tendencias" className="text-sm text-primary hover:underline">Nuevo análisis de tendencias</Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Registro de análisis de tendencias (FOR-VAL-16-01)</h1>
            <p className="text-sm text-muted-foreground mt-1">Haz clic en un código para abrir el reporte tal como se guardó.</p>
          </div>
          <Button variant="outline" className="gap-1" onClick={exportar} disabled={!visibles.length}><FileSpreadsheet className="h-4 w-4" /> Exportar registro</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código AT…" className="w-48" />
          <Select value={anio} onValueChange={setAnio}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={TODOS}>Todos los años</SelectItem>{anios.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sistema} onValueChange={setSistema}>
            <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={TODOS}>Todos los sistemas</SelectItem>{sistemas.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los estados</SelectItem>
              <SelectItem value="borrador">Borrador</SelectItem>
              <SelectItem value="emitido">Emitido</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b border-border text-left">
              {["Código AT", "Sistema", "Periodo", "Fecha de creación", "Creado por", "Última modificación", "Versión", "Dictamen global", "Estado"].map((h) => <th key={h} className="p-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {cargando ? <tr><td colSpan={9} className="p-4 text-muted-foreground">Cargando…</td></tr>
                : !visibles.length ? <tr><td colSpan={9} className="p-4 text-muted-foreground">No hay reportes con estos filtros.</td></tr>
                : visibles.map((f) => (
                  <tr key={f.codigo} className="border-b border-border/60 align-top">
                    <td className="p-2">
                      <Link to="/reporte/tendencias" search={{ at: f.codigo }} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                        <FolderOpen className="h-3.5 w-3.5" />{f.codigo}
                      </Link>
                    </td>
                    <td className="p-2">{f.sistema}</td>
                    <td className="p-2 whitespace-nowrap">{periodo(f)}</td>
                    <td className="p-2 whitespace-nowrap">{fecha(f.created_at)}</td>
                    <td className="p-2">{f.created_by_email ?? f.usuario_email ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap">{fecha(f.updated_at)}<div className="text-xs text-muted-foreground">{f.updated_by_email ?? ""}</div></td>
                    <td className="p-2 text-center tabular-nums">{f.version}</td>
                    <td className="p-2 text-xs">{f.dictamen_global ?? "—"}</td>
                    <td className="p-2">
                      <span className={cn("rounded px-2 py-0.5 text-xs font-medium", f.estado === "emitido" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>{estadoTxt(f.estado)}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
