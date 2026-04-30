import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronLeft, Plus, Pencil, Power, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AreaClasificada, Instrumento, IsoClase, SistemaHVAC,
  ISO_LIMIT_PA, ISO_CLASES,
  listAreas, listInstrumentos, listSistemasHVAC,
  setAreaActivo, setInstrumentoActivo, setSistemaHVACActivo,
  upsertArea, upsertInstrumento, upsertSistemaHVAC,
} from "@/lib/catalogos";
import {
  ObjetivoPresion, TipoObjetivoPresion, listObjetivosPresion,
  upsertObjetivoPresion, setObjetivoPresionActivo,
  TIPO_OBJETIVO_LABEL, describirLimite,
} from "@/lib/objetivos-presion";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración / Catálogos — DIAFRA" },
      { name: "description", content: "Catálogos de sistemas HVAC, áreas, instrumentos y pares de cuartos." },
    ],
  }),
  component: () => <AuthGuard><ConfiguracionPage /></AuthGuard>,
});

const ISO_OPTIONS: IsoClase[] = ISO_CLASES;

function ConfiguracionPage() {
  const { canWriteCatalogs } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-3">
          <ChevronLeft className="h-4 w-4" /> Tablero
        </Link>
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Configuración / Catálogos</h1>
            <p className="text-sm text-muted-foreground">
              Mantén los códigos maestros del sistema. Dar de baja conserva el historial — el código solo desaparece de los selectores.
            </p>
          </div>
        </div>
        {!canWriteCatalogs && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Estás en modo solo lectura. Solo <strong>super_admin</strong> y <strong>admin</strong> pueden modificar catálogos.
          </div>
        )}

        <Tabs defaultValue="hvac" className="w-full">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="hvac">Sistemas HVAC</TabsTrigger>
            <TabsTrigger value="areas">Áreas</TabsTrigger>
            <TabsTrigger value="instr">Instrumentos</TabsTrigger>
            <TabsTrigger value="pares">Objetivos de presión</TabsTrigger>
          </TabsList>

          <TabsContent value="hvac" className="mt-6"><HVACTab /></TabsContent>
          <TabsContent value="areas" className="mt-6"><AreasTab /></TabsContent>
          <TabsContent value="instr" className="mt-6"><InstrumentosTab /></TabsContent>
          <TabsContent value="pares" className="mt-6"><ObjetivosTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/* ============================ HVAC ============================ */
function HVACTab() {
  const [items, setItems] = useState<SistemaHVAC[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SistemaHVAC | null>(null);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    setLoading(true);
    try { setItems(await listSistemasHVAC(false)); }
    catch (e) { toast.error("Error cargando: " + (e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const onToggle = async (it: SistemaHVAC) => {
    if (it.activo && !confirm(`¿Dar de baja ${it.codigo}? Los datos históricos se conservan, pero el código dejará de aparecer en los selectores.`)) return;
    try { await setSistemaHVACActivo(it.id, !it.activo); reload(); toast.success("Estado actualizado"); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <CatalogShell
      title="Sistemas HVAC"
      onAdd={() => { setEditing(null); setOpen(true); }}
      loading={loading}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>UMA</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Etapas</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.id} className={!it.activo ? "opacity-50" : ""}>
              <TableCell className="font-mono">{it.codigo}</TableCell>
              <TableCell>{it.nombre_uma}</TableCell>
              <TableCell>{it.descripcion}</TableCell>
              <TableCell className="text-xs">{it.etapas.join(", ")}</TableCell>
              <TableCell>
                <span className={`text-xs rounded-full px-2 py-0.5 ${it.activo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {it.activo ? "activo" : "inactivo"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onToggle(it)}>
                  <Power className={`h-3.5 w-3.5 ${it.activo ? "text-destructive" : "text-success"}`} />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <HVACDialog open={open} onOpenChange={setOpen} item={editing} onSaved={() => { setOpen(false); reload(); }} />
    </CatalogShell>
  );
}

function HVACDialog({ open, onOpenChange, item, onSaved }: {
  open: boolean; onOpenChange: (b: boolean) => void; item: SistemaHVAC | null; onSaved: () => void;
}) {
  const [form, setForm] = useState({ codigo: "", nombre_uma: "", descripcion: "", etapas: "" });
  useEffect(() => {
    setForm({
      codigo: item?.codigo ?? "",
      nombre_uma: item?.nombre_uma ?? "",
      descripcion: item?.descripcion ?? "",
      etapas: item?.etapas?.join(", ") ?? "",
    });
  }, [item, open]);

  const save = async () => {
    if (!form.codigo.trim()) { toast.error("Código requerido"); return; }
    try {
      await upsertSistemaHVAC({
        id: item?.id,
        codigo: form.codigo.trim(),
        nombre_uma: form.nombre_uma.trim(),
        descripcion: form.descripcion.trim(),
        etapas: form.etapas.split(",").map((s) => s.trim()).filter(Boolean),
      });
      toast.success("Guardado");
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? "Editar" : "Nuevo"} sistema HVAC</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Código"><Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="EQU-PRO-16" /></Field>
          <Field label="Nombre UMA"><Input value={form.nombre_uma} onChange={(e) => setForm({ ...form, nombre_uma: e.target.value })} placeholder="UMA-01" /></Field>
          <Field label="Descripción del área"><Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></Field>
          <Field label="Etapas (separadas por coma)"><Input value={form.etapas} onChange={(e) => setForm({ ...form, etapas: e.target.value })} placeholder="35%, 65%, 95%" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ Áreas ============================ */
function AreasTab() {
  const [items, setItems] = useState<AreaClasificada[]>([]);
  const [hvacs, setHvacs] = useState<SistemaHVAC[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AreaClasificada | null>(null);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [as, hs] = await Promise.all([listAreas(false), listSistemasHVAC(false)]);
      setItems(as); setHvacs(hs);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const hvacName = (id: string | null) => hvacs.find((h) => h.id === id)?.codigo ?? "—";

  const onToggle = async (it: AreaClasificada) => {
    if (it.activo && !confirm(`¿Dar de baja ${it.codigo}? Los datos históricos se conservan.`)) return;
    try { await setAreaActivo(it.id, !it.activo); reload(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <CatalogShell title="Áreas clasificadas" onAdd={() => { setEditing(null); setOpen(true); }} loading={loading}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>ISO</TableHead>
            <TableHead>HVAC asociado</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.id} className={!it.activo ? "opacity-50" : ""}>
              <TableCell className="font-mono">{it.codigo}</TableCell>
              <TableCell>{it.nombre}</TableCell>
              <TableCell className="text-xs">{it.iso}</TableCell>
              <TableCell className="text-xs font-mono">{hvacName(it.hvac_id)}</TableCell>
              <TableCell>
                <span className={`text-xs rounded-full px-2 py-0.5 ${it.activo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {it.activo ? "activo" : "inactivo"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => onToggle(it)}><Power className={`h-3.5 w-3.5 ${it.activo ? "text-destructive" : "text-success"}`} /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AreaDialog open={open} onOpenChange={setOpen} item={editing} hvacs={hvacs} onSaved={() => { setOpen(false); reload(); }} />
    </CatalogShell>
  );
}

function AreaDialog({ open, onOpenChange, item, hvacs, onSaved }: {
  open: boolean; onOpenChange: (b: boolean) => void; item: AreaClasificada | null; hvacs: SistemaHVAC[]; onSaved: () => void;
}) {
  const [form, setForm] = useState({ codigo: "", nombre: "", iso: "ISO-8" as IsoClase, hvac_id: "" });
  useEffect(() => {
    setForm({
      codigo: item?.codigo ?? "",
      nombre: item?.nombre ?? "",
      iso: (item?.iso ?? "ISO-8") as IsoClase,
      hvac_id: item?.hvac_id ?? "",
    });
  }, [item, open]);

  const save = async () => {
    if (!form.codigo.trim() || !form.nombre.trim()) { toast.error("Código y nombre requeridos"); return; }
    try {
      await upsertArea({
        id: item?.id, codigo: form.codigo.trim(), nombre: form.nombre.trim(), iso: form.iso,
        hvac_id: form.hvac_id || null,
      });
      toast.success("Guardado"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? "Editar" : "Nueva"} área clasificada</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Código"><Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="DCC-03" /></Field>
          <Field label="Nombre"><Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Siembras I" /></Field>
          <Field label="Clasificación ISO">
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.iso} onChange={(e) => setForm({ ...form, iso: e.target.value as IsoClase })}>
              {ISO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Sistema HVAC asociado">
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.hvac_id} onChange={(e) => setForm({ ...form, hvac_id: e.target.value })}>
              <option value="">— ninguno —</option>
              {hvacs.filter((h) => h.activo || h.id === item?.hvac_id).map((h) => (
                <option key={h.id} value={h.id}>{h.codigo} — {h.descripcion}</option>
              ))}
            </select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ Instrumentos ============================ */
const TIPO_LABEL = {
  termohigrometro: "Termohigrómetro",
  manometro_filtro: "Manómetro filtro",
  manometro_diferencial: "Manómetro diferencial",
  otro: "Otro",
} as const;

function InstrumentosTab() {
  const [items, setItems] = useState<Instrumento[]>([]);
  const [areas, setAreas] = useState<AreaClasificada[]>([]);
  const [objetivos, setObjetivos] = useState<ObjetivoPresion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Instrumento | null>(null);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [is, as, os] = await Promise.all([
        listInstrumentos(),
        listAreas(false),
        listObjetivosPresion(false),
      ]);
      setItems(is); setAreas(as); setObjetivos(os);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const areaCodigo = (id: string | null) => (id ? areas.find((a) => a.id === id)?.codigo ?? "?" : "?");

  const labelObjetivo = (o: ObjetivoPresion): string => {
    if (o.tipo === "par_cuartos") return `${areaCodigo(o.cuarto_x_id)} vs ${areaCodigo(o.cuarto_y_id)}`;
    if (o.tipo === "equipo") return `${o.equipo_codigo ?? o.codigo} — ${o.nombre}`;
    return `${o.codigo}${o.etapa ? ` · ${o.etapa}` : ""}`;
  };

  const objetivosDe = (i: Instrumento) => objetivos.filter((o) => o.instrumento_id === i.id);

  const areaName = (i: Instrumento) => {
    if (i.area_id) {
      const a = areas.find((x) => x.id === i.area_id);
      return a ? `${a.codigo} ${a.nombre}` : "—";
    }
    return i.area_libre ?? "—";
  };

  const onToggle = async (it: Instrumento) => {
    if (it.activo && !confirm(`¿Dar de baja ${it.codigo}? Los datos históricos se conservan.`)) return;
    try { await setInstrumentoActivo(it.id, !it.activo); reload(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <CatalogShell title="Instrumentos" onAdd={() => { setEditing(null); setOpen(true); }} loading={loading}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Área asignada</TableHead>
            <TableHead>Asignado a (objetivos de presión)</TableHead>
            <TableHead>Parámetro</TableHead>
            <TableHead>Especificación</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => {
            const objs = objetivosDe(it);
            return (
              <TableRow key={it.id} className={!it.activo ? "opacity-50" : ""}>
                <TableCell className="font-mono">{it.codigo}</TableCell>
                <TableCell className="text-xs">{TIPO_LABEL[it.tipo]}</TableCell>
                <TableCell className="text-xs">{areaName(it)}</TableCell>
                <TableCell className="text-xs">
                  {objs.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {objs.map((o) => (
                        <span
                          key={o.id}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${o.activo ? "bg-muted" : "bg-muted/50 line-through"}`}
                          title={`${TIPO_OBJETIVO_LABEL[o.tipo]}${o.activo ? "" : " (inactivo)"}`}
                        >
                          {labelObjetivo(o)}
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs">{it.parametro}</TableCell>
                <TableCell className="text-xs">{it.especificacion ?? "—"}</TableCell>
                <TableCell>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${it.activo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                    {it.activo ? "activo" : "inactivo"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => onToggle(it)}><Power className={`h-3.5 w-3.5 ${it.activo ? "text-destructive" : "text-success"}`} /></Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <InstrumentoDialog
        open={open}
        onOpenChange={setOpen}
        item={editing}
        areas={areas}
        objetivosAsignados={editing ? objetivosDe(editing) : []}
        labelObjetivo={labelObjetivo}
        onSaved={() => { setOpen(false); reload(); }}
      />
    </CatalogShell>
  );
}

function InstrumentoDialog({ open, onOpenChange, item, areas, objetivosAsignados, labelObjetivo, onSaved }: {
  open: boolean; onOpenChange: (b: boolean) => void; item: Instrumento | null; areas: AreaClasificada[];
  objetivosAsignados: ObjetivoPresion[]; labelObjetivo: (o: ObjetivoPresion) => string; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    codigo: "", tipo: "termohigrometro" as Instrumento["tipo"],
    area_id: "", area_libre: "", parametro: "", especificacion: "",
  });
  useEffect(() => {
    setForm({
      codigo: item?.codigo ?? "", tipo: item?.tipo ?? "termohigrometro",
      area_id: item?.area_id ?? "", area_libre: item?.area_libre ?? "",
      parametro: item?.parametro ?? "", especificacion: item?.especificacion ?? "",
    });
  }, [item, open]);

  const save = async () => {
    if (!form.codigo.trim()) { toast.error("Código requerido"); return; }
    try {
      await upsertInstrumento({
        id: item?.id, codigo: form.codigo.trim(), tipo: form.tipo,
        area_id: form.area_id || null, area_libre: form.area_libre.trim() || null,
        parametro: form.parametro.trim(), especificacion: form.especificacion.trim() || null,
      });
      toast.success("Guardado"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? "Editar" : "Nuevo"} instrumento</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Código"><Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="INS-CMB-20" /></Field>
          <Field label="Tipo">
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Instrumento["tipo"] })}>
              {(Object.keys(TIPO_LABEL) as (keyof typeof TIPO_LABEL)[]).map((k) => (
                <option key={k} value={k}>{TIPO_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="Área asignada (catálogo)">
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.area_id} onChange={(e) => setForm({ ...form, area_id: e.target.value })}>
              <option value="">— ninguna del catálogo —</option>
              {areas.filter((a) => a.activo || a.id === item?.area_id).map((a) => (
                <option key={a.id} value={a.id}>{a.codigo} — {a.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="Área (texto libre, alternativo)">
            <Input value={form.area_libre} onChange={(e) => setForm({ ...form, area_libre: e.target.value })} placeholder="EQU-CMB-08 etapa 35% / Sistema agua / etc." />
          </Field>
          <Field label="Parámetro que mide"><Input value={form.parametro} onChange={(e) => setForm({ ...form, parametro: e.target.value })} placeholder="T °C y HR %" /></Field>
          <Field label="Especificación"><Input value={form.especificacion} onChange={(e) => setForm({ ...form, especificacion: e.target.value })} placeholder="18–25°C / ≥10 Pa" /></Field>

          {item && (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                Asignación a pares de cuartos / equipos / filtros HEPA
              </p>
              {objetivosAsignados.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Este instrumento no está vinculado a ningún objetivo de presión todavía.
                  Vincúlalo desde la pestaña <span className="font-medium">Pares de cuartos</span> (próximamente Equipos / Filtros)
                  seleccionando este código en el campo "Instrumento".
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1">
                    {objetivosAsignados.map((o) => (
                      <span key={o.id} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${o.activo ? "bg-background border border-border" : "bg-muted/50 line-through"}`}>
                        {labelObjetivo(o)}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Para cambiar estas asignaciones, edita el objetivo desde su pestaña correspondiente.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ Objetivos de presión (par / equipo / filtro) ============================ */
function ObjetivosTab() {
  const [items, setItems] = useState<ObjetivoPresion[]>([]);
  const [areas, setAreas] = useState<AreaClasificada[]>([]);
  const [instrs, setInstrs] = useState<Instrumento[]>([]);
  const [hvacs, setHvacs] = useState<SistemaHVAC[]>([]);
  const [filtro, setFiltro] = useState<TipoObjetivoPresion | "todos">("todos");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ObjetivoPresion | null>(null);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [os, as, is, hs] = await Promise.all([
        listObjetivosPresion(false),
        listAreas(false),
        listInstrumentos(),
        listSistemasHVAC(false),
      ]);
      setItems(os); setAreas(as); setInstrs(is); setHvacs(hs);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const areaCode = (id: string | null) => areas.find((a) => a.id === id)?.codigo ?? "—";
  const instrCode = (id: string | null) => instrs.find((i) => i.id === id)?.codigo ?? "—";
  const hvacCode = (id: string | null) => hvacs.find((h) => h.id === id)?.codigo ?? "—";

  const onToggle = async (it: ObjetivoPresion) => {
    if (it.activo && !confirm(`¿Dar de baja "${it.codigo}"? Los datos históricos se conservan.`)) return;
    try { await setObjetivoPresionActivo(it.id, !it.activo); reload(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const visibles = items.filter((o) => filtro === "todos" || o.tipo === filtro);

  const descripcion = (o: ObjetivoPresion) => {
    if (o.tipo === "par_cuartos") return `${areaCode(o.cuarto_x_id)} ▸ ${areaCode(o.cuarto_y_id)}`;
    if (o.tipo === "equipo") return o.equipo_codigo ?? "—";
    return `${hvacCode(o.hvac_id)} · ${o.etapa ?? "—"}`;
  };

  return (
    <CatalogShell title="Objetivos de presión (pares · equipos · filtros HEPA)" onAdd={() => { setEditing(null); setOpen(true); }} loading={loading}>
      <div className="px-5 pt-3 flex flex-wrap gap-1">
        {(["todos", "par_cuartos", "equipo", "filtro_hepa"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFiltro(t)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              filtro === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {t === "todos" ? "Todos" : TIPO_OBJETIVO_LABEL[t]}
          </button>
        ))}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Nombre / Descripción</TableHead>
            <TableHead>Instrumento</TableHead>
            <TableHead>Límite</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibles.map((it) => (
            <TableRow key={it.id} className={!it.activo ? "opacity-50" : ""}>
              <TableCell className="text-[11px]">{TIPO_OBJETIVO_LABEL[it.tipo]}</TableCell>
              <TableCell className="text-xs font-mono">{it.codigo}</TableCell>
              <TableCell className="text-xs">
                <div className="font-medium">{it.nombre}</div>
                <div className="text-muted-foreground text-[11px]">{descripcion(it)}</div>
              </TableCell>
              <TableCell className="text-xs font-mono">{instrCode(it.instrumento_id)}</TableCell>
              <TableCell className="text-xs">{describirLimite(it)}</TableCell>
              <TableCell>
                <span className={`text-xs rounded-full px-2 py-0.5 ${it.activo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {it.activo ? "activo" : "inactivo"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => onToggle(it)}><Power className={`h-3.5 w-3.5 ${it.activo ? "text-destructive" : "text-success"}`} /></Button>
              </TableCell>
            </TableRow>
          ))}
          {visibles.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">Sin objetivos para este filtro.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <ObjetivoDialog
        open={open} onOpenChange={setOpen} item={editing}
        areas={areas} instrs={instrs} hvacs={hvacs}
        onSaved={() => { setOpen(false); reload(); }}
      />
    </CatalogShell>
  );
}

function ObjetivoDialog({ open, onOpenChange, item, areas, instrs, hvacs, onSaved }: {
  open: boolean; onOpenChange: (b: boolean) => void; item: ObjetivoPresion | null;
  areas: AreaClasificada[]; instrs: Instrumento[]; hvacs: SistemaHVAC[]; onSaved: () => void;
}) {
  const emptyForm = {
    tipo: "par_cuartos" as TipoObjetivoPresion,
    codigo: "", nombre: "",
    instrumento_id: "",
    // par
    cuarto_x_id: "", cuarto_y_id: "",
    iso: "ISO-8" as IsoClase,
    limite_normativo_pa: 5,
    isoOverride: false,
    // equipo
    equipo_codigo: "",
    // filtro
    hvac_id: "", etapa: "",
    // límites equipo/filtro
    lie_pa: "" as string | number,
    lse_pa: "" as string | number,
    baseline_pa: "" as string | number,
    baseline_tolerancia_pct: 25 as string | number,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        tipo: item.tipo,
        codigo: item.codigo, nombre: item.nombre,
        instrumento_id: item.instrumento_id ?? "",
        cuarto_x_id: item.cuarto_x_id ?? "",
        cuarto_y_id: item.cuarto_y_id ?? "",
        iso: (item.iso ?? "ISO-8") as IsoClase,
        limite_normativo_pa: item.limite_normativo_pa ?? 5,
        isoOverride: true,
        equipo_codigo: item.equipo_codigo ?? "",
        hvac_id: item.hvac_id ?? "",
        etapa: item.etapa ?? "",
        lie_pa: item.lie_pa ?? "",
        lse_pa: item.lse_pa ?? "",
        baseline_pa: item.baseline_pa ?? "",
        baseline_tolerancia_pct: item.baseline_tolerancia_pct ?? 25,
      });
    } else {
      setForm(emptyForm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, open]);

  // Auto: ISO + límite por cuarto X (par_cuartos)
  useEffect(() => {
    if (form.tipo !== "par_cuartos") return;
    if (!form.cuarto_x_id || form.isoOverride) return;
    const x = areas.find((a) => a.id === form.cuarto_x_id);
    if (x) setForm((f) => ({ ...f, iso: x.iso, limite_normativo_pa: ISO_LIMIT_PA[x.iso] }));
  }, [form.cuarto_x_id, form.isoOverride, form.tipo, areas]);

  // Auto: nombre por defecto para par
  useEffect(() => {
    if (form.tipo !== "par_cuartos" || item) return;
    if (form.cuarto_x_id && form.cuarto_y_id) {
      const x = areas.find((a) => a.id === form.cuarto_x_id)?.codigo ?? "";
      const y = areas.find((a) => a.id === form.cuarto_y_id)?.codigo ?? "";
      const auto = `${x} vs ${y}`;
      setForm((f) => (f.nombre === "" || f.nombre === f.codigo ? { ...f, nombre: auto, codigo: auto } : f));
    }
  }, [form.cuarto_x_id, form.cuarto_y_id, form.tipo, item, areas]);

  const hvacEtapas = hvacs.find((h) => h.id === form.hvac_id)?.etapas ?? [];

  const num = (v: string | number) => v === "" ? null : Number(v);

  const save = async () => {
    if (!form.codigo.trim()) { toast.error("Código requerido"); return; }
    if (!form.nombre.trim()) { toast.error("Nombre requerido"); return; }
    try {
      const base = {
        id: item?.id,
        tipo: form.tipo,
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        instrumento_id: form.instrumento_id || null,
        unidad: "Pa",
      };
      if (form.tipo === "par_cuartos") {
        await upsertObjetivoPresion({
          ...base,
          cuarto_x_id: form.cuarto_x_id || null,
          cuarto_y_id: form.cuarto_y_id || null,
          iso: form.iso,
          limite_normativo_pa: Number(form.limite_normativo_pa) || 0,
          hvac_id: null, etapa: null, equipo_codigo: null,
          lie_pa: null, lse_pa: null, baseline_pa: null, baseline_tolerancia_pct: null,
        });
      } else if (form.tipo === "equipo") {
        await upsertObjetivoPresion({
          ...base,
          equipo_codigo: form.equipo_codigo.trim() || form.codigo.trim(),
          lie_pa: num(form.lie_pa), lse_pa: num(form.lse_pa),
          cuarto_x_id: null, cuarto_y_id: null, iso: null,
          limite_normativo_pa: null, hvac_id: null, etapa: null,
          baseline_pa: null, baseline_tolerancia_pct: null,
        });
      } else {
        await upsertObjetivoPresion({
          ...base,
          hvac_id: form.hvac_id || null,
          etapa: form.etapa || null,
          lie_pa: num(form.lie_pa), lse_pa: num(form.lse_pa),
          baseline_pa: num(form.baseline_pa),
          baseline_tolerancia_pct: num(form.baseline_tolerancia_pct),
          cuarto_x_id: null, cuarto_y_id: null, iso: null,
          limite_normativo_pa: null, equipo_codigo: null,
        });
      }
      toast.success("Guardado"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
  };

  const tipoBtn = (t: TipoObjetivoPresion) => (
    <button
      key={t}
      type="button"
      disabled={!!item}
      onClick={() => setForm({ ...form, tipo: t, isoOverride: false })}
      className={`text-[11px] py-1.5 rounded transition-colors ${
        form.tipo === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      } ${item ? "cursor-not-allowed opacity-60" : ""}`}
    >
      {TIPO_OBJETIVO_LABEL[t]}
    </button>
  );

  // Filtro de instrumentos según tipo
  const instrsRelevantes = instrs.filter((i) => {
    if (!i.activo && i.id !== item?.instrumento_id) return false;
    if (form.tipo === "par_cuartos") return i.tipo === "manometro_diferencial" || i.tipo === "otro";
    if (form.tipo === "equipo") return i.tipo === "manometro_diferencial" || i.tipo === "manometro_filtro" || i.tipo === "otro";
    return i.tipo === "manometro_filtro" || i.tipo === "manometro_diferencial" || i.tipo === "otro";
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{item ? "Editar" : "Nuevo"} objetivo de presión</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Tipo de objetivo">
            <div className="grid grid-cols-3 gap-1 rounded-md border border-input bg-background p-1">
              {tipoBtn("par_cuartos")}
              {tipoBtn("equipo")}
              {tipoBtn("filtro_hepa")}
            </div>
            {item && <p className="text-[11px] text-muted-foreground mt-1">El tipo no se puede cambiar al editar.</p>}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Código">
              <Input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder={form.tipo === "par_cuartos" ? "DCC-03 vs DCC-02" : form.tipo === "equipo" ? "UMA-01-DP" : "HEPA-01-35%"} />
            </Field>
            <Field label="Nombre / etiqueta">
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Descripción legible" />
            </Field>
          </div>

          <Field label="Instrumento">
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.instrumento_id} onChange={(e) => setForm({ ...form, instrumento_id: e.target.value })}>
              <option value="">— ninguno —</option>
              {instrsRelevantes.map((i) => (
                <option key={i.id} value={i.id}>{i.codigo} · {i.tipo}</option>
              ))}
            </select>
          </Field>

          {/* ===== Modo: Par de cuartos ===== */}
          {form.tipo === "par_cuartos" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cuarto X (mayor presión)">
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.cuarto_x_id}
                    onChange={(e) => setForm({ ...form, cuarto_x_id: e.target.value, isoOverride: false })}>
                    <option value="">—</option>
                    {areas.filter((a) => a.activo || a.id === item?.cuarto_x_id).map((a) => <option key={a.id} value={a.id}>{a.codigo} {a.nombre}</option>)}
                  </select>
                </Field>
                <Field label="Cuarto Y (menor presión)">
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.cuarto_y_id} onChange={(e) => setForm({ ...form, cuarto_y_id: e.target.value })}>
                    <option value="">—</option>
                    {areas.filter((a) => a.activo || a.id === item?.cuarto_y_id).map((a) => <option key={a.id} value={a.id}>{a.codigo} {a.nombre}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="ISO aplicable (heredada de X)">
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.iso}
                    onChange={(e) => {
                      const iso = e.target.value as IsoClase;
                      setForm({ ...form, iso, limite_normativo_pa: ISO_LIMIT_PA[iso], isoOverride: true });
                    }}>
                    {ISO_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Límite normativo ΔP (Pa)">
                  <Input type="number" value={form.limite_normativo_pa}
                    onChange={(e) => setForm({ ...form, limite_normativo_pa: Number(e.target.value), isoOverride: true })} />
                </Field>
              </div>
            </>
          )}

          {/* ===== Modo: Equipo ===== */}
          {form.tipo === "equipo" && (
            <>
              <Field label="Código del equipo (opcional)">
                <Input value={form.equipo_codigo}
                  onChange={(e) => setForm({ ...form, equipo_codigo: e.target.value })}
                  placeholder="UMA-01 / TANQUE-A / etc." />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="LIE ΔP (Pa) — opcional">
                  <Input type="number" value={form.lie_pa}
                    onChange={(e) => setForm({ ...form, lie_pa: e.target.value })} placeholder="ej. -50" />
                </Field>
                <Field label="LSE ΔP (Pa) — opcional">
                  <Input type="number" value={form.lse_pa}
                    onChange={(e) => setForm({ ...form, lse_pa: e.target.value })} placeholder="ej. 50" />
                </Field>
              </div>
            </>
          )}

          {/* ===== Modo: Filtro HEPA ===== */}
          {form.tipo === "filtro_hepa" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sistema HVAC">
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.hvac_id} onChange={(e) => setForm({ ...form, hvac_id: e.target.value, etapa: "" })}>
                    <option value="">—</option>
                    {hvacs.filter((h) => h.activo || h.id === item?.hvac_id).map((h) => (
                      <option key={h.id} value={h.id}>{h.codigo} · {h.nombre_uma}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Etapa de filtración">
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.etapa} onChange={(e) => setForm({ ...form, etapa: e.target.value })}>
                    <option value="">—</option>
                    {hvacEtapas.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="LIE ΔP (Pa) — opcional">
                  <Input type="number" value={form.lie_pa}
                    onChange={(e) => setForm({ ...form, lie_pa: e.target.value })} placeholder="ej. 50" />
                </Field>
                <Field label="LSE ΔP (Pa) — opcional">
                  <Input type="number" value={form.lse_pa}
                    onChange={(e) => setForm({ ...form, lse_pa: e.target.value })} placeholder="ej. 250" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Baseline ΔP (Pa)">
                  <Input type="number" value={form.baseline_pa}
                    onChange={(e) => setForm({ ...form, baseline_pa: e.target.value })} placeholder="lectura inicial" />
                </Field>
                <Field label="Tolerancia baseline (%)">
                  <Input type="number" value={form.baseline_tolerancia_pct}
                    onChange={(e) => setForm({ ...form, baseline_tolerancia_pct: e.target.value })} placeholder="25" />
                </Field>
              </div>
              <p className="text-[11px] text-muted-foreground">
                La alerta de tendencia se dispara si la lectura se desvía más de la tolerancia respecto al baseline.
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ Helpers ============================ */
function CatalogShell({ title, onAdd, loading, children }: { title: string; onAdd: () => void; loading: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button size="sm" onClick={onAdd} className="gap-1"><Plus className="h-4 w-4" /> Nuevo</Button>
      </div>
      {loading ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
