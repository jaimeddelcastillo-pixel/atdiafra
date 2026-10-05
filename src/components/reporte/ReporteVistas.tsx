import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { analizarRegistro, type Periodo } from "@/lib/normativo";
import { exportarNormativoPDF, exportarNormativoExcel } from "@/lib/export-normativo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Instrumento, AreaClasificada } from "@/lib/catalogos";
import {
  lunesDe, lecturasCapturadas, lecturasEsperadas, esSemanaCompleta,
  type Registro, type Semana, type PuntoLectura,
} from "@/lib/semanas";

type AreaFn = (r: Registro) => { key: string; etiqueta: string; sinArea: boolean };
interface Props {
  registros: Registro[];
  areaDe: AreaFn;
  instrMap: Map<string, Instrumento>;
  /** Catálogo completo de instrumentos: se listan aunque no tengan capturas. */
  catalogo: Instrumento[];
  areasMap: Map<string, AreaClasificada>;
  desde: Date;
  hasta: Date;
}

/** Módulo probable según el tipo de instrumento del catálogo. */
const MODULO_POR_TIPO: Record<string, string> = {
  termohigrometro: "temphr",
  manometro_diferencial: "presiones",
  manometro_filtro: "filtros",
  otro: "presiones",
};

const MODULO_LABEL: Record<string, string> = {
  temphr: "Temp. y HR", presiones: "Presiones", filtros: "Filtros", agua: "Agua",
};
const MODULO_SLUG: Record<string, string> = {
  temphr: "temperatura-humedad", presiones: "presiones", filtros: "filtros", agua: "agua-purificada",
};
const TIPO_LABEL: Record<string, string> = {
  termohigrometro: "Termohigrómetro", manometro_diferencial: "Manómetro diferencial",
  manometro_filtro: "Manómetro de filtro", otro: "Otro",
};

interface Fila {
  key: string;
  registro: Registro; // registro principal (para editar)
  codigo: string;
  nombre: string;
  tipo: string;
  modulo: string;
  area: string;
  sinArea: boolean;
  /** true si el instrumento existe en catálogo pero aún no tiene ninguna captura */
  sinDatos: boolean;
  semanas: Map<string, Semana>;
}

function fueraDeLimites(r: Registro, s: Semana, ins?: Instrumento): number {
  const cuenta = (arr: PuntoLectura[] | undefined, lie?: number | null, lse?: number | null) =>
    (arr ?? []).filter((p) => !p._na && p.valor != null && Number.isFinite(p.valor) &&
      ((lie != null && p.valor < lie) || (lse != null && p.valor > lse))).length;
  if (r.modulo === "temphr") return cuenta(s.lecturas, r.lie_t, r.lse_t) + cuenta(s.lecturas_hr, r.lie_hr, r.lse_hr);
  return cuenta(s.lecturas, r.lie ?? ins?.lie_pa, r.lse ?? ins?.lse_pa);
}

function construirFilas(
  registros: Registro[], areaDe: AreaFn, instrMap: Map<string, Instrumento>,
  catalogo: Instrumento[] = [], areasMap: Map<string, AreaClasificada> = new Map(),
): Fila[] {
  const m = new Map<string, Fila>();
  for (const r of registros) {
    const key = `${r.modulo}|${r.instrumento_id ?? r.par_cuartos_id ?? r.hvac_id ?? r.id}|${r.par_cuartos_id ?? ""}`;
    let f = m.get(key);
    if (!f) {
      const ins = r.instrumento_id ? instrMap.get(r.instrumento_id) : undefined;
      const a = areaDe(r);
      f = {
        key, registro: r, codigo: ins?.codigo ?? "—", nombre: r.nombre,
        tipo: ins ? TIPO_LABEL[ins.tipo] ?? ins.tipo : "—",
        modulo: r.modulo, area: a.etiqueta, sinArea: a.sinArea, sinDatos: false, semanas: new Map(),
      };
      m.set(key, f);
    } else if (r.created_at < f.registro.created_at) f.registro = r;
    for (const s of r.semanas) {
      const prev = f.semanas.get(s.semana_inicio);
      if (!prev || (s.saved_at ?? "") > (prev.saved_at ?? "")) f.semanas.set(s.semana_inicio, s);
    }
  }
  // Agregar instrumentos del catálogo que aún no tienen ninguna captura,
  // para que se vea qué falta por capturar.
  const conDatos = new Set(
    registros.map((r) => r.instrumento_id).filter((x): x is string => !!x),
  );
  for (const ins of catalogo) {
    if (!ins.activo || conDatos.has(ins.id)) continue;
    const a = ins.area_id ? areasMap.get(ins.area_id) : undefined;
    const etiqueta = a ? `${a.codigo} · ${a.nombre}` : ins.area_libre ?? "Instrumento sin área asignada";
    const modulo = MODULO_POR_TIPO[ins.tipo] ?? "presiones";
    m.set(`catalogo|${ins.id}`, {
      key: `catalogo|${ins.id}`,
      registro: { id: "", modulo, semanas: [], created_at: "" } as unknown as Registro,
      codigo: ins.codigo,
      nombre: ins.parametro,
      tipo: TIPO_LABEL[ins.tipo] ?? ins.tipo,
      modulo,
      area: etiqueta,
      sinArea: !a && !ins.area_libre,
      sinDatos: true,
      semanas: new Map(),
    });
  }
  return Array.from(m.values()).sort((a, b) =>
    Number(a.sinDatos) - Number(b.sinDatos) ||
    a.codigo.localeCompare(b.codigo) || a.nombre.localeCompare(b.nombre));
}

function lunesDelPeriodo(desde: Date, hasta: Date): string[] {
  const out: string[] = [];
  const d = new Date(lunesDe(desde) + "T00:00:00");
  const fin = format(hasta, "yyyy-MM-dd");
  while (format(d, "yyyy-MM-dd") <= fin && out.length < 60) {
    out.push(format(d, "yyyy-MM-dd"));
    d.setDate(d.getDate() + 7);
  }
  return out;
}

type Estado = "completa" | "parcial" | "vacia" | "fuera";
function estadoSemana(f: Fila, lunes: string, instrMap: Map<string, Instrumento>) {
  const s = f.semanas.get(lunes);
  const esTHR = f.modulo === "temphr";
  if (!s) return { estado: "vacia" as Estado, cap: 0, esp: 0, fuera: 0 };
  if (f.sinDatos) return { estado: "vacia" as Estado, cap: 0, esp: 0, fuera: 0 };
  const cap = lecturasCapturadas(s, esTHR);
  const esp = lecturasEsperadas(s, esTHR);
  const fuera = fueraDeLimites(f.registro, s, f.registro.instrumento_id ? instrMap.get(f.registro.instrumento_id) : undefined);
  const estado: Estado = fuera > 0 ? "fuera" : cap === 0 ? "vacia" : esSemanaCompleta(s, esTHR) ? "completa" : "parcial";
  return { estado, cap, esp, fuera };
}

const CELDA: Record<Estado, string> = {
  completa: "bg-success/20 text-success border-success/40",
  parcial: "bg-warning/20 text-warning border-warning/40",
  vacia: "bg-muted text-muted-foreground border-border",
  fuera: "bg-destructive/15 text-destructive border-destructive/40",
};

function Leyenda({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">{children}</div>;
}

function useFiltro(filas: Fila[]) {
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("");
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter((f) => (!mod || f.modulo === mod) &&
      (!t || `${f.codigo} ${f.nombre} ${f.area}`.toLowerCase().includes(t)));
  }, [filas, q, mod]);
  const modulos = Array.from(new Set(filas.map((f) => f.modulo)));
  const ui = (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Input placeholder="Buscar por código, nombre o área…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs h-9" />
      <select value={mod} onChange={(e) => setMod(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
        <option value="">Todos los módulos</option>
        {modulos.map((m) => <option key={m} value={m}>{MODULO_LABEL[m] ?? m}</option>)}
      </select>
    </div>
  );
  return { filtradas, ui };
}

function EditarLink({ f, children, className }: { f: Fila; children: React.ReactNode; className?: string }) {
  if (f.sinDatos || !f.registro.id) {
    return <span className={cn(className, "pointer-events-none opacity-80")}>{children}</span>;
  }
  return (
    <Link to="/modulo/$slug" params={{ slug: MODULO_SLUG[f.modulo] ?? f.modulo }} search={{ registroId: f.registro.id }} className={className}>
      {children}
    </Link>
  );
}

function descargarReporte(f: Fila, desde: Date, hasta: Date, formato: "pdf" | "excel") {
  const d = format(desde, "yyyy-MM-dd");
  const h = format(hasta, "yyyy-MM-dd");
  const conDatos = f.registro.semanas.some((s) => s.semana_inicio >= format(lunesDe(desde), "yyyy-MM-dd") && s.semana_inicio <= h);
  if (!conDatos) {
    toast.info(`${f.codigo} no tiene lecturas en este periodo. Cambia el periodo arriba (por ejemplo "Últimos 12 meses").`);
    return;
  }
  const t = toast.loading(`Generando reporte de ${f.codigo}…`);
  setTimeout(() => {
    try {
      const periodo: Periodo = { tipo: "custom", desde: d, hasta: h };
      const analisis = [analizarRegistro(f.registro, periodo)];
      const cat = { areas: new Map(), hvac: new Map() };
      if (formato === "pdf") exportarNormativoPDF(analisis, "registro", cat, { incluirGraficas: true });
      else exportarNormativoExcel(analisis, "registro", cat);
      toast.success("Reporte descargado", { id: t });
    } catch (e: any) {
      toast.error("No se pudo generar: " + e.message, { id: t });
    }
  }, 30);
}

export function VistaInstrumentos({ registros, areaDe, instrMap, catalogo, areasMap, desde, hasta }: Props) {
  const filas = useMemo(() => construirFilas(registros, areaDe, instrMap, catalogo, areasMap), [registros, areaDe, instrMap, catalogo, areasMap]);
  const { filtradas, ui } = useFiltro(filas);
  const lunes = useMemo(() => lunesDelPeriodo(desde, hasta), [desde, hasta]);

  return (
    <section className="mt-3">
      <Leyenda>
        Lista de <b className="text-foreground">todo el catálogo de instrumentos</b>, sin importar el módulo. Los marcados como <b className="text-warning">Sin capturas</b> aún no tienen ningún registro: son los que faltan por capturar.
        "% completo" son las lecturas capturadas contra las esperadas en el periodo (sin contar días N/A). "Fuera de límites" cuenta lecturas fuera de LIE/LSE. Da clic en "Abrir" para capturar o corregir.
      </Leyenda>
      {ui}
      <div className="mt-3 rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Instrumento</th>
              <th className="px-3 py-2 text-left font-medium">Tipo</th>
              <th className="px-3 py-2 text-left font-medium">Área</th>
              <th className="px-3 py-2 text-left font-medium">Módulo</th>
              <th className="px-3 py-2 text-left font-medium">Primera / última semana</th>
              <th className="px-3 py-2 text-center font-medium">Semanas</th>
              <th className="px-3 py-2 text-center font-medium">% completo</th>
              <th className="px-3 py-2 text-center font-medium">Fuera de límites</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f) => {
              const claves = Array.from(f.semanas.keys()).sort();
              let cap = 0, esp = 0, fuera = 0;
              for (const l of lunes) {
                const e = estadoSemana(f, l, instrMap);
                cap += e.cap; esp += e.esp; fuera += e.fuera;
              }
              const pct = esp ? Math.round((cap / esp) * 100) : 0;
              return (
                <tr key={f.key} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">
                      {f.codigo}
                      {f.sinDatos && <span className="ml-2 rounded border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">Sin capturas</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{f.nombre}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{f.tipo}</td>
                  <td className={cn("px-3 py-2 text-xs", f.sinArea && "text-warning")}>
                    {f.area}
                    {f.sinArea && <Link to="/configuracion" className="block underline">Asignar en Configuración</Link>}
                  </td>
                  <td className="px-3 py-2 text-xs">{MODULO_LABEL[f.modulo] ?? f.modulo}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {claves.length ? `${claves[0]} → ${claves[claves.length - 1]}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{f.semanas.size}</td>
                  <td className={cn("px-3 py-2 text-center tabular-nums font-semibold", pct >= 100 ? "text-success" : pct > 0 ? "text-warning" : "text-muted-foreground")}>
                    {esp ? `${pct}%` : "—"}
                  </td>
                  <td className={cn("px-3 py-2 text-center tabular-nums", fuera > 0 ? "text-destructive font-semibold" : "text-muted-foreground")}>{fuera}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      {!f.sinDatos && (
                        <>
                          <button type="button" onClick={() => descargarReporte(f, desde, hasta, "pdf")}
                            title="Descargar el reporte de este instrumento en PDF, con el periodo elegido arriba"
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90">
                            <FileText className="h-3.5 w-3.5" /> PDF
                          </button>
                          <button type="button" onClick={() => descargarReporte(f, desde, hasta, "excel")}
                            title="Descargar el reporte de este instrumento en Excel, con el periodo elegido arriba"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                          </button>
                        </>
                      )}
                      <EditarLink f={f} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Ver bitácora</EditarLink>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Sin instrumentos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function VistaAvance({ registros, areaDe, instrMap, catalogo, areasMap, desde, hasta }: Props) {
  const filas = useMemo(() => construirFilas(registros, areaDe, instrMap, catalogo, areasMap), [registros, areaDe, instrMap, catalogo, areasMap]);
  const { filtradas, ui } = useFiltro(filas);
  const lunes = useMemo(() => lunesDelPeriodo(desde, hasta), [desde, hasta]);
  const ultima = lunes[lunes.length - 1];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollPos, setScrollPos] = useState(0);
  const [scrollMax, setScrollMax] = useState(0);
  const desplazar = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(300, el.clientWidth * 0.8), behavior: "smooth" });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const actualizar = () => {
      setScrollMax(Math.max(0, el.scrollWidth - el.clientWidth));
      setScrollPos(el.scrollLeft);
    };
    actualizar();
    const observer = new ResizeObserver(actualizar);
    observer.observe(el);
    const table = el.querySelector("table");
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [lunes.length, filtradas.length]);

  const resumen = useMemo(() => {
    let alDia = 0, pendientes = 0, fuera = 0;
    for (const f of filtradas) {
      if (ultima && estadoSemana(f, ultima, instrMap).estado === "completa") alDia++;
      for (const l of lunes) {
        const e = estadoSemana(f, l, instrMap);
        if (e.estado === "vacia" || e.estado === "parcial") pendientes++;
        fuera += e.fuera;
      }
    }
    return { alDia, pendientes, fuera };
  }, [filtradas, lunes, ultima, instrMap]);

  const exportar = () => {
    const header = ["Instrumento", "Nombre", "Área", "Módulo", ...lunes];
    const filasXls = filtradas.map((f) => [
      f.codigo, f.nombre, f.area, MODULO_LABEL[f.modulo] ?? f.modulo,
      ...lunes.map((l) => {
        const e = estadoSemana(f, l, instrMap);
        if (e.estado === "vacia") return "Sin captura";
        const base = `${e.cap}/${e.esp}`;
        return e.fuera ? `${base} (${e.fuera} fuera)` : e.estado === "completa" ? `Completa ${base}` : `Parcial ${base}`;
      }),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([
      ["DIAFRA, S.A. de C.V. — Avance semanal de captura"],
      [`Periodo: ${format(desde, "dd/MM/yyyy")} – ${format(hasta, "dd/MM/yyyy")}`],
      [], header, ...filasXls,
    ]);
    ws["!cols"] = [{ wch: 14 }, { wch: 40 }, { wch: 40 }, { wch: 12 }, ...lunes.map(() => ({ wch: 16 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Avance");
    XLSX.writeFile(wb, `avance-semanal-diafra-${format(new Date(), "yyyyMMdd")}.xlsx`);
  };

  return (
    <section className="mt-3">
      <Leyenda>
        Una fila por instrumento del catálogo (incluye los que aún no tienen capturas, marcados como <b className="text-warning">Sin capturas</b>) y una columna por semana (lunes) del periodo. Cada celda muestra lecturas capturadas / esperadas.
        <div className="mt-2 flex flex-wrap gap-3">
          <span className={cn("rounded border px-2", CELDA.completa)}>Completa</span>
          <span className={cn("rounded border px-2", CELDA.parcial)}>Parcial</span>
          <span className={cn("rounded border px-2", CELDA.vacia)}>Sin captura</span>
          <span className={cn("rounded border px-2", CELDA.fuera)}>Con lecturas fuera de límites</span>
        </div>
        Da clic en una celda para abrir ese instrumento en su módulo y capturar o corregir.
      </Leyenda>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Al día en la última semana</div>
          <div className="text-xl font-semibold">{resumen.alDia} de {filtradas.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Semanas pendientes o parciales</div>
          <div className="text-xl font-semibold text-warning">{resumen.pendientes}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Lecturas fuera de límites</div>
          <div className={cn("text-xl font-semibold", resumen.fuera ? "text-destructive" : "")}>{resumen.fuera}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        {ui}
        <Button size="sm" variant="outline" onClick={exportar} className="gap-1 mt-3">
          <FileSpreadsheet className="h-4 w-4" /> Exportar avance
        </Button>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-2 py-2">
          <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Semanas anteriores" onClick={() => desplazar(-1)} disabled={scrollPos <= 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Semanas</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, scrollMax)}
            value={Math.min(scrollPos, Math.max(1, scrollMax))}
            onChange={(e) => {
              const el = scrollRef.current;
              if (el) el.scrollLeft = Number(e.target.value);
            }}
            disabled={scrollMax === 0}
            aria-label="Desplazar semanas"
            className="h-2 min-w-0 flex-1 cursor-ew-resize accent-primary disabled:cursor-default disabled:opacity-40"
          />
          <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" aria-label="Semanas siguientes" onClick={() => desplazar(1)} disabled={scrollPos >= scrollMax - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div
          ref={scrollRef}
          className="max-h-[65vh] overflow-auto"
          onScroll={(e) => setScrollPos(e.currentTarget.scrollLeft)}
        >
        <table className="text-xs">
          <thead className="sticky top-0 z-20 bg-muted text-muted-foreground shadow-sm">
            <tr>
              <th className="sticky left-0 z-30 min-w-[220px] bg-muted px-3 py-2 text-left font-medium">Instrumento · Área</th>
              {lunes.map((l) => (
                <th key={l} className="px-1 py-2 font-medium whitespace-nowrap">{format(new Date(l + "T00:00:00"), "dd/MM")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f) => (
              <tr key={f.key} className="border-t border-border">
                <td className="sticky left-0 z-10 border-r border-border bg-card px-3 py-1.5">
                  <div className="font-medium text-foreground">
                    {f.codigo} <span className="text-muted-foreground font-normal">· {MODULO_LABEL[f.modulo] ?? f.modulo}</span>
                    {f.sinDatos && <span className="ml-1 rounded border border-warning/40 bg-warning/15 px-1 py-0.5 text-[10px] font-medium text-warning">Sin capturas</span>}
                  </div>
                  <div className={cn("text-[11px] truncate max-w-[260px]", f.sinArea ? "text-warning" : "text-muted-foreground")}>{f.area}</div>
                </td>
                {lunes.map((l) => {
                  const e = estadoSemana(f, l, instrMap);
                  return (
                    <td key={l} className="px-0.5 py-1">
                      <EditarLink f={f} className={cn("block min-w-[46px] rounded border px-1 py-1 text-center tabular-nums hover:opacity-80", CELDA[e.estado])}>
                        <span title={e.fuera ? `${e.fuera} lectura(s) fuera de límites` : undefined}>{e.estado === "vacia" ? "—" : `${e.cap}/${e.esp}`}</span>
                      </EditarLink>
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td colSpan={lunes.length + 1} className="px-3 py-6 text-center text-muted-foreground">Sin instrumentos.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
}
