import { useRef } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CartesianGrid, Line, LineChart, ReferenceLine, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Copy, Download, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Bloque, Grafica, PuntoTendencia } from "@/lib/export-forval16";
import { fmtDMY, specTxt } from "@/lib/export-forval16";
import { etiquetaCapacidad } from "@/lib/estadistica-pno";
import { ESCALA_PNG, PX_16x5, PX_16x9, copiarHTML, copiarImagen, descargarBlob, graficaPNG, layoutPNG, type LeyendaItem } from "@/lib/imagen-grafica";

const MS0 = Date.UTC(1899, 11, 30);
const aMs = (serial: number) => MS0 + serial * 86400000;
const letraAIndice = (c: string) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const dash = (l: string) => (l === "dash" ? "6 4" : l === "sysDot" ? "2 3" : undefined);

export const leyendaDe = (g: Grafica): LeyendaItem[] => {
  const vistos = new Set<string>();
  return g.series.filter((s) => {
    const k = s.lit ? "Cambio de filtro" : s.nombre;
    if (vistos.has(k)) return false; vistos.add(k); return true;
  }).map((s) => ({ nombre: s.lit ? "Cambio de filtro" : s.nombre, color: `#${s.color}`, linea: s.linea, marcador: !!s.marcador, hueco: s.marcador?.hueco, borde: s.marcador?.borde ? `#${s.marcador.borde}` : undefined }));
};

export const nombreArchivo = (b: Bloque, sufijo = "") => `${b.hoja.replace(/[^\w.-]+/g, "_")}${sufijo}.png`;

/** Dibuja la gráfica fuera de pantalla al tamaño final (16 cm) para que ejes y textos midan 9 pt. */
async function svgFijo(b: Bloque, g: Grafica, w: number, h: number): Promise<{ svg: SVGSVGElement; limpiar: () => void }> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;background:#fff`;
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Grafico b={b} g={g} fijo={{ w, h }} />));
  let svg: SVGSVGElement | null = null;
  for (let k = 0; k < 20 && !svg; k++) {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    svg = host.querySelector<SVGSVGElement>("svg.recharts-surface");
  }
  const limpiar = () => { root.unmount(); host.remove(); };
  if (!svg) { limpiar(); throw new Error("No se pudo dibujar la gráfica"); }
  return { svg, limpiar };
}

/** Renderiza a PNG (300 dpi, 16 × 9 cm; R: 16 × 5 cm) cada gráfica de un bloque. */
export async function pngsDeTarjeta(_root: HTMLElement | null, b: Bloque): Promise<{ nombre: string; blob: Blob }[]> {
  const out: { nombre: string; blob: Blob }[] = [];
  for (let i = 0; i < b.graficas.length; i++) {
    const g = b.graficas[i];
    const size = i === 1 ? PX_16x5 : PX_16x9;
    const ley = leyendaDe(g);
    const L = layoutPNG(g.titulo, ley, size);
    const { svg, limpiar } = await svgFijo(b, g, size.w / ESCALA_PNG, L.chartH / ESCALA_PNG);
    try { out.push({ nombre: nombreArchivo(b, i === 1 ? "_R" : ""), blob: await graficaPNG(svg, g.titulo, ley, size) }); }
    finally { limpiar(); }
  }
  return out;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaSemana = (ms: number) => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, "0")} ${MESES[d.getUTCMonth()]}`; };
/** Un tick por semana (lunes) dentro del rango. */
function ticksSemana(xMin: number, xMax: number): number[] {
  const out: number[] = [];
  let s = Math.ceil(xMin);
  while ((((s - 2) % 7) + 7) % 7 !== 0) s++;
  for (; s <= xMax; s += 7) out.push(aMs(s));
  if (!out.length) out.push(aMs(xMin));
  return out;
}

function Grafico({ b, g, ratio, fijo }: { b: Bloque; g: Grafica; ratio?: string; fijo?: { w: number; h: number } }) {
  const datos = b.filas.map((f, i) => {
    const row: Record<string, unknown> = { x: aMs(f[0] as number), _p: b.puntos[i] };
    f.forEach((v, j) => { if (j > 0) row[`c${j}`] = v; });
    return row;
  });
  const ticks: number[] = [];
  for (let y = g.yMin; y <= g.yMax + 1e-9; y += g.yStep) ticks.push(Math.round(y * 1000) / 1000);
  const fs = fijo ? 12 : 10; // 12 px CSS = 9 pt a 16 cm
  const xt = ticksSemana(g.xMin, g.xMax);
  const girar = xt.length > (fijo ? 9 : 14);
  const r = (t: number) => (t * 1.333) / 2;
  const grafica = (
    <LineChart width={fijo?.w} height={fijo?.h} data={datos} margin={{ top: 6, right: 14, bottom: girar ? 4 : 14, left: 4 }}>
      <CartesianGrid vertical={false} stroke="#E5E7EB" />
      <XAxis dataKey="x" type="number" scale="time" domain={[aMs(g.xMin), aMs(g.xMax)]} ticks={xt} interval={0}
        tick={{ fontSize: fs, fill: "#374151" }} angle={girar ? -45 : 0} textAnchor={girar ? "end" : "middle"} height={girar ? fs * 4.2 : fs * 2.6}
        tickFormatter={(v) => etiquetaSemana(v as number)}
        label={{ value: "Días", position: "insideBottom", offset: 0, fontSize: fs, fill: "#374151" }} />
      <YAxis domain={[g.yMin, g.yMax]} ticks={ticks} allowDataOverflow tick={{ fontSize: fs, fill: "#374151" }} width={fs * 5.2}
        tickFormatter={(v) => (+v).toFixed(g.yStep < 1 ? 1 : 0)}
        label={{ value: g.tituloY, angle: -90, position: "insideLeft", fontSize: fs, fill: "#374151", style: { textAnchor: "middle" } }} />
      {!fijo && <Tooltip content={<Punto b={b} />} />}
      {(() => {
        const sup = g.series.find((s) => s.banda === "sup"), inf = g.series.find((s) => s.banda === "inf");
        const v = (s?: typeof sup) => (s ? (b.filas[0]?.[letraAIndice(s.col)] as number | undefined) : undefined);
        const y1 = v(inf), y2 = v(sup);
        return y1 != null && y2 != null ? <ReferenceArea y1={y1} y2={y2} fill="#D1D5DB" fillOpacity={0.45} stroke="none" ifOverflow="hidden" /> : null;
      })()}
      {g.series.filter((s) => !s.lit && !s.banda).map((s) => (
        <Line key={s.nombre} dataKey={`c${letraAIndice(s.col)}`} name={s.nombre} isAnimationActive={false}
          stroke={s.linea === "none" ? "none" : `#${s.color}`} strokeDasharray={dash(s.linea)} strokeWidth={s.ancho ? 1.8 : 1.2}
          dot={s.marcador ? (s.marcador.hueco
            ? { r: r(s.marcador.tam), fill: "none", stroke: `#${s.marcador.color}`, strokeWidth: 1.5 }
            : { r: r(s.marcador.tam), fill: `#${s.marcador.color}`, stroke: s.marcador.borde ? `#${s.marcador.borde}` : `#${s.marcador.color}`, strokeWidth: s.marcador.borde ? 1 : 0.5 }) : false}
          activeDot={s.marcador && !fijo ? { r: 4 } : false} connectNulls={false} />
      ))}
      {g.series.filter((s) => s.lit).map((s) => (
        <ReferenceLine key={s.nombre} x={aMs(s.lit!.x[0])} stroke={`#${s.color}`} strokeDasharray="2 3" />
      ))}
    </LineChart>
  );
  if (fijo) return grafica;
  return (
    <div data-grafica className={cn("w-full bg-card", ratio)}>
      <ResponsiveContainer width="100%" height="100%">{grafica}</ResponsiveContainer>
    </div>
  );
}

function Punto({ b, active, payload }: { b: Bloque; active?: boolean; payload?: { payload: { _p?: PuntoTendencia } }[] }) {
  const p = payload?.[0]?.payload?._p;
  if (!active || !p) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md max-w-64">
      <div className="font-semibold">{format(new Date(p.fecha + "T12:00:00"), "EEEE dd/MM/yyyy", { locale: es })}</div>
      <div>{b.tipo === "thr" ? "X̄" : "Media diaria"}: <b>{p.valor.toFixed(2)} {b.unidad}</b></div>
      <div className="text-muted-foreground">Lecturas del día: {p.lecturas.map((v) => v.toFixed(1)).join(" · ")}</div>
      {p.fuera && <div className="text-destructive">Lectura fuera de especificación</div>}
      {p.reglas.map((r) => <div key={r} className="text-warning">{r}</div>)}
    </div>
  );
}

const fmtCelda = (v: unknown) => (v == null ? "" : typeof v === "number" ? v.toFixed(3) : String(v));
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Tabla para Word: 16 cm, ancho fijo, columnas de 2 cm, Calibri 9 pt, encabezado #DCE6F2, bordes 0.5 pt. */
export function tablaHTML(b: Bloque): { html: string; texto: string } {
  const nCols = Math.max(...b.tablaLimites.map((f) => f.length));
  const anchoCol = 16 / nCols;
  const borde = "border:0.5pt solid #7F7F7F";
  const filas = b.tablaLimites.map((f, i) => {
    const head = i % 2 === 0;
    const span = Math.floor(nCols / f.length);
    return `<tr>${f.map((v, j) => {
      const cs = j === f.length - 1 ? nCols - span * (f.length - 1) : span;
      const t = esc(fmtCelda(v));
      return head
        ? `<th${cs > 1 ? ` colspan="${cs}"` : ""} style="${borde};background:#DCE6F2;vertical-align:middle;padding:1pt 2pt"><p style="font-family:Calibri;font-size:9pt;font-weight:bold;text-align:center;margin:2pt 0">${t}</p></th>`
        : `<td${cs > 1 ? ` colspan="${cs}"` : ""} style="${borde};vertical-align:middle;white-space:nowrap;padding:1pt 2pt"><p style="font-family:Calibri;font-size:9pt;text-align:center;margin:2pt 0">${t}</p></td>`;
    }).join("")}</tr>`;
  }).join("");
  const cols = Array.from({ length: nCols }, () => `<col style="width:${anchoCol}cm">`).join("");
  const nota = b.notaTabla ? `<p style="font-family:Calibri;font-size:8pt;margin:2pt 0 0 0">${esc(b.notaTabla)}</p>` : "";
  const html = `<table style="table-layout:fixed;width:16cm;border-collapse:collapse">${cols}${filas}</table>${nota}`;
  const texto = b.tablaLimites.map((f) => f.map(fmtCelda).join("\t")).join("\n") + (b.notaTabla ? `\n${b.notaTabla}` : "");
  return { html, texto };
}

export function TendenciaCard({ b }: { b: Bloque }) {
  const ref = useRef<HTMLDivElement>(null);
  const d = b.dict;
  const tono = !d ? "muted" : d.cumplimientoEspecificacion === "NO CUMPLE" || d.estadoControl === "FUERA DE CONTROL" ? "destructive" : d.estadoControl === "BAJO CONTROL CON ALERTAS" ? "warning" : "success";
  const etPpk = etiquetaCapacidad(b.Ppk);

  const copiar = async (i: number) => {
    try {
      const pngs = await pngsDeTarjeta(ref.current!, b);
      const p = pngs[i];
      if (await copiarImagen(p.blob, p.nombre)) toast.success("Gráfica copiada. Pégala en Word con Ctrl+V.");
      else toast.info("Tu navegador no permite copiar imágenes; se descargó el PNG.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo copiar"); }
  };
  const descargar = async () => {
    try { for (const p of await pngsDeTarjeta(ref.current!, b)) descargarBlob(p.blob, p.nombre); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo descargar"); }
  };
  const copiarTabla = async () => {
    const t = tablaHTML(b);
    if (await copiarHTML(t.html, t.texto)) toast.success("Tabla copiada. Pégala en Word.");
    else toast.error("No se pudo copiar la tabla");
  };

  return (
    <article ref={ref} data-tarjeta={b.hoja} className="rounded-xl border border-border bg-card p-4 space-y-3">
      <header className="text-center leading-tight">
        <div className="font-semibold text-foreground">{b.graficas[0]?.titulo[0]}</div>
        <div className="text-sm text-muted-foreground">{b.graficas[0]?.titulo[1]}</div>
        <div className="text-xs text-muted-foreground">{b.graficas[0]?.titulo[2]}</div>
        <div className="text-xs mt-1">{b.variable} · Especificación {specTxt(b.lie, b.lse, b.unidad, b.specTexto)}</div>
        {b.pendientes?.length ? (
          <div className="mt-2 rounded border border-warning/50 bg-warning/10 px-2 py-1 text-xs text-foreground">⚠ {b.pendientes.join(" · ")}</div>
        ) : null}
      </header>
      {b.graficas.map((g, i) => (
        <div key={i}>
          {i === 1 && <div className="text-center text-xs font-medium text-muted-foreground">{g.titulo[0]}</div>}
          <Grafico b={b} g={g} ratio={i === 1 ? "aspect-[16/5]" : "aspect-[16/9]"} />
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {leyendaDe(g).map((l) => (
              <span key={l.nombre} className="inline-flex items-center gap-1">
                <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke={l.linea === "none" ? "transparent" : l.color} strokeDasharray={dash(l.linea)} strokeWidth="1.5" />{(l.marcador || l.linea === "none") && <circle cx="9" cy="4" r="2.5" fill={l.hueco ? "none" : l.color} stroke={l.hueco ? l.color : l.borde ?? "none"} strokeWidth={l.hueco ? 1.2 : 0.6} />}</svg>
                {l.nombre}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <tbody>
            {b.tablaLimites.map((f, i) => {
              const nCols = Math.max(...b.tablaLimites.map((x) => x.length));
              const span = Math.floor(nCols / f.length);
              return (
                <tr key={i}>
                  {f.map((v, j) => {
                    const cs = j === f.length - 1 ? nCols - span * (f.length - 1) : span;
                    return i % 2 === 0
                      ? <th key={j} colSpan={cs} className="border border-border bg-accent px-2 py-1 font-medium">{v}</th>
                      : <td key={j} colSpan={cs} className="border border-border px-2 py-1 text-center tabular-nums whitespace-nowrap">{fmtCelda(v)}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {b.notaTabla && <p className="mt-1 text-[11px] text-muted-foreground">{b.notaTabla}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("rounded-md border px-2 py-1 font-semibold",
          tono === "destructive" && "border-destructive/40 bg-destructive/10 text-destructive",
          tono === "warning" && "border-warning/40 bg-warning/15 text-warning",
          tono === "success" && "border-success/40 bg-success/10 text-success",
          tono === "muted" && "border-border text-muted-foreground")}>
          {d ? `${d.estadoControl} · ${d.cumplimientoEspecificacion}` : "Sin datos suficientes"}
        </span>
        <span className="rounded-md border border-border px-2 py-1">Ppk {b.Ppk?.toFixed(2) ?? "N/D"} · {etPpk}</span>
        <span className="text-muted-foreground">n = {b.n} · {b.nSenales} señal(es) · {b.puntos[0] ? `${fmtDMY(b.puntos[0].fecha)} – ${fmtDMY(b.puntos[b.puntos.length - 1].fecha)}` : ""}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1" onClick={() => copiar(0)}><Copy className="h-3.5 w-3.5" /> Copiar imagen</Button>
        {b.graficas.length > 1 && <Button size="sm" variant="outline" className="gap-1" onClick={() => copiar(1)}><Copy className="h-3.5 w-3.5" /> Copiar gráfica R</Button>}
        <Button size="sm" variant="outline" className="gap-1" onClick={copiarTabla}><Table2 className="h-3.5 w-3.5" /> Copiar tabla</Button>
        <Button size="sm" variant="ghost" className="gap-1" onClick={descargar}><Download className="h-3.5 w-3.5" /> Descargar PNG</Button>
      </div>
    </article>
  );
}
