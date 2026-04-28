// Exportadores PDF/Excel para el reporte normativo
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  MINIMO_NORMATIVO,
  etiquetaGrupo,
  claveGrupo,
  semanasDelPeriodo,
  type AnalisisRegistro,
  type AgruparPor,
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

  // Portada
  doc.setFontSize(20).setFont("helvetica", "bold");
  doc.text("Reporte Normativo de Monitoreo Ambiental", pageW / 2, 80, { align: "center" });
  doc.setFontSize(14).setFont("helvetica", "normal");
  doc.text(`DIAFRA — ${periodo}`, pageW / 2, 110, { align: "center" });

  doc.setFontSize(10);
  const total = analisis.length;
  const cumplen = analisis.filter((a) => a.cumpleMinimo).length;
  const desv = analisis.filter((a) => a.series.some((s) => s.fueraSpec.total > 0)).length;
  const lecturas = analisis.reduce((s, a) => s + a.totalLecturas, 0);

  autoTable(doc, {
    startY: 160,
    head: [["Indicador", "Valor"]],
    body: [
      ["Mínimo normativo por registro", `${MINIMO_NORMATIVO} lecturas`],
      ["Registros analizados", String(total)],
      ["Cumplen mínimo", `${cumplen} / ${total} (${total ? Math.round((cumplen / total) * 100) : 0}%)`],
      ["Con fuera de especificación", String(desv)],
      ["Total de lecturas capturadas", lecturas.toLocaleString("es-MX")],
      ["Generado", new Date().toLocaleString("es-MX")],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { left: 80, right: 80 },
  });

  // Agrupados
  const grupos = new Map<string, { etiqueta: string; items: AnalisisRegistro[] }>();
  for (const a of analisis) {
    const k = claveGrupo(a.registro, agrupar);
    const et = etiquetaGrupo(a.registro, agrupar, cat);
    const cur = grupos.get(k);
    if (cur) cur.items.push(a);
    else grupos.set(k, { etiqueta: et, items: [a] });
  }

  for (const g of Array.from(grupos.values()).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))) {
    doc.addPage();
    doc.setFontSize(13).setFont("helvetica", "bold");
    doc.text(g.etiqueta, 40, 40);

    const body: string[][] = [];
    for (const a of g.items) {
      for (let i = 0; i < a.series.length; i++) {
        const s = a.series[i];
        body.push([
          i === 0 ? a.registro.nombre : "",
          i === 0 ? String(a.totalLecturas) : "",
          i === 0 ? `${a.porcentajeMinimo}%` : "",
          i === 0 ? (a.cumpleMinimo ? "✓" : "✗") : "",
          `${s.serie} ${s.unidad}`,
          num(s.media),
          num(s.sd),
          num(s.min),
          num(s.max),
          `${s.lie ?? "—"} / ${s.lse ?? "—"}`,
          s.fueraSpec.total === 0 ? "0" : `${s.fueraSpec.total} (${s.fueraSpec.altos}↑ ${s.fueraSpec.bajos}↓)`,
        ]);
      }
    }

    autoTable(doc, {
      startY: 60,
      head: [["Registro", "Lecturas", "% min", "Cumple", "Serie", "Media", "σ", "Min", "Max", "LIE/LSE", "Fuera spec"]],
      body,
      theme: "striped",
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 3 },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 3 && data.cell.raw === "✗") {
          doc.setTextColor(200, 30, 30);
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

  doc.save(`normativo-${periodo.replace(/\s+/g, "_")}-${fechaArchivo()}.pdf`);
}
