import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  esSemanaCompleta,
  lecturasCapturadas,
  lecturasEsperadas,
  type Registro,
} from "@/lib/semanas";
import {
  MINIMO_NORMATIVO,
  analizarRegistro,
  semanasDelPeriodo,
  CPK_WARN,
  type Periodo,
  type EstadisticaSerie,
} from "@/lib/normativo";
import { generarChartsRegistro } from "@/lib/chart-renderer";

function fechaArchivo() {
  return new Date().toISOString().slice(0, 10);
}

function num(v: number | null | undefined, d = 2) {
  return v != null && Number.isFinite(v) ? v.toFixed(d) : "—";
}

function colorCpk(cpk: number | null): [number, number, number] | null {
  if (cpk == null) return null;
  // Nunca rojo: Cpk bajo es Alerta estadística (ámbar), no No Conformidad.
  if (cpk < CPK_WARN) return [251, 191, 36];
  return [22, 163, 74];
}

// ========= EXCEL =========
export function exportarReporteExcel(
  registros: Registro[],
  periodo: Periodo,
  etiqueta: string,
) {
  const wb = XLSX.utils.book_new();
  const analisis = registros.map((r) => analizarRegistro(r, periodo));

  // Hoja 1: Resumen del periodo
  const resumen = analisis.map((a) => ({
    Registro: a.registro.nombre,
    Modulo: a.registro.modulo,
    ISO: a.registro.iso ?? "—",
    Periodo: a.rango.etiqueta,
    Semanas: a.semanasPeriodo,
    "Primera lectura": fmtISO(a.cobertura.primera),
    "Última lectura": fmtISO(a.cobertura.ultima),
    "Días con lectura": a.cobertura.dias,
    "Lecturas totales": a.totalLecturas,
    "Mínimo normativo": MINIMO_NORMATIVO,
    "% vs mínimo": a.porcentajeMinimo,
    Cumple: a.cumpleMinimo ? "SÍ" : "NO",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");

  // Hoja 2: Estadísticas por serie
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
        Pp: s.pp != null ? Number(s.pp.toFixed(3)) : "",
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

  // Hoja 3: Detalle de semanas dentro del periodo
  const detalle: Array<Record<string, unknown>> = [];
  for (const a of analisis) {
    const r = a.registro;
    const esTHR = r.modulo === "temphr";
    const sems = semanasDelPeriodo(r, periodo);
    for (const s of [...sems].sort((x, y) => x.semana_inicio.localeCompare(y.semana_inicio))) {
      detalle.push({
        Registro: r.nombre,
        Modulo: r.modulo,
        "Semana (lunes)": s.semana_inicio,
        Mes: s.mes,
        Año: s.anio,
        Unidad: s.unidad,
        Capturadas: lecturasCapturadas(s, esTHR),
        Esperadas: lecturasEsperadas(s, esTHR),
        Estado: esSemanaCompleta(s, esTHR) ? "Completa" : lecturasCapturadas(s, esTHR) > 0 ? "Parcial" : "Vacía",
        Observaciones: s.observaciones ?? "",
        Origen: s.source,
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Estado: "Sin semanas en el periodo" }]), "Detalle semanas");

  XLSX.writeFile(wb, `reporte-diafra-${etiqueta.replace(/\s+/g, "_")}-${fechaArchivo()}.xlsx`);
}

// ========= PDF =========
export function exportarReportePDF(
  registros: Registro[],
  periodo: Periodo,
  etiqueta: string,
  opts: { incluirGraficas?: boolean } = {},
) {
  const incluirGraficas = opts.incluirGraficas !== false;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const analisis = registros.map((r) => analizarRegistro(r, periodo));

  // Portada
  doc.setFontSize(20).setFont("helvetica", "bold");
  doc.text("Reporte consolidado DIAFRA", pageW / 2, 80, { align: "center" });
  doc.setFontSize(13).setFont("helvetica", "normal");
  doc.text(etiqueta, pageW / 2, 108, { align: "center" });

  const total = analisis.length;
  const cumplen = analisis.filter((a) => a.cumpleMinimo).length;
  const lecturas = analisis.reduce((s, a) => s + a.totalLecturas, 0);
  const conFuera = analisis.filter((a) => a.series.some((s) => s.fueraSpec.total > 0)).length;

  autoTable(doc, {
    startY: 150,
    head: [["Indicador", "Valor"]],
    body: [
      ["Periodo", etiqueta],
      ["Mínimo normativo por registro", `${MINIMO_NORMATIVO} lecturas`],
      ["Registros incluidos", String(total)],
      ["Cumplen mínimo", `${cumplen} / ${total} (${total ? Math.round((cumplen / total) * 100) : 0}%)`],
      ["Con fuera de especificación", String(conFuera)],
      ["Total de lecturas en el periodo", lecturas.toLocaleString("es-MX")],
      ["Generado", new Date().toLocaleString("es-MX")],
    ],
    theme: "grid",
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    margin: { left: 80, right: 80 },
  });

  const headStats = [
    ["Serie", "n", "Media", "σ", "Mín / Máx", "P5 / P95", "Cp / Cpk / Pp / Ppk", "% spec", "LIE / LSE", "Fuera spec"],
  ];
  const filaSerie = (s: EstadisticaSerie): string[] => [
    `${s.serie} ${s.unidad}`.trim(),
    String(s.n),
    num(s.media),
    num(s.sd),
    `${num(s.min)} / ${num(s.max)}`,
    `${num(s.p5)} / ${num(s.p95)}`,
    `${num(s.cp)} / ${num(s.cpk)} / ${num(s.pp)} / ${num(s.ppk)}`,
    s.pctDentroSpec != null ? `${s.pctDentroSpec.toFixed(1)}%` : "—",
    `${s.lie ?? "—"} / ${s.lse ?? "—"}`,
    s.fueraSpec.total === 0 ? "0" : `${s.fueraSpec.total} (${s.fueraSpec.altos}↑ ${s.fueraSpec.bajos}↓)`,
  ];

  for (const a of analisis) {
    doc.addPage();
    doc.setFontSize(13).setFont("helvetica", "bold");
    doc.text(a.registro.nombre, 40, 40);
    doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(90);
    doc.text(
      `${a.registro.modulo} · ${a.registro.iso ?? "—"} · ${a.rango.etiqueta} · datos ${fmtISO(a.cobertura.primera) || "—"} – ${fmtISO(a.cobertura.ultima) || "—"} (${a.cobertura.dias} días con lectura) · ${a.totalLecturas} lecturas (${a.porcentajeMinimo}% del mínimo) · ${a.cumpleMinimo ? "✓ cumple" : "✗ no cumple"}`,
      40, 56,
    );
    doc.setTextColor(0);

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
          const c = colorCpk(s.ppk ?? s.cpk);
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
        doc.text(`${etiqueta} · DIAFRA`, 40, pageH - 20);
        doc.text(`Página ${doc.getNumberOfPages()}`, pageW - 40, pageH - 20, { align: "right" });
        doc.setTextColor(0);
      },
    });

    // Gráficas
    if (incluirGraficas) {
      const margin = 40;
      const chartW = pageW - margin * 2;
      const chartH = 200;
      const sems = semanasDelPeriodo(a.registro, periodo);
      if (sems.length > 0) {
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

  doc.save(`reporte-diafra-${etiqueta.replace(/\s+/g, "_")}-${fechaArchivo()}.pdf`);
}

function fmtISO(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
}
