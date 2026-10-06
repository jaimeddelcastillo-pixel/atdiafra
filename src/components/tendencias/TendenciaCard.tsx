import { useRef } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Copy, Download, Table2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Bloque, Grafica, PuntoTendencia } from "@/lib/export-forval16";
import { fmtDMY, specTxt } from "@/lib/export-forval16";
import { etiquetaCapacidad } from "@/lib/estadistica-pno";
import { PX_16x5, PX_16x9, copiarHTML, copiarImagen, descargarBlob, graficaPNG, type LeyendaItem } from "@/lib/imagen-grafica";

const MS0 = Date.UTC(1899, 11, 30);
const aMs = (serial: number) => MS0 + serial * 86400000;
const letraAIndice = (c: string) => [...c].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const dash = (l: string) => (l === "dash" ? "6 4" : l === "sysDot" ? "2 3" : undefined);

export const leyendaDe = (g: Grafica): LeyendaItem[] => {
  const vistos = new Set<string>();
  return g.series.filter((s) => {
    const k = s.lit ? "Cambio de filtro" : s.nombre;
    if (vistos.has(k)) return false; vistos.add(k); return true;
  }).map((s) => ({ nombre: s.lit ? "Cambio de filtro" : s.nombre, color: `#${s.color}`, linea: s.linea, marcador: !!s.marcador }));
};

export const nombreArchivo = (b: Bloque, sufijo = "") => `${b.hoja.replace(/[^\w.-]+/g, "_")}${sufijo}.png`;

/** Renderiza a PNG (300 dpi) cada gráfica de una tarjeta. */
export async function pngsDeTarjeta(root: HTMLElement, b: Bloque): Promise<{ nombre: string; blob: Blob }[]> {
  const svgs = root.querySelectorAll<SVGSVGElement>("[data-grafica] svg.recharts-surface");
  const out: { nombre: string; blob: Blob }[] = [];
  for (let i = 0; i < b.graficas.length && i < svgs.length; i++) {
    const g = b.graficas[i];
    out.push({ nombre: nombreArchivo(b, i === 1 ? "_R" : ""), blob: await graficaPNG(svgs[i], g.titulo, leyendaDe(g), i === 1 ? PX_16x5 : PX_16x9) });
  }
  return out;
}

function Grafico({ b, g, ratio }: { b: Bloque; g: Grafica; ratio: string }) {
  const datos = b.filas.map((f, i) => {
    const row: Record<string, unknown> = { x: aMs(f[0] as number), _p: b.puntos[i] };
    f.forEach((v, j) => { if (j > 0) row[`c${j}`] = v; });
    return row;
  });
  const ticks: number[] = [];
  for (let y = g.yMin; y <= g.yMax + 1e-9; y += g.yStep) ticks.push(Math.round(y * 1000) / 1000);
  return (
    <div data-grafica className={cn("w-full bg-background", ratio)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 16, bottom: 18, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#E5E7EB" />
          <XAxis dataKey="x" type="number" scale="time" domain={[aMs(g.xMin), aMs(g.xMax)]} tick={{ fontSize: 10 }}
            tickFormatter={(v) => format(new Date(v as number), "dd MMM", { locale: es })}
            label={{ value: "Días", position: "insideBottom", offset: -10, fontSize: 10 }} />
          <YAxis domain={[g.yMin, g.yMax]} ticks={ticks} allowDataOverflow tick={{ fontSize: 10 }} width={52}
            tickFormatter={(v) => (+v).toFixed(g.yStep < 1 ? 1 : 0)}
            label={{ value: g.tituloY, angle: -90, position: "insideLeft", fontSize: 10, style: { textAnchor: "middle" } }} />
          <Tooltip content={<Punto b={b} />} />
          {g.series.filter((s) => !s.lit).map((s) => (
            <Line key={s.nombre} dataKey={`c${letraAIndice(s.col)}`} name={s.nombre} isAnimationActive={false}
              stroke={s.linea === "none" ? "none" : `#${s.color}`} strokeDasharray={dash(s.linea)} strokeWidth={s.ancho ? 1.8 : 1.2}
              dot={s.marcador ? { r: s.marcador.tam / 2 + 0.5, fill: `#${s.marcador.color}`, stroke: `#${s.marcador.color}` } : false}
              activeDot={s.marcador ? { r: 4 } : false} connectNulls={false} />
          ))}
          {g.series.filter((s) => s.lit).map((s) => (
            <ReferenceLine key={s.nombre} x={aMs(s.lit!.x[0])} stroke={`#${s.color}`} strokeDasharray="2 3" />
          ))}
        </LineChart>
      </ResponsiveContainer>
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

function tablaHTML(b: Bloque): { html: string; texto: string } {
  const celda = (v: unknown, head: boolean) => {
    const t = v == null ? "" : typeof v === "number" ? v.toFixed(3) : String(v);
    return head
      ? `<th style="background:#DEEAF6;border:1px solid #9DC3E6;font-family:Calibri;font-size:9pt;padding:2px 4px">${t}</th>`
      : `<td style="border:1px solid #9DC3E6;font-family:Calibri;font-size:9pt;text-align:center;padding:2px 4px">${t}</td>`;
  };
  const html = `<table style="border-collapse:collapse">${b.tablaLimites.map((f, i) => `<tr>${f.map((v) => celda(v, i % 2 === 0)).join("")}</tr>`).join("")}</table>`;
  const texto = b.tablaLimites.map((f) => f.map((v) => (v == null ? "" : typeof v === "number" ? v.toFixed(3) : v)).join("\t")).join("\n");
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
        <div className="text-xs mt-1">{b.variable} · Especificación {specTxt(b.lie, b.lse, b.unidad)}</div>
      </header>
      {b.graficas.map((g, i) => (
        <div key={i}>
          {i === 1 && <div className="text-center text-xs font-medium text-muted-foreground">{g.titulo[0]}</div>}
          <Grafico b={b} g={g} ratio={i === 1 ? "aspect-[16/5]" : "aspect-[16/9]"} />
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {leyendaDe(g).map((l) => (
              <span key={l.nombre} className="inline-flex items-center gap-1">
                <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke={l.linea === "none" ? "transparent" : l.color} strokeDasharray={dash(l.linea)} strokeWidth="1.5" />{(l.marcador || l.linea === "none") && <circle cx="9" cy="4" r="2.5" fill={l.color} />}</svg>
                {l.nombre}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <tbody>
            {b.tablaLimites.map((f, i) => (
              <tr key={i}>
                {f.map((v, j) => i % 2 === 0
                  ? <th key={j} className="border border-border bg-accent px-2 py-1 font-medium">{v}</th>
                  : <td key={j} className="border border-border px-2 py-1 text-center tabular-nums">{v == null ? "" : typeof v === "number" ? v.toFixed(3) : v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
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
