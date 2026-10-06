import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/auditoria")({
  component: AuditoriaPage,
});

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string | null;
  operation: "INSERT" | "UPDATE" | "DELETE";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_by_email: string | null;
  changed_at: string;
}

const TABLE_LABELS: Record<string, string> = {
  registros: "Registros",
  registro_semanas: "Lecturas semanales",
  sistemas_hvac: "Sistemas HVAC",
  areas_clasificadas: "Áreas clasificadas",
  instrumentos: "Instrumentos",
  objetivos_presion: "Objetivos de presión",
  user_roles: "Roles de usuario",
  registro_analisis_tendencias: "Registros AT (tendencias)",
};

const OPERATION_VARIANTS: Record<AuditEntry["operation"], { label: string; cls: string }> = {
  INSERT: { label: "Creado", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  UPDATE: { label: "Editado", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  DELETE: { label: "Eliminado", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

function AuditoriaPage() {
  return (
    <AuthGuard>
      <AuditoriaContent />
    </AuthGuard>
  );
}

function AuditoriaContent() {
  const { isSuperAdmin, hasRole, loading: authLoading } = useAuth();
  const canRead = isSuperAdmin || hasRole("admin");

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [opFilter, setOpFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error("No se pudo cargar la auditoría: " + error.message);
      setEntries([]);
    } else {
      setEntries((data ?? []) as AuditEntry[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (canRead) load();
  }, [canRead]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (tableFilter !== "all" && e.table_name !== tableFilter) return false;
      if (opFilter !== "all" && e.operation !== opFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${e.changed_by_email ?? ""} ${e.record_id ?? ""} ${e.table_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, tableFilter, opFilter, search]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Cargando…</div>;
  }

  if (!canRead) {
    return <Navigate to="/" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              Auditoría del sistema
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bitácora inmutable de cambios. Últimos 500 eventos.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Select value={tableFilter} onValueChange={setTableFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los módulos</SelectItem>
                  {Object.entries(TABLE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={opFilter} onValueChange={setOpFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Operación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las operaciones</SelectItem>
                  <SelectItem value="INSERT">Creado</SelectItem>
                  <SelectItem value="UPDATE">Editado</SelectItem>
                  <SelectItem value="DELETE">Eliminado</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Buscar por correo o ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              {filtered.length} evento{filtered.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Operación</TableHead>
                    <TableHead>ID afectado</TableHead>
                    <TableHead className="text-right">Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {loading ? "Cargando…" : "Sin eventos."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(e.changed_at).toLocaleString("es-MX")}
                        </TableCell>
                        <TableCell className="text-xs">
                          {e.changed_by_email ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {TABLE_LABELS[e.table_name] ?? e.table_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={OPERATION_VARIANTS[e.operation].cls}>
                            {OPERATION_VARIANTS[e.operation].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {e.record_id?.slice(0, 8) ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelected(e)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <HistorialAT />
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle del cambio</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Fecha</p>
                  <p>{new Date(selected.changed_at).toLocaleString("es-MX")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Usuario</p>
                  <p>{selected.changed_by_email ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Módulo</p>
                  <p>{TABLE_LABELS[selected.table_name] ?? selected.table_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Operación</p>
                  <Badge variant="secondary" className={OPERATION_VARIANTS[selected.operation].cls}>
                    {OPERATION_VARIANTS[selected.operation].label}
                  </Badge>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">ID del registro</p>
                  <p className="font-mono text-xs">{selected.record_id ?? "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Valor anterior</p>
                  <ScrollArea className="h-64 rounded border bg-muted/30 p-2">
                    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all">
                      {selected.old_data ? JSON.stringify(selected.old_data, null, 2) : "—"}
                    </pre>
                  </ScrollArea>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Valor nuevo</p>
                  <ScrollArea className="h-64 rounded border bg-muted/30 p-2">
                    <pre className="text-[10px] font-mono whitespace-pre-wrap break-all">
                      {selected.new_data ? JSON.stringify(selected.new_data, null, 2) : "—"}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface VersionAT {
  id: string; registro_id: string; codigo: string; version: number;
  datos: Record<string, unknown>; usuario_email: string | null; fecha: string;
}

function HistorialAT() {
  const [filas, setFilas] = useState<VersionAT[]>([]);
  const [q, setQ] = useState("");
  const [ver, setVer] = useState<VersionAT | null>(null);
  useEffect(() => {
    supabase.from("registro_analisis_tendencias_historial").select("*").order("fecha", { ascending: false }).limit(500)
      .then(({ data, error }) => { if (error) toast.error("No se pudo cargar el historial AT: " + error.message); else setFilas((data ?? []) as VersionAT[]); });
  }, []);
  const vis = filas.filter((f) => !q || `${f.codigo} ${f.usuario_email ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Historial de versiones · Registros AT ({vis.length})</CardTitle>
        <Input className="max-w-xs" placeholder="Buscar código AT o usuario…" value={q} onChange={(e) => setQ(e.target.value)} />
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead><TableHead>Versión anterior</TableHead><TableHead>Sustituida el</TableHead>
              <TableHead>Modificó</TableHead><TableHead>Sistema · periodo</TableHead><TableHead className="text-right">Ver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vis.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Sin versiones anteriores.</TableCell></TableRow>
            ) : vis.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.codigo}</TableCell>
                <TableCell>v{f.version}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{new Date(f.fecha).toLocaleString("es-MX")}</TableCell>
                <TableCell className="text-xs">{f.usuario_email ?? "—"}</TableCell>
                <TableCell className="text-xs">{String(f.datos.sistema ?? "")} · {String(f.datos.periodo_etiqueta ?? "")}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setVer(f)}><Eye className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={!!ver} onOpenChange={(o) => !o && setVer(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{ver?.codigo} · versión {ver?.version}</DialogTitle></DialogHeader>
          {ver && (
            <ScrollArea className="h-96 rounded border bg-muted/30 p-2">
              <pre className="text-[10px] font-mono whitespace-pre-wrap break-all">{JSON.stringify(ver.datos, null, 2)}</pre>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
