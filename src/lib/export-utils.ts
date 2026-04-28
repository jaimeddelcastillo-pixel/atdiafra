import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  esSemanaCompleta,
  lecturasCapturadas,
  lecturasEsperadas,
  type Registro,
} from "@/lib/semanas";

export type CumplimientoRow = {
  registro: Registro;
  totalSemanas: number;
  presentes: number;
  completas: number;
  faltantes: string[];
};

function fechaArchivo() {
  return new Date().toISOString().slice(0, 10);
}

// ========= EXCEL =========
export function exportarReporteExcel(
  registros: Registro[],
  cumplimiento: CumplimientoRow[],
  anio: string,
) {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Cumplimiento
  const cumplData = cumplimiento.map(({ registro, totalSemanas, presentes, completas, faltantes }) => {
    const pct = totalSemanas > 0 ? Math.round((completas / totalSemanas) * 100) : 0;
    return {
      Registro: registro.nombre,
      Modulo: registro.modulo,
      ISO: registro.iso ?? "—",
      "Semanas esperadas": totalSemanas,
      Capturadas: presentes,
      Completas: completas,
      "% Completas": pct,
      "Lunes faltantes": faltantes.join(", "),
    };
  });
  const ws1 = XLSX.utils.json_to_sheet(cumplData);
  XLSX.utils.book_append_sheet(wb, ws1, `Cumplimiento ${anio}`);

  // Hoja 2: Registros (resumen)
  const regData = registros.map((r) => ({
    Nombre: r.nombre,
    Modulo: r.modulo,
    ISO: r.iso ?? "—",
    Semanas: r.semanas.length,
    LSE: r.lse ?? "",
    LIE: r.lie ?? "",
    "LSE T": r.lse_t ?? "",
    "LIE T": r.lie_t ?? "",
    "LSE HR": r.lse_hr ?? "",
    "LIE HR": r.lie_hr ?? "",
    Creado: r.created_at.slice(0, 10),
  }));
  const ws2 = XLSX.utils.json_to_sheet(regData);
  XLSX.utils.book_append_sheet(wb, ws2, "Registros");

  // Hoja 3: Detalle de semanas
  const detalle: Array<Record<string, unknown>> = [];
  for (const r of registros) {
    const esTHR = r.modulo === "temphr";
    for (const s of [...r.semanas].sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))) {
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
  const ws3 = XLSX.utils.json_to_sheet(detalle);
  XLSX.utils.book_append_sheet(wb, ws3, "Detalle semanas");

  XLSX.writeFile(wb, `reporte-diafra-${anio}-${fechaArchivo()}.xlsx`);
}

// ========= PDF =========
export function exportarReportePDF(
  registros: Registro[],
  cumplimiento: CumplimientoRow[],
  anio: string,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Encabezado
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Reporte consolidado DIAFRA", 40, 40);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Año de cumplimiento: ${anio}`, 40, 58);
  doc.text(`Generado: ${new Date().toLocaleString("es-MX")}`, pageW - 40, 58, { align: "right" });

  // Tabla cumplimiento
  autoTable(doc, {
    startY: 80,
    head: [["Registro", "Módulo", "ISO", "Esperadas", "Capturadas", "Completas", "%", "Faltantes"]],
    body: cumplimiento.map(({ registro, totalSemanas, presentes, completas, faltantes }) => {
      const pct = totalSemanas > 0 ? Math.round((completas / totalSemanas) * 100) : 0;
      return [
        registro.nombre,
        registro.modulo,
        registro.iso ?? "—",
        String(totalSemanas),
        String(presentes),
        String(completas),
        `${pct}%`,
        String(faltantes.length),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    didDrawPage: (data) => {
      doc.setFontSize(8);
      doc.text(
        `Página ${doc.getNumberOfPages()}`,
        pageW - 40,
        doc.internal.pageSize.getHeight() - 20,
        { align: "right" },
      );
    },
  });

  // Nueva página: detalle de registros
  doc.addPage();
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Detalle de registros", 40, 40);

  autoTable(doc, {
    startY: 60,
    head: [["Nombre", "Módulo", "ISO", "Semanas", "LSE", "LIE", "Creado"]],
    body: registros.map((r) => [
      r.nombre,
      r.modulo,
      r.iso ?? "—",
      String(r.semanas.length),
      r.lse?.toString() ?? r.lse_t?.toString() ?? "",
      r.lie?.toString() ?? r.lie_t?.toString() ?? "",
      r.created_at.slice(0, 10),
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
  });

  doc.save(`reporte-diafra-${anio}-${fechaArchivo()}.pdf`);
}
