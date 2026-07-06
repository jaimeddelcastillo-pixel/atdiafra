// Exportadores PDF/Excel para el reporte normativo
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  MINIMO_NORMATIVO,
  N_MINIMO_CPK,
  etiquetaGrupo,
  claveGrupo,
  semanasDelPeriodo,
  detectarNoConformidades,
  tipoRegistroReporte,
  etiquetaTipoRegistro,
  tituloReporteDeModulos,
  CPK_WARN,
  CPK_FAIL,
  type AnalisisRegistro,
  type AgruparPor,
  type EstadisticaSerie,
} from "./normativo";
import { generarBloqueEstadisticoRegistro } from "./chart-renderer";
import { westernElectric } from "./statistics";
import diafraLogo from "@/assets/diafra-logo.jpg";

type Catalogos = { areas: Map<string, string>; hvac: Map<string, string> };

// ===== Identidad documental DIAFRA (formato controlado) =====
const DOC_CODIGO = "FOR-VAL-16";
const DOC_VERSION = "(01)";
const DOC_DEPARTAMENTO = "FORMATO — DEPARTAMENTO: VALIDACIÓN Y MONITOREO AMBIENTAL";
const DOC_TITULO_DEFAULT = "REPORTE NORMATIVO DE MONITOREO AMBIENTAL";
const DOC_FOOTER =
  "Documento confidencial propiedad de DIAFRA, S.A. de C.V., queda prohibido su uso, divulgación y/o reproducción total o parcial sin previa autorización.";
const DOC_NORMA = "Conforme a NOM-241-SSA1-2025 · ISO 14644 · FEUM 13ª Ed.";

// Márgenes reservados para encabezado y pie en cada página
const HEADER_H = 70;   // alto del encabezado
const FOOTER_H = 28;   // alto del pie
const TOP_Y = HEADER_H + 14; // y inicial seguro de contenido

function fechaArchivo() {
  return new Date().toISOString().slice(0, 10);
}

function num(v: number | null | undefined, d = 2) {
  return v != null && Number.isFinite(v) ? v.toFixed(d) : "—";
}

/** Dibuja encabezado corporativo (logo · título · código) y pie en cada página. */
function pintarEncabezadoPie(doc: jsPDF, periodo: string, titulo: string = DOC_TITULO_DEFAULT) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);

    // ===== ENCABEZADO =====
    // Marco general
    doc.setDrawColor(180).setLineWidth(0.5);
    doc.rect(20, 20, pageW - 40, HEADER_H - 20);

    // Columnas: logo (110) | título (centro) | código (140)
    const xLogo = 20;
    const wLogo = 110;
    const xCodigo = pageW - 20 - 140;
    const wCodigo = 140;

    // Líneas verticales separadoras
    doc.line(xLogo + wLogo, 20, xLogo + wLogo, HEADER_H);
    doc.line(xCodigo, 20, xCodigo, HEADER_H);

    // Logo
    try {
      doc.addImage(diafraLogo, "JPEG", xLogo + 10, 26, wLogo - 20, HEADER_H - 32);
    } catch {
      doc.setFontSize(11).setFont("helvetica", "bold").setTextColor(30, 64, 175);
      doc.text("DIAFRA", xLogo + wLogo / 2, 45, { align: "center" });
      doc.setFontSize(7).setFont("helvetica", "italic").setTextColor(100);
      doc.text("S.A. DE C.V.", xLogo + wLogo / 2, 55, { align: "center" });
      doc.setTextColor(0);
    }

    // Título central
    const xTit = xLogo + wLogo;
    const wTit = xCodigo - xTit;
    doc.setTextColor(0);
    doc.setFontSize(12).setFont("helvetica", "bold");
    doc.text("DIAFRA, S.A. DE C.V.", xTit + wTit / 2, 34, { align: "center" });
    doc.setFontSize(8).setFont("helvetica", "italic");
    doc.text(DOC_DEPARTAMENTO, xTit + wTit / 2, 46, { align: "center" });
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text(DOC_TITULO, xTit + wTit / 2, 60, { align: "center" });

    // Código (derecha)
    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.text("CÓDIGO", xCodigo + wCodigo / 2, 32, { align: "center" });
    doc.setFontSize(9).setFont("helvetica", "normal");
    doc.text(`${DOC_CODIGO} ${DOC_VERSION}`, xCodigo + wCodigo / 2, 46, { align: "center" });
    doc.setFontSize(8);
    doc.text(`Página ${i} de ${total}`, xCodigo + wCodigo / 2, 60, { align: "center" });

    // ===== PIE =====
    doc.setDrawColor(200).setLineWidth(0.3);
    doc.line(20, pageH - FOOTER_H, pageW - 20, pageH - FOOTER_H);

    doc.setFontSize(7).setFont("helvetica", "normal").setTextColor(80);
    doc.text(DOC_FOOTER, pageW / 2, pageH - 16, { align: "center" });
    doc.setFontSize(7).setTextColor(120);
    doc.text(`${DOC_NORMA} · Periodo: ${periodo}`, 22, pageH - 6);
    doc.text(
      `Generado: ${new Date().toLocaleString("es-MX")}`,
      pageW - 22,
      pageH - 6,
      { align: "right" },
    );
    doc.setTextColor(0);
  }
}

export function exportarNormativoExcel(
  analisis: AnalisisRegistro[],
  agrupar: AgruparPor,
  cat: Catalogos,
) {
  const wb = XLSX.utils.book_new();
  const periodo = analisis[0]?.rango.etiqueta ?? "Periodo";

  // Hoja 1: Resumen
  const resumen = analisis.map((a) => ({
    Grupo: etiquetaGrupo(a.registro, agrupar, cat),
    Registro: a.registro.nombre,
    Modulo: a.registro.modulo,
    ISO: a.registro.iso ?? "—",
    Periodo: a.rango.etiqueta,
    "Lecturas totales": a.totalLecturas,
    "Mínimo normativo": MINIMO_NORMATIVO,
    "% vs mínimo": a.porcentajeMinimo,
    Cumple: a.cumpleMinimo ? "SÍ" : "NO",
    Semanas: a.semanasPeriodo,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");

  // Hoja 2: Estadísticas
  const stats: Array<Record<string, unknown>> = [];
  for (const a of analisis) {
    for (const s of a.series) {
      stats.push({
        Registro: a.registro.nombre,
        Serie: s.serie,
        Unidad: s.unidad,
        n: s.n,
        Media: s.media != null ? Number(s.media.toFixed(3)) : "",
        "Desv. estándar": s.sd != null ? Number(s.sd.toFixed(3)) : "",
        Min: s.min ?? "",
        Max: s.max ?? "",
        P5: s.p5 != null ? Number(s.p5.toFixed(3)) : "",
        P95: s.p95 != null ? Number(s.p95.toFixed(3)) : "",
        Cp: s.cpkInsuficiente ? "n insuf." : s.cp != null ? Number(s.cp.toFixed(3)) : "",
        Cpk: s.cpkInsuficiente ? "n insuf." : s.cpk != null ? Number(s.cpk.toFixed(3)) : "",
        Ppk: s.cpkInsuficiente ? "n insuf." : s.ppk != null ? Number(s.ppk.toFixed(3)) : "",
        "n suficiente para Cpk": s.cpkInsuficiente ? `NO (n=${s.n}, mínimo ${N_MINIMO_CPK})` : "SÍ",
        "% dentro spec": s.pctDentroSpec != null ? Number(s.pctDentroSpec.toFixed(2)) : "",
        LIE: s.lie ?? "",
        LSE: s.lse ?? "",
        "Fuera spec (altos)": s.fueraSpec.altos,
        "Fuera spec (bajos)": s.fueraSpec.bajos,
        "Fuera spec total": s.fueraSpec.total,
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stats), "Estadísticas");

  // Hoja 3: No conformidades
  const nc = detectarNoConformidades(analisis).map((n) => ({
    Severidad: n.severidad.toUpperCase(),
    Registro: n.registroNombre,
    Serie: n.serie,
    Tipo: n.tipo,
    Detalle: n.detalle,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nc.length ? nc : [{ Estado: "Sin no conformidades" }]), "No conformidades");

  XLSX.writeFile(wb, `normativo-${periodo.replace(/\s+/g, "_")}-${fechaArchivo()}.xlsx`);
}

export function exportarNormativoPDF(
  analisis: AnalisisRegistro[],
  agrupar: AgruparPor,
  cat: Catalogos,
  opts: { incluirGraficas?: boolean } = {},
) {
  const incluirGraficas = opts.incluirGraficas !== false;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const periodo = analisis[0]?.rango.etiqueta ?? "Periodo";

  // Margen reservado en TODAS las tablas para no chocar con encabezado/pie
  const tableMargin = { top: TOP_Y, bottom: FOOTER_H + 8, left: 40, right: 40 };

  // ===== Portada =====
  doc.setFontSize(18).setFont("helvetica", "bold");
  doc.text("Reporte Normativo de Monitoreo Ambiental", pageW / 2, TOP_Y + 30, { align: "center" });
  doc.setFontSize(13).setFont("helvetica", "normal");
  doc.text(`DIAFRA, S.A. de C.V. — ${periodo}`, pageW / 2, TOP_Y + 56, { align: "center" });

  doc.setFontSize(10);
  const total = analisis.length;
  const cumplen = analisis.filter((a) => a.cumpleMinimo).length;
  const desv = analisis.filter((a) => a.series.some((s) => s.fueraSpec.total > 0)).length;
  const lecturas = analisis.reduce((s, a) => s + a.totalLecturas, 0);
  const noConformidades = detectarNoConformidades(analisis);
  const ncAltas = noConformidades.filter((n) => n.severidad === "alta").length;
  const ncMedias = noConformidades.filter((n) => n.severidad === "media").length;

  autoTable(doc, {
    startY: TOP_Y + 80,
    head: [["Indicador", "Valor"]],
    body: [
      ["Mínimo normativo por registro", `${MINIMO_NORMATIVO} lecturas`],
      ["Registros analizados", String(total)],
      ["Cumplen mínimo", `${cumplen} / ${total} (${total ? Math.round((cumplen / total) * 100) : 0}%)`],
      ["Con fuera de especificación", String(desv)],
      ["No conformidades detectadas", `${noConformidades.length} (${ncAltas} críticas / ${ncMedias} advertencias)`],
      ["Total de lecturas capturadas", lecturas.toLocaleString("es-MX")],
      ["Generado", new Date().toLocaleString("es-MX")],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { ...tableMargin, left: 80, right: 80 },
  });

  // ===== Hoja de no conformidades =====
  doc.addPage();
  doc.setFontSize(14).setFont("helvetica", "bold");
  doc.text("Resumen de no conformidades (Poka-Yoke)", 40, TOP_Y + 6);
  doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(90);
  doc.text(
    `Criterios: lecturas fuera de LIE/LSE · % dentro de spec < 95% · Cpk < ${CPK_WARN} (advertencia) · Cpk < ${CPK_FAIL} (crítico) · sin mínimo normativo (${MINIMO_NORMATIVO})`,
    40, TOP_Y + 22,
  );
  doc.setTextColor(0);

  if (noConformidades.length === 0) {
    autoTable(doc, {
      startY: TOP_Y + 40,
      head: [["Estado"]],
      body: [["✓ Sin no conformidades en el periodo analizado"]],
      theme: "grid",
      headStyles: { fillColor: [22, 163, 74], textColor: 255 },
      bodyStyles: { textColor: [22, 101, 52], fontStyle: "bold" },
      styles: { fontSize: 11, cellPadding: 8, halign: "center" },
      margin: tableMargin,
    });
  } else {
    autoTable(doc, {
      startY: TOP_Y + 40,
      head: [["Sev.", "Registro", "Serie", "Tipo", "Detalle"]],
      body: noConformidades.map((n) => [
        n.severidad === "alta" ? "ALTA" : "MEDIA",
        n.registroNombre,
        n.serie,
        ({ fuera_spec: "Fuera spec", cpk_bajo: "Cpk bajo", pct_bajo: "% bajo", sin_minimo: "Sin mínimo" } as const)[n.tipo],
        n.detalle,
      ]),
      theme: "striped",
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 4 },
      margin: tableMargin,
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const sev = String(data.cell.raw);
          if (sev === "ALTA") {
            data.cell.styles.fillColor = [220, 38, 38];
            data.cell.styles.textColor = 255;
            data.cell.styles.fontStyle = "bold";
          } else {
            data.cell.styles.fillColor = [251, 191, 36];
            data.cell.styles.textColor = [69, 26, 3];
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
  }

  // ===== Agrupados =====
  const grupos = new Map<string, { etiqueta: string; items: AnalisisRegistro[] }>();
  for (const a of analisis) {
    const k = claveGrupo(a.registro, agrupar);
    const et = etiquetaGrupo(a.registro, agrupar, cat);
    const cur = grupos.get(k);
    if (cur) cur.items.push(a);
    else grupos.set(k, { etiqueta: et, items: [a] });
  }

  // Color por Cpk
  const colorCpk = (cpk: number | null): [number, number, number] | null => {
    if (cpk == null) return null;
    if (cpk < CPK_FAIL) return [220, 38, 38];
    if (cpk < CPK_WARN) return [251, 191, 36];
    return [22, 163, 74];
  };

  const filaSerie = (s: EstadisticaSerie): string[] => {
    const cpkTxt = s.cpkInsuficiente
      ? `n insuf. (${s.n}<${N_MINIMO_CPK})`
      : `${num(s.cp)} / ${num(s.cpk)} / ${num(s.ppk)}`;
    return [
      `${s.serie} ${s.unidad}`.trim(),
      String(s.n),
      num(s.media),
      num(s.sd),
      `${num(s.min)} / ${num(s.max)}`,
      `${num(s.p5)} / ${num(s.p95)}`,
      cpkTxt,
      s.pctDentroSpec != null ? `${s.pctDentroSpec.toFixed(1)}%` : "—",
      `${s.lie ?? "—"} / ${s.lse ?? "—"}`,
      s.fueraSpec.total === 0 ? "0" : `${s.fueraSpec.total} (${s.fueraSpec.altos}↑ ${s.fueraSpec.bajos}↓)`,
    ];
  };

  const headStats = [
    ["Serie", "n", "Media", "σ", "Mín / Máx", "P5 / P95", "Cp / Cpk / Ppk", "% spec", "LIE / LSE", "Fuera spec"],
  ];

  for (const g of Array.from(grupos.values()).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))) {
    for (const a of g.items) {
      // Una página por instrumento/registro (consolidado del período completo)
      doc.addPage();
      doc.setFontSize(13).setFont("helvetica", "bold");
      doc.text(`${g.etiqueta} · ${a.registro.nombre}`, 40, TOP_Y + 6);
      doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(90);
      doc.text(
        `${a.rango.etiqueta} · ${a.totalLecturas} lecturas consolidadas (${a.porcentajeMinimo}% del mínimo ${MINIMO_NORMATIVO}) · ${a.cumpleMinimo ? "✓ cumple" : "✗ no cumple"}`,
        40, TOP_Y + 22,
      );
      doc.setTextColor(0);

      // Tabla de stats consolidados del período completo
      autoTable(doc, {
        startY: TOP_Y + 36,
        head: headStats,
        body: a.series.map(filaSerie),
        theme: "striped",
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3 },
        margin: tableMargin,
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 6) {
            const s = a.series[data.row.index];
            if (s.cpkInsuficiente) {
              data.cell.styles.fillColor = [226, 232, 240];
              data.cell.styles.textColor = [71, 85, 105];
              data.cell.styles.fontStyle = "italic";
            } else {
              const c = colorCpk(s.cpk);
              if (c) {
                data.cell.styles.fillColor = c;
                data.cell.styles.textColor = 255;
                data.cell.styles.fontStyle = "bold";
              }
            }
          }
          if (data.section === "body" && data.column.index === 9) {
            const s = a.series[data.row.index];
            if (s.fueraSpec.total > 0) {
              data.cell.styles.fillColor = [254, 226, 226];
              data.cell.styles.textColor = [153, 27, 27];
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
      });

      // Nota cuando hay series con n insuficiente
      const seriesInsuf = a.series.filter((s) => s.cpkInsuficiente);
      if (seriesInsuf.length > 0) {
        const yNota = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(8).setFont("helvetica", "italic").setTextColor(120);
        doc.text(
          `Nota: Cp/Cpk no se reportan cuando n < ${N_MINIMO_CPK} lecturas consolidadas (no son estadísticamente confiables).`,
          40, yNota,
        );
        doc.setTextColor(0).setFont("helvetica", "normal");
      }

      // Gráficas + control estadístico por serie
      if (incluirGraficas) {
        const margin = 40;
        const chartW = pageW - margin * 2;
        const chartH = 200;
        const sems = semanasDelPeriodo(a.registro, a.periodo);
        const bloque = generarBloqueEstadisticoRegistro(a.registro, sems, chartW, chartH);
        let yCursor = (doc as any).lastAutoTable.finalY + 16;

        const nuevaPagina = (titulo: string) => {
          doc.addPage();
          doc.setFontSize(11).setFont("helvetica", "bold");
          doc.text(titulo, 40, TOP_Y + 6);
          return TOP_Y + 22;
        };
        const asegurarEspacio = (alto: number) => {
          if (yCursor + alto > pageH - FOOTER_H - 8) {
            yCursor = nuevaPagina(`${a.registro.nombre} — gráficas`);
          }
        };

        for (const b of bloque) {
          // Título de serie
          asegurarEspacio(20);
          doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(30, 41, 59);
          doc.text(`${b.serie}`, margin, yCursor);
          doc.setTextColor(0).setFont("helvetica", "normal");
          yCursor += 8;

          // Gráfica 1
          asegurarEspacio(chartH + 6);
          doc.addImage(b.chartSpecUrl, "PNG", margin, yCursor, chartW, chartH);
          yCursor += chartH + 8;

          // Gráfica 2
          asegurarEspacio(chartH + 6);
          doc.addImage(b.chartAlertUrl, "PNG", margin, yCursor, chartW, chartH);
          yCursor += chartH + 8;

          const dec = b.decimales;
          const fnum = (v: number | null) =>
            v != null && Number.isFinite(v) ? v.toFixed(dec) : "—";

          if (b.statsSuficientes) {
            // Tabla de límites
            asegurarEspacio(60);
            autoTable(doc, {
              startY: yCursor,
              head: [["Variable", "Media", "σ", "LC", "LAS", "LAI", "LACS", "LACI", "LIE", "LSE"]],
              body: [[
                b.serie,
                fnum(b.media), fnum(b.sigma),
                fnum(b.lc), fnum(b.las), fnum(b.lai),
                fnum(b.lacs), fnum(b.laci),
                fnum(b.lie), fnum(b.lse),
              ]],
              theme: "grid",
              headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8 },
              styles: { fontSize: 8, cellPadding: 3, halign: "center" },
              margin: { left: margin, right: margin, top: TOP_Y, bottom: FOOTER_H + 8 },
            });
            yCursor = (doc as any).lastAutoTable.finalY + 8;

            // Conclusión automática
            const hits = westernElectric(b.values, b.media as number, b.sigma as number);
            const fueraAccion = b.values.some(
              (v) => v > (b.lacs as number) || v < (b.laci as number),
            );
            const fueraAlerta = b.values.some(
              (v) => v > (b.las as number) || v < (b.lai as number),
            );
            let texto: string;
            let color: [number, number, number];
            if (fueraAccion || hits.length > 0) {
              texto = "Proceso fuera de control estadístico";
              color = [220, 38, 38];
            } else if (fueraAlerta) {
              texto = "Proceso en alerta estadística";
              color = [217, 119, 6];
            } else {
              texto = "Proceso bajo control estadístico";
              color = [22, 163, 74];
            }
            asegurarEspacio(28);
            doc.setFillColor(color[0], color[1], color[2]);
            doc.rect(margin, yCursor, chartW, 14, "F");
            doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(10);
            doc.text(texto, margin + 6, yCursor + 10);
            doc.setTextColor(0).setFont("helvetica", "normal");
            yCursor += 18;

            doc.setFontSize(7.5).setTextColor(120).setFont("helvetica", "italic");
            doc.text(
              "La conclusión estadística evalúa el control del proceso y no sustituye el cumplimiento normativo LIE/LSE.",
              margin, yCursor,
            );
            doc.setTextColor(0).setFont("helvetica", "normal");
            yCursor += 14;
          } else {
            asegurarEspacio(24);
            doc.setFontSize(9).setFont("helvetica", "italic").setTextColor(120);
            doc.text("n insuficiente para control estadístico", margin, yCursor + 6);
            doc.setTextColor(0).setFont("helvetica", "normal");
            yCursor += 16;
            doc.setFontSize(7.5).setTextColor(120).setFont("helvetica", "italic");
            doc.text(
              "La conclusión estadística evalúa el control del proceso y no sustituye el cumplimiento normativo LIE/LSE.",
              margin, yCursor,
            );
            doc.setTextColor(0).setFont("helvetica", "normal");
            yCursor += 14;
          }
        }
      }
    }
  }

  // Pintar encabezado y pie en TODAS las páginas al final
  pintarEncabezadoPie(doc, periodo);

  doc.save(`normativo-${periodo.replace(/\s+/g, "_")}-${fechaArchivo()}.pdf`);
}

