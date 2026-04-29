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
  CPK_WARN,
  CPK_FAIL,
  type AnalisisRegistro,
  type AgruparPor,
  type EstadisticaSerie,
} from "./normativo";
import { generarChartsRegistro } from "./chart-renderer";

type Catalogos = { areas: Map<string, string>; hvac: Map<string, string> };

function fechaArchivo() {
  return new Date().toISOString().slice(0, 10);
}

function num(v: number | null | undefined, d = 2) {
  return v != null && Number.isFinite(v) ? v.toFixed(d) : "—";
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
        Cp: s.cp != null ? Number(s.cp.toFixed(3)) : "",
        Cpk: s.cpk != null ? Number(s.cpk.toFixed(3)) : "",
        Ppk: s.ppk != null ? Number(s.ppk.toFixed(3)) : "",
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

  // ===== Portada =====
  doc.setFontSize(20).setFont("helvetica", "bold");
  doc.text("Reporte Normativo de Monitoreo Ambiental", pageW / 2, 80, { align: "center" });
  doc.setFontSize(14).setFont("helvetica", "normal");
  doc.text(`DIAFRA — ${periodo}`, pageW / 2, 110, { align: "center" });

  doc.setFontSize(10);
  const total = analisis.length;
  const cumplen = analisis.filter((a) => a.cumpleMinimo).length;
  const desv = analisis.filter((a) => a.series.some((s) => s.fueraSpec.total > 0)).length;
  const lecturas = analisis.reduce((s, a) => s + a.totalLecturas, 0);
  const noConformidades = detectarNoConformidades(analisis);
  const ncAltas = noConformidades.filter((n) => n.severidad === "alta").length;
  const ncMedias = noConformidades.filter((n) => n.severidad === "media").length;

  autoTable(doc, {
    startY: 160,
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
    margin: { left: 80, right: 80 },
  });

  // ===== Hoja de no conformidades =====
  doc.addPage();
  doc.setFontSize(15).setFont("helvetica", "bold");
  doc.text("Resumen de no conformidades (Poka-Yoke)", 40, 40);
  doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(90);
  doc.text(
    `Criterios: lecturas fuera de LIE/LSE · % dentro de spec < 95% · Cpk < ${CPK_WARN} (advertencia) · Cpk < ${CPK_FAIL} (crítico) · sin mínimo normativo (${MINIMO_NORMATIVO})`,
    40, 56,
  );
  doc.setTextColor(0);

  if (noConformidades.length === 0) {
    autoTable(doc, {
      startY: 80,
      head: [["Estado"]],
      body: [["✓ Sin no conformidades en el periodo analizado"]],
      theme: "grid",
      headStyles: { fillColor: [22, 163, 74], textColor: 255 },
      bodyStyles: { textColor: [22, 101, 52], fontStyle: "bold" },
      styles: { fontSize: 11, cellPadding: 8, halign: "center" },
    });
  } else {
    autoTable(doc, {
      startY: 80,
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
      didDrawPage: () => {
        doc.setFontSize(8).setTextColor(120);
        doc.text(`${periodo} · DIAFRA`, 40, pageH - 20);
        doc.text(`Página ${doc.getNumberOfPages()}`, pageW - 40, pageH - 20, { align: "right" });
        doc.setTextColor(0);
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

  const tieneDesgloseMensual = (a: AnalisisRegistro) => a.desgloseMensual.length >= 2;

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
      doc.text(`${g.etiqueta} · ${a.registro.nombre}`, 40, 40);
      doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(90);
      doc.text(
        `${a.rango.etiqueta} · ${a.totalLecturas} lecturas consolidadas (${a.porcentajeMinimo}% del mínimo ${MINIMO_NORMATIVO}) · ${a.cumpleMinimo ? "✓ cumple" : "✗ no cumple"}`,
        40, 56,
      );
      doc.setTextColor(0);

      // Tabla de stats consolidados del período completo
      autoTable(doc, {
        startY: 70,
        head: headStats,
        body: a.series.map(filaSerie),
        theme: "striped",
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3 },
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
        didDrawPage: () => {
          doc.setFontSize(8).setTextColor(120);
          doc.text(`${periodo} · DIAFRA`, 40, pageH - 20);
          doc.text(`Página ${doc.getNumberOfPages()}`, pageW - 40, pageH - 20, { align: "right" });
          doc.setTextColor(0);
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

      // Gráficas: una por fila (apiladas), ancho completo, según la plataforma
      if (incluirGraficas) {
        const margin = 40;
        const chartW = pageW - margin * 2; // ancho completo
        const chartH = 200;
        const sems = semanasDelPeriodo(a.registro, a.periodo);
        const charts = generarChartsRegistro(a.registro, sems, chartW, chartH);
        let yCursor = (doc as any).lastAutoTable.finalY + 20;
        for (const c of charts) {
          if (yCursor + chartH > pageH - 30) {
            doc.addPage();
            doc.setFontSize(11).setFont("helvetica", "bold");
            doc.text(`${a.registro.nombre} — gráficas`, 40, 40);
            yCursor = 56;
          }
          doc.addImage(c.dataUrl, "PNG", margin, yCursor, chartW, chartH);
          yCursor += chartH + 14;
        }
      }
    }
  }

  doc.save(`normativo-${periodo.replace(/\s+/g, "_")}-${fechaArchivo()}.pdf`);
}

