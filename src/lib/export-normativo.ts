// Exportadores PDF/Excel para el reporte normativo
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  MINIMO_NORMATIVO,
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
        LIE: s.lie ?? "",
        LSE: s.lse ?? "",
        "Fuera spec (altos)": s.fueraSpec.altos,
        "Fuera spec (bajos)": s.fueraSpec.bajos,
        "Fuera spec total": s.fueraSpec.total,
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stats), "Estadísticas");

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

  const filaSerie = (s: EstadisticaSerie): string[] => [
    `${s.serie} ${s.unidad}`.trim(),
    String(s.n),
    num(s.media),
    num(s.sd),
    `${num(s.min)} / ${num(s.max)}`,
    `${num(s.p5)} / ${num(s.p95)}`,
    `${num(s.cp)} / ${num(s.cpk)} / ${num(s.ppk)}`,
    s.pctDentroSpec != null ? `${s.pctDentroSpec.toFixed(1)}%` : "—",
    `${s.lie ?? "—"} / ${s.lse ?? "—"}`,
    s.fueraSpec.total === 0 ? "0" : `${s.fueraSpec.total} (${s.fueraSpec.altos}↑ ${s.fueraSpec.bajos}↓)`,
  ];

  const headStats = [
    ["Serie", "n", "Media", "σ", "Mín / Máx", "P5 / P95", "Cp / Cpk / Ppk", "% spec", "LIE / LSE", "Fuera spec"],
  ];

  for (const g of Array.from(grupos.values()).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))) {
    for (const a of g.items) {
      doc.addPage();
      doc.setFontSize(13).setFont("helvetica", "bold");
      doc.text(`${g.etiqueta} · ${a.registro.nombre}`, 40, 40);
      doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(90);
      doc.text(
        `${a.rango.etiqueta} · ${a.totalLecturas} lecturas (${a.porcentajeMinimo}% del mínimo) · ${a.cumpleMinimo ? "✓ cumple" : "✗ no cumple"}`,
        40, 56,
      );
      doc.setTextColor(0);

      // Tabla de stats del periodo total
      autoTable(doc, {
        startY: 70,
        head: headStats,
        body: a.series.map(filaSerie),
        theme: "striped",
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3 },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 6) {
            // Cp / Cpk / Ppk → colorear por Cpk (segundo valor)
            const s = a.series[data.row.index];
            const c = colorCpk(s.cpk);
            if (c) {
              data.cell.styles.fillColor = c;
              data.cell.styles.textColor = 255;
              data.cell.styles.fontStyle = "bold";
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

      // Desglose mensual (si hay 2+ meses, e.g. trimestre/anual/custom largo)
      if (tieneDesgloseMensual(a)) {
        let yMes = (doc as any).lastAutoTable.finalY + 18;
        if (yMes > pageH - 120) { doc.addPage(); yMes = 50; }
        doc.setFontSize(11).setFont("helvetica", "bold");
        doc.text("Desglose mensual", 40, yMes);
        const filasMes: string[][] = [];
        for (const m of a.desgloseMensual) {
          for (let i = 0; i < m.series.length; i++) {
            const s = m.series[i];
            filasMes.push([
              i === 0 ? m.etiqueta : "",
              i === 0 ? String(m.totalLecturas) : "",
              ...filaSerie(s),
            ]);
          }
        }
        autoTable(doc, {
          startY: yMes + 8,
          head: [["Mes", "Lect.", ...headStats[0]]],
          body: filasMes,
          theme: "grid",
          headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7 },
          styles: { fontSize: 7, cellPadding: 2 },
        });
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

