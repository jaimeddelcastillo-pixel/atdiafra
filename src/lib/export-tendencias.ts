import * as XLSX from "xlsx";
import JSZip from "jszip";
import { format } from "date-fns";
import type { Instrumento } from "@/lib/catalogos";
import type { Dia, PuntoLectura, Registro, Semana } from "@/lib/semanas";

const DIA_OFFSET: Record<Dia, number> = {
  Lunes: 0, Martes: 1, Miércoles: 2, Jueves: 3, Viernes: 4, Sábado: 5, Domingo: 6,
};

type SerieTendencia = {
  nombre: string;
  unidad: string;
  lecturas: { fecha: Date; promedio: number; cantidad: number }[];
  lie: number | null;
  lse: number | null;
};

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function fechaLocal(fecha: string): Date {
  return new Date(`${fecha}T12:00:00`);
}

function fechaDeLectura(semana: Semana, punto: PuntoLectura): Date {
  const fecha = fechaLocal(semana.semana_inicio);
  fecha.setDate(fecha.getDate() + DIA_OFFSET[punto.dia]);
  return fecha;
}

function promediosDiarios(
  semanas: Semana[], campo: "lecturas" | "lecturas_hr", desde: Date, hasta: Date,
): SerieTendencia["lecturas"] {
  const inicio = new Date(desde); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(hasta); fin.setHours(23, 59, 59, 999);
  const dias = new Map<string, { fecha: Date; valores: number[] }>();
  for (const semana of semanas) {
    for (const punto of semana[campo] ?? []) {
      if (punto._na || punto.valor == null || !Number.isFinite(punto.valor)) continue;
      const fecha = fechaDeLectura(semana, punto);
      if (fecha < inicio || fecha > fin) continue;
      const key = format(fecha, "yyyy-MM-dd");
      const dia = dias.get(key) ?? { fecha, valores: [] };
      dia.valores.push(punto.valor);
      dias.set(key, dia);
    }
  }
  return Array.from(dias.values())
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .map(({ fecha, valores }) => ({
      fecha,
      promedio: valores.reduce((total, valor) => total + valor, 0) / valores.length,
      cantidad: valores.length,
    }));
}

export function construirSeriesTendencia(
  registro: Registro, instrumento: Instrumento | undefined, desde: Date, hasta: Date,
): SerieTendencia[] {
  if (registro.modulo === "temphr") {
    return [
      {
        nombre: "Temperatura", unidad: "°C",
        lecturas: promediosDiarios(registro.semanas, "lecturas", desde, hasta),
        lie: registro.lie_t ?? null, lse: registro.lse_t ?? null,
      },
      {
        nombre: "Humedad relativa", unidad: "%HR",
        lecturas: promediosDiarios(registro.semanas, "lecturas_hr", desde, hasta),
        lie: registro.lie_hr ?? null, lse: registro.lse_hr ?? null,
      },
    ].filter((serie) => serie.lecturas.length > 0);
  }
  if (registro.modulo === "presiones" || registro.modulo === "filtros") {
    const unidad = registro.semanas.find((semana) => semana.unidad?.trim())?.unidad || "Pa";
    return [{
      nombre: "Presión diferencial", unidad,
      lecturas: promediosDiarios(registro.semanas, "lecturas", desde, hasta),
      lie: registro.lie ?? instrumento?.lie_pa ?? null,
      lse: registro.lse ?? instrumento?.lse_pa ?? null,
    }].filter((serie) => serie.lecturas.length > 0);
  }
  return [];
}

function nombreHoja(base: string, usadas: Set<string>): string {
  const limpio = base.replace(/[\\/?*:[\]]/g, " ").slice(0, 31) || "Tendencia";
  let nombre = limpio;
  let i = 2;
  while (usadas.has(nombre)) nombre = `${limpio.slice(0, 27)} ${i++}`;
  usadas.add(nombre);
  return nombre;
}

function chartXml(sheetName: string, serie: SerieTendencia, lastRow: number): string {
  const sh = `'${sheetName.replaceAll("'", "''")}'`;
  const xRange = `${sh}!$A$5:$A$${lastRow}`;
  const columnas = [
    { col: "B", name: "Promedio diario", color: "185FA5", width: 22000, marker: true },
    { col: "C", name: "Media", color: "0F766E", width: 16000 },
    ...(serie.lse != null ? [{ col: "D", name: "LSE", color: "64748B", width: 14000 }] : []),
    ...(serie.lie != null ? [{ col: "E", name: "LIE", color: "64748B", width: 14000 }] : []),
    { col: "F", name: "Límite alerta superior", color: "F59E0B", width: 14000 },
    { col: "G", name: "Límite alerta inferior", color: "F59E0B", width: 14000 },
    { col: "H", name: "Límite acción superior", color: "DC2626", width: 14000 },
    { col: "I", name: "Límite acción inferior", color: "DC2626", width: 14000 },
  ];
  const seriesXml = columnas.map((s, index) => `<c:ser>
    <c:idx val="${index}"/><c:order val="${index}"/>
    <c:tx><c:v>${xml(s.name)}</c:v></c:tx>
    <c:spPr><a:ln w="${s.width}"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill>${s.col !== "B" ? '<a:prstDash val="dash"/>' : ""}</a:ln></c:spPr>
    <c:marker><c:symbol val="${s.marker ? "circle" : "none"}"/><c:size val="5"/></c:marker>
    <c:xVal><c:numRef><c:f>${xRange}</c:f></c:numRef></c:xVal>
    <c:yVal><c:numRef><c:f>${sh}!$${s.col}$5:$${s.col}$${lastRow}</c:f></c:numRef></c:yVal>
    <c:smooth val="0"/>
  </c:ser>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <c:date1904 val="0"/><c:lang val="es-MX"/><c:roundedCorners val="0"/><c:chart>
  <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="es-MX" sz="1400" b="1"/><a:t>${xml(serie.nombre)}</a:t></a:r></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title>
  <c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${seriesXml}<c:axId val="871001"/><c:axId val="871002"/></c:scatterChart>
   <c:valAx><c:axId val="871001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="dd/mm/yyyy" sourceLinked="0"/><c:majorTickMark val="out"/><c:tickLblPos val="nextTo"/><c:crossAx val="871002"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>
   <c:valAx><c:axId val="871002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="es-MX" sz="1000"/><a:t>${xml(serie.unidad)}</a:t></a:r></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title><c:majorGridlines/><c:numFmt formatCode="0.00" sourceLinked="0"/><c:majorTickMark val="out"/><c:tickLblPos val="nextTo"/><c:crossAx val="871001"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>
  </c:plotArea><c:legend><c:legendPos val="b"/><c:layout/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
 </c:chart><c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings>
</c:chartSpace>`;
}

function drawingXml(chartId: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
 <xdr:twoCellAnchor><xdr:from><xdr:col>10</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>22</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>28</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
  <xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${chartId + 1}" name="Gráfica ${chartId}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/>
 </xdr:twoCellAnchor>
</xdr:wsDr>`;
}

async function agregarGraficas(buffer: ArrayBuffer, specs: { sheetName: string; serie: SerieTendencia; lastRow: number }[]): Promise<Blob> {
  const zip = await JSZip.loadAsync(buffer);
  for (let i = 0; i < specs.length; i++) {
    const n = i + 1;
    const sheetPath = `xl/worksheets/sheet${n}.xml`;
    const original = await zip.file(sheetPath)?.async("string");
    if (!original) continue;
    const rootConRel = original.includes("xmlns:r=")
      ? original
      : original.replace("<worksheet ", '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    zip.file(sheetPath, rootConRel.replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>'));
    zip.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`);
    zip.file(`xl/drawings/drawing${n}.xml`, drawingXml(n));
    zip.file(`xl/drawings/_rels/drawing${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/></Relationships>`);
    zip.file(`xl/charts/chart${n}.xml`, chartXml(specs[i].sheetName, specs[i].serie, specs[i].lastRow));
  }
  const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
  if (contentTypes) {
    const overrides = specs.map((_, i) => `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join("");
    zip.file("[Content_Types].xml", contentTypes.replace("</Types>", `${overrides}</Types>`));
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function exportarTendenciasExcel(args: {
  registro: Registro;
  instrumento?: Instrumento;
  area: string;
  desde: Date;
  hasta: Date;
}): Promise<number> {
  const { registro, instrumento, area, desde, hasta } = args;
  const series = construirSeriesTendencia(registro, instrumento, desde, hasta);
  if (series.length === 0) return 0;
  const wb = XLSX.utils.book_new();
  const usadas = new Set<string>();
  const specs: { sheetName: string; serie: SerieTendencia; lastRow: number }[] = [];
  for (const serie of series) {
    const sheetName = nombreHoja(serie.nombre, usadas);
    const rows: (string | number | Date)[][] = [
      ["DIAFRA, S.A. de C.V. — Análisis de tendencias"],
      [`Instrumento: ${instrumento?.codigo ?? registro.nombre}`, `Área: ${area}`],
      [`Periodo: ${format(desde, "dd/MM/yyyy")} – ${format(hasta, "dd/MM/yyyy")}`, `Variable: ${serie.nombre} (${serie.unidad})`],
      ["Fecha", "Promedio diario", "Media", "LSE", "LIE", "Alerta superior (+2σ)", "Alerta inferior (-2σ)", "Acción superior (+3σ)", "Acción inferior (-3σ)", "Lecturas del día"],
    ];
    for (const punto of serie.lecturas) rows.push([
      punto.fecha, punto.promedio, "", serie.lse ?? "", serie.lie ?? "", "", "", "", "", punto.cantidad,
    ]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const lastRow = rows.length;
    ws.J2 = { t: "n", f: `AVERAGE(B5:B${lastRow})` };
    ws.J3 = { t: "n", f: `IF(COUNT(B5:B${lastRow})>1,STDEV.S(B5:B${lastRow}),0)` };
    for (let row = 5; row <= lastRow; row++) {
      ws[`C${row}`] = { t: "n", f: "$J$2" };
      ws[`F${row}`] = { t: "n", f: "$J$2+2*$J$3" };
      ws[`G${row}`] = { t: "n", f: "$J$2-2*$J$3" };
      ws[`H${row}`] = { t: "n", f: "$J$2+3*$J$3" };
      ws[`I${row}`] = { t: "n", f: "$J$2-3*$J$3" };
    }
    ws.J2.z = "0.000"; ws.J3.z = "0.000";
    ws["!cols"] = [{ wch: 13 }, ...Array.from({ length: 8 }, () => ({ wch: 20 })), { wch: 16 }, { wch: 2 }, { wch: 14 }];
    ws["!autofilter"] = { ref: `A4:J${lastRow}` };
    for (let row = 5; row <= lastRow; row++) {
      ws[`A${row}`].z = "dd/mm/yyyy";
      for (const col of "BCDEFGHI") if (ws[`${col}${row}`]) ws[`${col}${row}`].z = "0.000";
    }
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    specs.push({ sheetName, serie, lastRow });
  }
  wb.Workbook = { CalcPr: { calcMode: "auto", fullCalcOnLoad: "1", forceFullCalc: "1" } };
  const raw = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true }) as ArrayBuffer;
  const blob = await agregarGraficas(raw, specs);
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `tendencias-diafra-${instrumento?.codigo ?? registro.nombre}-${format(new Date(), "yyyyMMdd")}.xlsx`.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._-]+/g, "-");
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return series.length;
}