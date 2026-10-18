// Genera en el navegador el Word FOR-VAL-16-02 a partir del registro AT, con los mismos bloques, imágenes y texto que la pantalla.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HorizontalPositionAlign, HorizontalPositionRelativeFrom,
  ImageRun, LevelFormat, Packer, PageBreak, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, VerticalAlign, VerticalPositionAlign, VerticalPositionRelativeFrom, WidthType,
} from "docx";
import logoDefault from "@/assets/diafra-logo.jpg";
import type { Bloque } from "./export-forval16";
import { fmtDMY, specTxt } from "./export-forval16";
import type { TextoForVal16 } from "./texto-forval16";
import { listaEs, ubicacionTxt } from "./texto-forval16";
import { sustituir, type FormatoForVal16 } from "./formato-forval16";

export interface CambioVersion { de: string; a: string; fecha: string; descripcion: string; por: string }
export interface WordArgs {
  formato: FormatoForVal16;
  codigoAT: string; version: number; estado: "borrador" | "emitido"; emitidoAt: string | null;
  sistema: string; tituloSistema: string; periodo: string; desde: string; hasta: string;
  bloques: Bloque[]; texto: TextoForVal16; justificaciones: Record<string, string>;
  cambios: CambioVersion[];
  /** «AT-AAAA-NNN vNN» de la última versión EMITIDA anterior, o N/A. */
  sustituye: string;
  /** Áreas únicas (cuartos individuales) ordenadas por código, p. ej. «DCC-01 Entrada personal». */
  areas: string[];
  png: (b: Bloque) => Promise<{ nombre: string; blob: Blob }[]>;
}

const FONT = "Arial";
const W = 9972; // carta 21.59 cm − 2 × 2 cm, en DXA
const W16 = 9071; // 16 cm
const AZUL = "DCE6F2";
const borde = { style: BorderStyle.SINGLE, size: 4, color: "7F7F7F" };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };

const run = (text: string, o: { b?: boolean; sz?: number; i?: boolean } = {}) =>
  new TextRun({ text, bold: o.b, italics: o.i, size: (o.sz ?? 10) * 2, font: FONT });
const par = (text: string, o: { b?: boolean; sz?: number; al?: (typeof AlignmentType)[keyof typeof AlignmentType]; keep?: boolean; after?: number } = {}) =>
  new Paragraph({ children: [run(text, o)], alignment: o.al ?? AlignmentType.JUSTIFIED, keepNext: o.keep, keepLines: o.keep, spacing: { after: o.after ?? 100 } });

function celda(children: Paragraph[], w: number, o: { head?: boolean; span?: number; rowSpan?: number } = {}) {
  return new TableCell({
    children, width: { size: w, type: WidthType.DXA }, columnSpan: o.span, rowSpan: o.rowSpan, borders: bordes,
    verticalAlign: VerticalAlign.CENTER, margins: { top: 40, bottom: 40, left: 80, right: 80 },
    shading: o.head ? { fill: AZUL, type: ShadingType.CLEAR, color: "auto" } : undefined,
  });
}
const pc = (t: string, o: { b?: boolean; sz?: number; keep?: boolean; al?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ children: [run(t, { b: o.b, sz: o.sz ?? 9 })], alignment: o.al ?? AlignmentType.CENTER, keepNext: o.keep, keepLines: o.keep });

/** Tabla simple: filas de texto, la primera como encabezado; anchos en DXA. */
function tablaSimple(filas: string[][], anchos: number[], o: { keep?: boolean; headRows?: number[] } = {}) {
  const total = anchos.reduce((a, b) => a + b, 0);
  const heads = new Set(o.headRows ?? [0]);
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: anchos,
    rows: filas.map((f, i) => new TableRow({
      cantSplit: true, tableHeader: i === 0 && heads.has(0),
      children: f.map((t, j) => celda([pc(t, { b: heads.has(i), keep: o.keep, al: heads.has(i) ? AlignmentType.CENTER : AlignmentType.LEFT })], anchos[j], { head: heads.has(i) })),
    })),
  });
}

const fmtCelda = (v: unknown) => (v == null ? "" : typeof v === "number" ? v.toFixed(3) : String(v));

/** Tabla nativa de límites (mismo formato que «Copiar tabla»): 16 cm, columnas iguales. */
function tablaLimites(b: Bloque) {
  const n = Math.max(...b.tablaLimites.map((f) => f.length));
  const col = Math.floor(W16 / n);
  return new Table({
    width: { size: col * n, type: WidthType.DXA }, columnWidths: Array(n).fill(col),
    rows: b.tablaLimites.map((f, i) => {
      const span = Math.floor(n / f.length);
      const enc = i > 0 ? b.tablaLimites[i - 1] : [];
      return new TableRow({
        cantSplit: true,
        children: f.map((v, j) => {
          const cs = j === f.length - 1 ? n - span * (f.length - 1) : span;
          const entero = enc[j] === "n días" || enc[j] === "n lecturas";
          const txt = entero && typeof v === "number" ? String(Math.round(v)) : fmtCelda(v);
          return celda([pc(txt, { b: i % 2 === 0, keep: true })], col * cs, { head: i % 2 === 0, span: cs > 1 ? cs : undefined });
        }),
      });
    }),
  });
}

async function bytesDe(src: string | Blob): Promise<Uint8Array> {
  const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
  return new Uint8Array(await blob.arrayBuffer());
}

async function tamImagen(bytes: Uint8Array): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Logo no válido")); img.src = url; });
    return { w: img.naturalWidth, h: img.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}

async function marcaAgua(): Promise<Uint8Array> {
  const c = document.createElement("canvas");
  c.width = 1600; c.height = 1600;
  const ctx = c.getContext("2d")!;
  ctx.translate(800, 800); ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "rgba(192, 0, 0, 0.18)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 92px Arial, sans-serif";
  ctx.fillText("BORRADOR – NO VÁLIDO", 0, -60);
  ctx.fillText("PARA EMISIÓN", 0, 60);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
  return bytesDe(blob);
}

/** Párrafos numerados según la sintaxis de la plantilla ("- " = nivel 2, "-- " = nivel 3…). */
function parrafosPlantilla(texto: string, vars: Record<string, string>): Paragraph[] {
  return sustituir(texto, vars).split("\n").map((l) => l.trimEnd()).filter((l) => l.trim()).map((l) => {
    const m = l.match(/^(-{1,3})\s+(.*)$/);
    if (!m) return new Paragraph({ children: [run(l.trim())], alignment: AlignmentType.JUSTIFIED, spacing: { after: 100 }, indent: { left: 567 } });
    return new Paragraph({ children: [run(m[2])], alignment: AlignmentType.JUSTIFIED, numbering: { reference: "sec", level: m[1].length }, spacing: { after: 80 } });
  });
}
const h1 = (t: string, pageBreak = false) => new Paragraph({
  children: [run(t.toUpperCase(), { b: true, sz: 11 })], numbering: { reference: "sec", level: 0 }, keepNext: true,
  pageBreakBefore: pageBreak, spacing: { before: 240, after: 120 },
});
const h2 = (t: string) => new Paragraph({ children: [run(t, { b: true })], numbering: { reference: "sec", level: 1 }, keepNext: true, spacing: { before: 160, after: 100 } });
/** Texto libre del registro AT: párrafos separados por línea en blanco; líneas sueltas como párrafos. */
const parrafosLibres = (t: string) => t.split(/\n+/).filter((x) => x.trim()).map((x) => new Paragraph({ children: [run(x.trim())], alignment: AlignmentType.JUSTIFIED, spacing: { after: 120 }, indent: { left: 567 } }));

export const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

export function nombreArchivoWord(a: { codigoAT: string; sistema: string; periodo: string; version: number }) {
  return `FOR-VAL-16-02_${sinAcentos(a.codigoAT)}_${sinAcentos(a.sistema)}_${sinAcentos(a.periodo)}_v${a.version}.docx`;
}

export async function generarWordForVal16(a: WordArgs): Promise<{ blob: Blob; archivo: string }> {
  const f = a.formato;
  const emitido = a.estado === "emitido";
  const areas = a.areas.length ? a.areas : [...new Set(a.bloques.map((b) => ubicacionTxt(b.ubicacion)))];
  const clases = [...new Set(a.bloques.map((b) => b.iso).filter(Boolean))].sort();
  const vars = { sistema: a.tituloSistema, periodo: a.periodo, areas: listaEs(areas) || "—", clases_iso: listaEs(clases) || "—" };

  // ---------- Encabezado ----------
  const logoBytes = await bytesDe(f.logo || logoDefault);
  const lt = await tamImagen(logoBytes);
  const logoH = 50, logoW = Math.round((lt.w / lt.h) * logoH);
  const c5 = [Math.round(W * 0.22), Math.round(W * 0.2), Math.round(W * 0.18), Math.round(W * 0.2)];
  c5.push(W - c5.reduce((x, y) => x + y, 0));
  const span = (i: number, n: number) => c5.slice(i, i + n).reduce((x, y) => x + y, 0);
  const headerTable = new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: c5,
    rows: [
      new TableRow({ children: [
        celda([new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: f.logo?.startsWith("data:image/png") ? "png" : "jpg", data: logoBytes, transformation: { width: Math.min(logoW, 140), height: logoH }, altText: { title: "Logo", description: "Logo DIAFRA", name: "logo" } })] })], c5[0]),
        celda([pc("DIAFRA S.A. de C.V.", { b: true, sz: 12 }), pc("ANÁLISIS DE TENDENCIAS", { b: true, sz: 11 })], span(1, 4), { span: 4 }),
      ] }),
      new TableRow({ children: [celda([pc(`Título: ${a.tituloSistema}`, { b: true, al: AlignmentType.LEFT })], W, { span: 5 })] }),
      new TableRow({ children: [celda([pc("DEPARTAMENTO: VALIDACIÓN", { b: true, al: AlignmentType.LEFT })], W, { span: 5 })] }),
      new TableRow({ children: ["Código del reporte", "Versión", "Sustituye a", "Fecha de aplicación", "Página"].map((t, i) => celda([pc(t, { b: true, sz: 8 })], c5[i], { head: true })) }),
      new TableRow({ children: [
        celda([pc(a.codigoAT)], c5[0]),
        celda([pc(emitido ? String(a.version).padStart(2, "0") : "Borrador")], c5[1]),
        celda([pc(a.sustituye || "N/A")], c5[2]),
        celda([pc(emitido && a.emitidoAt ? fmtDMY(a.emitidoAt.slice(0, 10)) : "—")], c5[3]),
        celda([new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], size: 18, font: FONT }),
        ] })], c5[4]),
      ] }),
    ],
  });
  const headerChildren: (Paragraph | Table)[] = [headerTable, new Paragraph({ children: [], spacing: { after: 60 } })];
  if (!emitido) {
    const wm = await marcaAgua();
    headerChildren.push(new Paragraph({ children: [new ImageRun({
      type: "png", data: wm, transformation: { width: 560, height: 560 }, altText: { title: "Borrador", description: "Marca de agua de borrador", name: "borrador" },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
        behindDocument: true, allowOverlap: true,
      },
    })] }));
  }

  const footer = new Footer({ children: [
    new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: "7F7F7F", space: 2 } }, children: [run(f.version_formato, { b: true, sz: 8 })] }),
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [run("Documento confidencial propiedad de Diafra S. A. de C. V. Queda prohibido su uso, divulgación y/o reproducción total o parcial sin previa autorización.", { sz: 7 })] }),
  ] });

  // ---------- Portada ----------
  const firmaCols = [Math.round(W * 0.46), Math.round(W * 0.27)];
  firmaCols.push(W - firmaCols[0] - firmaCols[1]);
  const portada: (Paragraph | Table)[] = [
    new Paragraph({ children: [], spacing: { before: 1200 } }),
    par("ANÁLISIS DE TENDENCIAS", { b: true, sz: 16, al: AlignmentType.CENTER, after: 240 }),
    par(a.tituloSistema, { b: true, sz: 13, al: AlignmentType.CENTER, after: 240 }),
    par(`Código: ${a.codigoAT}`, { b: true, sz: 12, al: AlignmentType.CENTER, after: 120 }),
    par(`Periodo: ${a.periodo} (${fmtDMY(a.desde)} – ${fmtDMY(a.hasta)})`, { sz: 11, al: AlignmentType.CENTER, after: 900 }),
    new Table({
      width: { size: W, type: WidthType.DXA }, columnWidths: firmaCols,
      rows: [
        new TableRow({ children: [celda([pc("Recuadro de firmas.", { b: true })], W, { span: 3, head: true })] }),
        new TableRow({ children: [celda([pc("El presente documento ha sido revisado en formato y contenido, y es aprobado para su emisión.", { sz: 9 })], W, { span: 3 })] }),
        new TableRow({ children: ["", "FIRMA", "FECHA"].map((t, i) => celda([pc(t, { b: true })], firmaCols[i], { head: true })) }),
        ...f.firmantes.map((s) => new TableRow({ cantSplit: true, height: { value: 1100, rule: "atLeast" }, children: [
          celda([pc(`${s.rol.toUpperCase()}:`, { b: true, al: AlignmentType.LEFT }), pc(s.nombre, { al: AlignmentType.LEFT }), pc(s.cargo, { al: AlignmentType.LEFT })], firmaCols[0]),
          celda([pc("")], firmaCols[1]), celda([pc("")], firmaCols[2]),
        ] })),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  // ---------- Cuerpo ----------
  const cuerpo: (Paragraph | Table)[] = [];
  cuerpo.push(h1("Objetivo."), ...parrafosPlantilla(f.textos.s1, vars));
  cuerpo.push(h1("Alcance."), ...parrafosLibres(a.texto.alcance));
  cuerpo.push(h1("Generalidades."), ...parrafosPlantilla(f.textos.s3, vars));

  // Tabla de especificaciones por clase ISO
  const filasClases = f.textos.tablaClases.split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((r) => r.some(Boolean));
  if (filasClases.length > 1) {
    const cuerpoCl = filasClases.slice(1);
    const presentes = cuerpoCl.filter((r) => clases.some((c) => r[0].replace(/\s/g, "").toUpperCase().includes(c.replace(/\s/g, "").toUpperCase())));
    const filas = [filasClases[0], ...(presentes.length ? presentes : cuerpoCl)];
    const n = filas[0].length;
    const ancho = Math.floor(W / n);
    cuerpo.push(par("Especificaciones normativas por clase ISO", { b: true, al: AlignmentType.CENTER, keep: true }));
    cuerpo.push(tablaSimple(filas.map((r) => Array.from({ length: n }, (_, i) => r[i] ?? "")), Array(n).fill(ancho), { keep: true }));
    cuerpo.push(new Paragraph({ children: [], spacing: { after: 160 } }));
  }
  // PPC y CQA's
  const vistos = new Set<string>();
  const ppc = a.bloques.filter((b) => { const k = `${b.codigo}|${b.variable}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  const anchosPPC = [Math.round(W * 0.18), Math.round(W * 0.16), Math.round(W * 0.30), Math.round(W * 0.18)];
  anchosPPC.push(W - anchosPPC.reduce((x, y) => x + y, 0));
  const rangoOp = (b: Bloque) => (b.opMin != null || b.opMax != null
    ? (b.opMin != null && b.opMax != null ? `${b.opMin} – ${b.opMax} ${b.unidad}` : b.opMin != null ? `≥ ${b.opMin} ${b.unidad}` : `≤ ${b.opMax} ${b.unidad}`) : "—");
  cuerpo.push(par("Variables de Control de Proceso (PPC) y CQA´s", { b: true, al: AlignmentType.CENTER, keep: true }));
  cuerpo.push(tablaSimple([["Variable", "Código de instrumento", "Ubicación", "Especificación normativa", "Rango de operación"],
    ...ppc.map((b) => [b.variable, b.codigo, ubicacionTxt(b.ubicacion), specTxt(b.lie, b.lse, b.unidad, b.specTexto) + (b.pendientes?.some((x) => x.startsWith("Especificación")) ? " (pendiente de validar)" : ""), rangoOp(b)])], anchosPPC));

  cuerpo.push(h1("Responsabilidades."), ...parrafosPlantilla(f.textos.s4, vars));
  cuerpo.push(h1("Abreviaturas, símbolos y definiciones."), ...parrafosPlantilla(f.textos.s5, vars));
  cuerpo.push(h1("Materiales, equipos e instrumentos."), ...parrafosPlantilla(f.textos.s6, vars));
  cuerpo.push(h1("Justificación."), ...parrafosPlantilla(f.textos.s7, vars));

  // §8 Resultados
  cuerpo.push(h1("Resultados.", true), h2("Registros analizados."));
  for (const l of a.texto.s81.split("\n").filter((x) => x.trim())) {
    cuerpo.push(new Paragraph({ children: [run(l.replace(/^\d+\.\s*/, ""))], numbering: { reference: "sec", level: 2 }, spacing: { after: 60 } }));
  }
  cuerpo.push(h2("Gráficas de tendencia y tablas de resultados."));
  let nG = 0, nT = 0;
  for (const b of a.bloques) {
    const imgs = await a.png(b);
    const titulo = `${b.codigo} · ${ubicacionTxt(b.ubicacion)} — ${b.variable}`;
    cuerpo.push(par(titulo, { b: true, al: AlignmentType.LEFT, keep: true, after: 60 }));
    if (b.pendientes?.length) cuerpo.push(par(`⚠ ${b.pendientes.join(" · ")}`, { sz: 9, al: AlignmentType.LEFT, keep: true, after: 60 }));
    for (let i = 0; i < imgs.length; i++) {
      const im = imgs[i];
      const data = await bytesDe(im.blob);
      cuerpo.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, children: [new ImageRun({
        type: "png", data, transformation: { width: 605, height: i === 1 ? 189 : 340 },
        altText: { title: im.nombre, description: titulo, name: im.nombre },
      })] }));
      nG++;
      cuerpo.push(par(`Gráfica ${nG}. ${i === 1 ? "Rangos (R) de " : ""}${b.codigo} — ${b.variable}, ${fmtDMY(a.desde)} – ${fmtDMY(a.hasta)}.`, { sz: 9, al: AlignmentType.CENTER, keep: true, after: 80 }));
    }
    cuerpo.push(tablaLimites(b));
    if (b.notaTabla) cuerpo.push(new Paragraph({ keepNext: true, children: [run(b.notaTabla, { sz: 8 })] }));
    nT++;
    cuerpo.push(par(`Tabla ${nT}. Límites, capacidad y dictamen de ${b.codigo} — ${b.variable}.`, { sz: 9, al: AlignmentType.CENTER, after: 240 }));
  }

  cuerpo.push(h1("Análisis de resultados."), ...parrafosLibres(a.texto.s9));
  cuerpo.push(h1("Desviaciones."), ...parrafosLibres(a.texto.s10));
  cuerpo.push(h1("Conclusión y dictamen."), ...parrafosLibres(a.texto.s11));
  cuerpo.push(h1("Referencias bibliográficas."), ...parrafosPlantilla(f.textos.s12, vars));

  cuerpo.push(h1("Control de cambios."));
  const anchosCC = [900, 900, 1500, 4272];
  anchosCC.push(W - anchosCC.reduce((x, y) => x + y, 0));
  cuerpo.push(tablaSimple([["De", "A", "Fecha", "Descripción del cambio", "Realizado por"],
    ...(a.cambios.length ? a.cambios.map((c) => [c.de, c.a, c.fecha, c.descripcion, c.por]) : [["—", "—", "—", "Sin versiones emitidas.", "—"]])], anchosCC));

  cuerpo.push(h1("Anexos."));
  const just = a.bloques.filter((b) => a.justificaciones[b.hoja]?.trim());
  if (just.length) {
    cuerpo.push(h2("Justificaciones técnicas por muestra insuficiente."));
    for (const b of just) {
      cuerpo.push(new Paragraph({ numbering: { reference: "sec", level: 2 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 80 },
        children: [run(`${b.codigo} — ${b.variable} (n = ${b.calidad.nSuficiencia}): `, { b: true }), run(a.justificaciones[b.hoja].trim())] }));
    }
  } else cuerpo.push(par("No aplica.", { al: AlignmentType.LEFT }));
  cuerpo.push(par("FIN DE ESTE DOCUMENTO.", { b: true, al: AlignmentType.CENTER }));

  const nivel = (lvl: number) => ({
    level: lvl, format: LevelFormat.DECIMAL,
    text: Array.from({ length: lvl + 1 }, (_, i) => `%${i + 1}`).join(".") + ".",
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 567 * (lvl + 1), hanging: lvl === 0 ? 567 : 567 + 120 * lvl } }, run: lvl === 0 ? { bold: true, font: FONT } : { font: FONT } },
  });

  const doc = new Document({
    creator: "DIAFRA S.A. de C.V.", title: `${a.codigoAT} ${a.tituloSistema}`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    numbering: { config: [{ reference: "sec", levels: [0, 1, 2, 3].map(nivel) }] },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134, header: 567, footer: 454 } } },
      headers: { default: new Header({ children: headerChildren }) },
      footers: { default: footer },
      children: [...portada, ...cuerpo],
    }],
  });
  const blob = await Packer.toBlob(doc);
  return { blob, archivo: nombreArchivoWord({ codigoAT: a.codigoAT, sistema: a.sistema, periodo: a.periodo, version: a.version }) };
}
