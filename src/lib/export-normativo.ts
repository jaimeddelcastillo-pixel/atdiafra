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
  evaluarLote,
  ETIQUETA_CONTROL,
  ETIQUETA_CAPACIDAD,
  ETIQUETA_CATEGORIA,
  tipoRegistroReporte,
  etiquetaTipoRegistro,
  tituloReporteDeModulos,
  CPK_WARN,
  CPK_FAIL,
  type AnalisisRegistro,
  type AgruparPor,
  type EstadisticaSerie,
  type Hallazgo,
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
    doc.text(titulo, xTit + wTit / 2, 60, { align: "center" });

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
    Tipo: etiquetaTipoRegistro(tipoRegistroReporte(a.registro)),
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
        Pp: s.cpkInsuficiente ? "n insuf." : s.pp != null ? Number(s.pp.toFixed(3)) : "",
        Ppk: s.cpkInsuficiente ? "n insuf." : s.ppk != null ? Number(s.ppk.toFixed(3)) : "",
        "σ corto plazo (R̄/d₂)": s.sigmaCP != null ? Number(s.sigmaCP.toFixed(3)) : "",
        "σ largo plazo (s)": s.sigmaLP != null ? Number(s.sigmaLP.toFixed(3)) : "",
        "Subgrupos (día)": s.carta?.subgrupos ?? "",
        "n suficiente para Cpk": s.cpkInsuficiente ? `NO (n=${s.nCapacidad}, mínimo ${N_MINIMO_CPK})` : s.notaCpk ?? "SÍ",
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

  // Hoja 3: Evaluación tri-dimensional por registro
  const { evaluaciones, resumen: resumenEval } = evaluarLote(analisis);
  const evalRows = evaluaciones.map((e) => ({
    Registro: e.analisis.registro.nombre,
    Cumplimiento: e.cumplimiento === "cumple" ? "Cumple" : "No conforme",
    Control: ETIQUETA_CONTROL[e.control],
    Capacidad: ETIQUETA_CAPACIDAD[e.capacidad],
    Estado: e.estadoGlobal === "conforme" ? "Conforme"
          : e.estadoGlobal === "conforme_con_alertas" ? "Conforme con alertas"
          : "No conforme",
    "No conformidades": e.hallazgos.filter((h) => h.categoria === "no_conformidad").length,
    "Alertas estadísticas": e.hallazgos.filter((h) => h.categoria === "alerta_estadistica").length,
    Observaciones: e.hallazgos.filter((h) => h.categoria === "observacion").length,
    Conclusión: e.conclusion,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(evalRows), "Evaluación");

  // Hoja 4: Hallazgos (categorizados)
  const filaHallazgo = (h: Hallazgo) => ({
    Categoría: ETIQUETA_CATEGORIA[h.categoria],
    Severidad: h.severidad.toUpperCase(),
    Dimensión: h.dimension,
    Registro: h.registroNombre,
    Serie: h.serie,
    Título: h.titulo,
    Detalle: h.detalle,
    "Acción sugerida": h.accionSugerida,
  });
  const nc = resumenEval.noConformidades.map(filaHallazgo);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(nc.length ? nc : [{ Estado: "Sin no conformidades" }]),
    "No conformidades",
  );
  const alertas = resumenEval.alertas.map(filaHallazgo);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(alertas.length ? alertas : [{ Estado: "Sin alertas estadísticas" }]),
    "Alertas estadísticas",
  );
  const observ = resumenEval.observaciones.map(filaHallazgo);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(observ.length ? observ : [{ Estado: "Sin observaciones" }]),
    "Observaciones",
  );

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
  const tituloDoc = tituloReporteDeModulos(analisis.map((a) => a.registro.modulo));
  // Título de portada en mayúsculas y minúsculas (mismo texto, sin CAPS).
  const tituloPortada = tituloDoc
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase());

  // Margen reservado en TODAS las tablas para no chocar con encabezado/pie
  const tableMargin = { top: TOP_Y, bottom: FOOTER_H + 8, left: 40, right: 40 };

  // ===== Portada =====
  doc.setFontSize(18).setFont("helvetica", "bold");
  doc.text(tituloPortada, pageW / 2, TOP_Y + 30, { align: "center" });
  doc.setFontSize(13).setFont("helvetica", "normal");
  doc.text(`DIAFRA, S.A. de C.V. — ${periodo}`, pageW / 2, TOP_Y + 56, { align: "center" });

  doc.setFontSize(10);
  const total = analisis.length;
  const cumplen = analisis.filter((a) => a.cumpleMinimo).length;
  const desv = analisis.filter((a) => a.series.some((s) => s.fueraSpec.total > 0)).length;
  const lecturas = analisis.reduce((s, a) => s + a.totalLecturas, 0);
  const { evaluaciones, resumen: resumenEval } = evaluarLote(analisis);
  const nHallazgosNC = resumenEval.noConformidades.length;
  const nAlertas = resumenEval.alertas.length;
  const nObserv = resumenEval.observaciones.length;

  autoTable(doc, {
    startY: TOP_Y + 80,
    head: [["Indicador", "Valor"]],
    body: [
      ["Mínimo normativo por registro", `${MINIMO_NORMATIVO} lecturas`],
      ["Registros analizados", String(total)],
      ["Registros conformes (cumplen normativo)", `${resumenEval.conformes + resumenEval.conformesConAlerta} / ${total}`],
      ["  · Conformes sin alertas", String(resumenEval.conformes)],
      ["  · Conformes con alertas estadísticas", String(resumenEval.conformesConAlerta)],
      ["Registros no conformes", String(resumenEval.noConformes)],
      ["Con fuera de especificación", String(desv)],
      ["Cumplen mínimo de lecturas", `${cumplen} / ${total} (${total ? Math.round((cumplen / total) * 100) : 0}%)`],
      ["No conformidades (LIE/LSE, mínimo normativo)", String(nHallazgosNC)],
      ["Alertas estadísticas (WE, Cpk)", String(nAlertas)],
      ["Observaciones", String(nObserv)],
      ["Total de lecturas capturadas", lecturas.toLocaleString("es-MX")],
      ["Generado", new Date().toLocaleString("es-MX")],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { ...tableMargin, left: 80, right: 80 },
  });

  // Nota metodológica en portada
  const yNota = (doc as any).lastAutoTable.finalY + 12;
  doc.setFontSize(8).setFont("helvetica", "italic").setTextColor(90);
  doc.text(
    "Metodología tri-dimensional: (1) Cumplimiento normativo — sólo lecturas fuera de LIE/LSE o incumplir el mínimo generan No Conformidad.",
    88, yNota,
  );
  doc.text(
    "(2) Control estadístico (Western Electric) y (3) Capacidad (Cpk) son dimensiones informativas: originan Alertas u Observaciones, no NC.",
    88, yNota + 10,
  );
  doc.setTextColor(0).setFont("helvetica", "normal");

  // ===== Hoja de hallazgos categorizados =====
  const renderHallazgos = (titulo: string, items: Hallazgo[], color: [number, number, number], vacio: string) => {
    doc.addPage();
    doc.setFontSize(14).setFont("helvetica", "bold");
    doc.text(titulo, 40, TOP_Y + 6);
    doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(90);
    doc.text(`${items.length} elemento(s)`, 40, TOP_Y + 22);
    doc.setTextColor(0);

    if (items.length === 0) {
      autoTable(doc, {
        startY: TOP_Y + 40,
        head: [["Estado"]],
        body: [[vacio]],
        theme: "grid",
        headStyles: { fillColor: [22, 163, 74], textColor: 255 },
        bodyStyles: { textColor: [22, 101, 52], fontStyle: "bold" },
        styles: { fontSize: 11, cellPadding: 8, halign: "center" },
        margin: tableMargin,
      });
      return;
    }
    autoTable(doc, {
      startY: TOP_Y + 40,
      head: [["Sev.", "Dimensión", "Registro", "Serie", "Hallazgo", "Detalle / Acción sugerida"]],
      body: items.map((h) => [
        h.severidad.toUpperCase(),
        h.dimension,
        h.registroNombre,
        h.serie,
        h.titulo,
        `${h.detalle}\n→ ${h.accionSugerida}`,
      ]),
      theme: "striped",
      headStyles: { fillColor: color, textColor: 255, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 4, valign: "top" },
      columnStyles: { 5: { cellWidth: "auto" } },
      margin: tableMargin,
    });
  };

  renderHallazgos(
    "No conformidades (incumplimiento normativo LIE/LSE o mínimo)",
    resumenEval.noConformidades,
    [220, 38, 38],
    "✓ Sin no conformidades en el periodo analizado",
  );
  renderHallazgos(
    "Alertas estadísticas (Western Electric / Capacidad Cpk)",
    resumenEval.alertas,
    [217, 119, 6],
    "✓ Sin alertas estadísticas — proceso bajo control y capaz",
  );
  if (resumenEval.observaciones.length > 0) {
    renderHallazgos(
      "Observaciones",
      resumenEval.observaciones,
      [37, 99, 235],
      "Sin observaciones",
    );
  }
  void evaluaciones; // Reservado para futura tabla comparativa por registro.

  // ===== Agrupados (separando registros por área/par de cuartos vs instrumentos independientes) =====
  const construirGrupos = (items: AnalisisRegistro[]) => {
    const g = new Map<string, { etiqueta: string; items: AnalisisRegistro[] }>();
    for (const a of items) {
      const k = claveGrupo(a.registro, agrupar);
      const et = etiquetaGrupo(a.registro, agrupar, cat);
      const cur = g.get(k);
      if (cur) cur.items.push(a);
      else g.set(k, { etiqueta: et, items: [a] });
    }
    return Array.from(g.values()).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
  };
  const analisisAreas = analisis.filter((a) => tipoRegistroReporte(a.registro) !== "instrumento");
  const analisisInstrumentos = analisis.filter((a) => tipoRegistroReporte(a.registro) === "instrumento");
  const secciones: Array<{ titulo: string; grupos: ReturnType<typeof construirGrupos> }> = [];
  if (analisisAreas.length > 0) {
    secciones.push({ titulo: "Registros por área / par de cuartos", grupos: construirGrupos(analisisAreas) });
  }
  if (analisisInstrumentos.length > 0) {
    secciones.push({ titulo: "Registros por instrumento independiente", grupos: construirGrupos(analisisInstrumentos) });
  }

  // Color por Cpk — jamás en rojo: capacidad baja/marginal es alerta (ámbar).
  // El rojo se reserva a incumplimiento normativo real (fuera de LIE/LSE).
  const colorCpk = (cpk: number | null): [number, number, number] | null => {
    if (cpk == null) return null;
    if (cpk < CPK_WARN) return [251, 191, 36]; // ámbar (alerta) para Cpk < 1.33
    return [22, 163, 74];
  };

  const filaSerie = (s: EstadisticaSerie): string[] => {
    const cpkTxt = s.cpkInsuficiente
      ? `n insuf. (${s.nCapacidad}<${N_MINIMO_CPK})`
      : `${num(s.cp)} / ${num(s.cpk)} / ${num(s.pp)} / ${num(s.ppk)}${s.notaCpk ? ` (${s.notaCpk})` : ""}`;
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
    ["Serie", "n", "Media", "σ", "Mín / Máx", "P5 / P95", "Cp / Cpk / Pp / Ppk", "% spec", "LIE / LSE", "Fuera spec"],
  ];

  for (const seccion of secciones) {
    // Página divisoria de sección (solo si hay más de una sección)
    if (secciones.length > 1) {
      doc.addPage();
      doc.setFontSize(20).setFont("helvetica", "bold").setTextColor(30, 64, 175);
      doc.text(seccion.titulo, pageW / 2, pageH / 2 - 10, { align: "center" });
      doc.setFontSize(11).setFont("helvetica", "normal").setTextColor(90);
      const nRegs = seccion.grupos.reduce((s, g) => s + g.items.length, 0);
      doc.text(`${nRegs} registro(s) en esta sección`, pageW / 2, pageH / 2 + 14, { align: "center" });
      doc.setTextColor(0);
    }
  for (const g of seccion.grupos) {
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
          `Nota: Cp/Cpk no se reportan con menos de ${N_MINIMO_CPK} subgrupos (T/HR) o lecturas (PNO-VAL-16 Tabla 2); 20–24 = Aceptable.`,
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

            // Conclusión contextual (no alarmista si no hay incumplimiento normativo)
            const hits = westernElectric(b.values, b.media as number, b.sigma as number);
            const hayOOSSerie = b.values.some(
              (v) => (b.lse != null && v > b.lse) || (b.lie != null && v < b.lie),
            );
            const fueraAccion = b.values.some(
              (v) => v > (b.lacs as number) || v < (b.laci as number),
            );
            const fueraAlerta = b.values.some(
              (v) => v > (b.las as number) || v < (b.lai as number),
            );
            let texto: string;
            let color: [number, number, number];
            if (hayOOSSerie) {
              // NC real por incumplimiento LIE/LSE → único caso rojo.
              texto = "No conformidad — lecturas fuera de especificación";
              color = [220, 38, 38];
            } else if (fueraAccion || hits.length > 0) {
              // Sin incumplimiento normativo pero con señales estadísticas.
              texto = "Control estadístico comprometido — proceso conforme, requiere seguimiento";
              color = [217, 119, 6];
            } else if (fueraAlerta) {
              texto = "Proceso en observación — dentro de especificación";
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
              "El control estadístico y la capacidad son informativos; la No Conformidad se origina únicamente por incumplimiento normativo (LIE/LSE o mínimo).",
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
  }

  // Pintar encabezado y pie en TODAS las páginas al final
  pintarEncabezadoPie(doc, periodo, tituloDoc);

  doc.save(`normativo-${periodo.replace(/\s+/g, "_")}-${fechaArchivo()}.pdf`);
}

