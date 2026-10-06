// Dibuja una gráfica (SVG de Recharts) a 300 dpi en PNG: fondo blanco, Calibri, título y leyenda.
// Tamaños tipográficos en puntos al tamaño final (16 cm de ancho): título 11 pt negrita, leyenda 9 pt.
export interface LeyendaItem { nombre: string; color: string; linea: "solid" | "dash" | "sysDot" | "none"; marcador?: boolean; hueco?: boolean; borde?: string }

export const PX_16x9 = { w: 1890, h: 1063 };
export const PX_16x5 = { w: 1890, h: 591 };
/** Factor entre píxeles CSS (96 dpi) y la imagen final (300 dpi). 9 pt = 12 px CSS. */
export const ESCALA_PNG = 300 / 96;
const FONT = "Calibri, Carlito, Arial, sans-serif";
const pt = (p: number) => (p * 300) / 72;

export interface LayoutPNG { tituloH: number; leyH: number; chartH: number; filas: LeyendaItem[][] }

export function layoutPNG(titulo: string[], leyenda: LeyendaItem[], size: { w: number; h: number }): LayoutPNG {
  const { w, h } = size;
  const tituloH = titulo.length ? titulo.length * pt(11) * 1.2 + pt(4) : 0;
  const ctx0 = document.createElement("canvas").getContext("2d")!;
  ctx0.font = `${pt(9)}px ${FONT}`;
  const filas: LeyendaItem[][] = [[]];
  let ancho = 0;
  for (const it of leyenda) {
    const wi = pt(26) + ctx0.measureText(it.nombre).width;
    if (ancho + wi > w - pt(12) && filas[filas.length - 1].length) { filas.push([]); ancho = 0; }
    filas[filas.length - 1].push(it); ancho += wi;
  }
  const leyH = leyenda.length ? filas.length * pt(9) * 1.35 + pt(4) : 0;
  return { tituloH, leyH, chartH: Math.max(40, h - tituloH - leyH), filas };
}

/** El SVG debe estar dibujado a (size.w / ESCALA_PNG) × (chartH / ESCALA_PNG) px CSS para que los textos midan lo indicado. */
export async function graficaPNG(svg: SVGSVGElement, titulo: string[], leyenda: LeyendaItem[], size: { w: number; h: number }): Promise<Blob> {
  const { w, h } = size;
  const L = layoutPNG(titulo, leyenda, size);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const bw = svg.clientWidth || svg.viewBox.baseVal.width, bh = svg.clientHeight || svg.viewBox.baseVal.height;
  clone.setAttribute("viewBox", `0 0 ${bw} ${bh}`);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(L.chartH));
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.querySelectorAll("text").forEach((t) => { t.setAttribute("font-family", FONT); t.setAttribute("fill", t.getAttribute("fill") || "#374151"); });
  clone.querySelectorAll(".recharts-tooltip-cursor, .recharts-active-dot").forEach((n) => n.remove());
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("No se pudo dibujar la gráfica")); img.src = url; });

  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#111827"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.font = `bold ${pt(11)}px ${FONT}`;
  titulo.forEach((t, i) => ctx.fillText(t, w / 2, pt(2) + i * pt(11) * 1.2));
  ctx.drawImage(img, 0, L.tituloH, w, L.chartH);
  URL.revokeObjectURL(url);

  ctx.font = `${pt(9)}px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const filaH = pt(9) * 1.35;
  L.filas.forEach((fila, fi) => {
    const tot = fila.reduce((a, it) => a + pt(26) + ctx.measureText(it.nombre).width, 0);
    let x = (w - tot) / 2;
    const y = h - L.leyH + pt(2) + fi * filaH + filaH / 2;
    for (const it of fila) {
      ctx.strokeStyle = it.color; ctx.fillStyle = it.color; ctx.lineWidth = pt(1);
      if (it.linea !== "none") {
        ctx.setLineDash(it.linea === "dash" ? [pt(4), pt(3)] : it.linea === "sysDot" ? [pt(1.5), pt(2)] : []);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + pt(18), y); ctx.stroke(); ctx.setLineDash([]);
      }
      if (it.marcador || it.linea === "none") {
        ctx.beginPath(); ctx.arc(x + pt(9), y, pt(3), 0, Math.PI * 2);
        if (it.hueco) { ctx.lineWidth = pt(1.2); ctx.stroke(); }
        else { ctx.fill(); if (it.borde) { ctx.strokeStyle = it.borde; ctx.lineWidth = pt(0.75); ctx.stroke(); } }
      }
      ctx.fillStyle = "#374151"; ctx.fillText(it.nombre, x + pt(22), y);
      x += pt(26) + ctx.measureText(it.nombre).width;
    }
  });
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("PNG vacío"))), "image/png"));
}

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copia la imagen al portapapeles; si el navegador no lo permite, la descarga. Devuelve true si copió. */
export async function copiarImagen(blob: Blob, nombre: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("sin portapapeles");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    descargarBlob(blob, nombre);
    return false;
  }
}

export async function copiarHTML(html: string, texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([texto], { type: "text/plain" }) })]);
    return true;
  } catch {
    try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
  }
}
