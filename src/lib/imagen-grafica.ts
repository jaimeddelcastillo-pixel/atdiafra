// Dibuja una gráfica (SVG de Recharts) a 300 dpi en PNG: fondo blanco, Calibri, título y leyenda.
export interface LeyendaItem { nombre: string; color: string; linea: "solid" | "dash" | "sysDot" | "none"; marcador?: boolean }

export const PX_16x9 = { w: 1890, h: 1063 };
export const PX_16x5 = { w: 1890, h: 591 };
const FONT = "Calibri, Carlito, Arial, sans-serif";

export async function graficaPNG(svg: SVGSVGElement, titulo: string[], leyenda: LeyendaItem[], size: { w: number; h: number }): Promise<Blob> {
  const { w, h } = size;
  const k = w / 640; // escala tipográfica
  const tituloH = titulo.length * 15 * k + 8 * k;
  const ctx0 = document.createElement("canvas").getContext("2d")!;
  ctx0.font = `${9 * k}px ${FONT}`;
  // filas de leyenda
  const filas: LeyendaItem[][] = [[]];
  let ancho = 0;
  for (const it of leyenda) {
    const wi = 26 * k + ctx0.measureText(it.nombre).width;
    if (ancho + wi > w - 20 * k && filas[filas.length - 1].length) { filas.push([]); ancho = 0; }
    filas[filas.length - 1].push(it); ancho += wi;
  }
  const leyH = leyenda.length ? filas.length * 13 * k + 6 * k : 0;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const bw = svg.clientWidth || svg.viewBox.baseVal.width, bh = svg.clientHeight || svg.viewBox.baseVal.height;
  clone.setAttribute("viewBox", `0 0 ${bw} ${bh}`);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(Math.max(10, h - tituloH - leyH)));
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
  titulo.forEach((t, i) => { ctx.font = `${i === 0 ? "bold " : ""}${10 * k}px ${FONT}`; ctx.fillText(t, w / 2, 4 * k + i * 15 * k); });
  ctx.drawImage(img, 0, tituloH, w, h - tituloH - leyH);
  URL.revokeObjectURL(url);

  ctx.font = `${9 * k}px ${FONT}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  filas.forEach((fila, fi) => {
    const tot = fila.reduce((a, it) => a + 26 * k + ctx.measureText(it.nombre).width, 0);
    let x = (w - tot) / 2;
    const y = h - leyH + 3 * k + fi * 13 * k + 6 * k;
    for (const it of fila) {
      ctx.strokeStyle = it.color; ctx.fillStyle = it.color; ctx.lineWidth = 1.5 * k;
      if (it.linea !== "none") {
        ctx.setLineDash(it.linea === "dash" ? [4 * k, 3 * k] : it.linea === "sysDot" ? [1.5 * k, 2 * k] : []);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 * k, y); ctx.stroke(); ctx.setLineDash([]);
      }
      if (it.marcador || it.linea === "none") { ctx.beginPath(); ctx.arc(x + 9 * k, y, 2.5 * k, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#374151"; ctx.fillText(it.nombre, x + 22 * k, y);
      x += 26 * k + ctx.measureText(it.nombre).width;
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
