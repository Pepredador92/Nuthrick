import { formatPatientDate } from "@/src/features/patients/patientUtils";
import type { ProfessionalDocumentInfo } from "@/src/features/consultations/exportText";
import { evolutionCategoryStyles, hexToRgb } from "@/src/features/evolution/presentation";
import type { LongitudinalHistory, LongitudinalSeries } from "@/src/features/evolution/longitudinal";
import type { Patient } from "@/src/types/domain";

export type EvolutionExportSelection = {
  seriesIds: string[];
};

export function numericPoints(series: LongitudinalSeries) {
  return series.points
    .map((point) => ({ ...point, value: Number(point.raw_value) }))
    .filter((point) => Number.isFinite(point.value));
}

function somatochartPoints(series: LongitudinalSeries) {
  return series.points
    .map((point) => ({ ...point, x: Number(point.coordinates?.x), y: Number(point.coordinates?.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function isExportableSeries(series: LongitudinalSeries) {
  return series.visualization === "somatochart"
    ? somatochartPoints(series).length > 0
    : numericPoints(series).length > 0;
}

export function exportableSeries(
  history: LongitudinalHistory,
  selection: EvolutionExportSelection,
) {
  const selected = new Set(selection.seriesIds);
  return history.series.filter(
    (series) =>
      selected.has(series.id) &&
      series.graphable &&
      isExportableSeries(series),
  );
}

export function evolutionTextExport(
  patient: Patient,
  history: LongitudinalHistory,
  selection: EvolutionExportSelection,
  professional: ProfessionalDocumentInfo,
) {
  const series = exportableSeries(history, selection);
  const lines = [
    "Nuthrick · Evolución clínica",
    `Profesional: ${professional.fullName}${professional.professionalTitle ? ` · ${professional.professionalTitle}` : ""}`,
    ...(professional.licenseNumber
      ? [`Cédula profesional: ${professional.licenseNumber}`]
      : []),
    ...(professional.businessName ? [`Consultorio: ${professional.businessName}`] : []),
    ...(professional.businessAddress
      ? [`Dirección del establecimiento: ${professional.businessAddress}`]
      : []),
    ...(professional.contactLines ?? []),
    "",
    `Paciente: ${patient.full_name}`,
    ...(patient.birth_date
      ? [`Fecha de nacimiento: ${formatPatientDate(patient.birth_date)}`]
      : []),
    `Consultas incluidas: ${history.consultations.length}`,
    `Generado: ${formatPatientDate(new Date().toISOString())}`,
    "",
  ];

  for (const item of series) {
    lines.push(item.label);
    if (item.provenance) lines.push(`Procedencia: ${item.provenance}`);
    if (item.visualization === "somatochart") {
      for (const point of somatochartPoints(item)) {
        lines.push(`- ${formatPatientDate(point.consultation_date)}: X ${point.x} · Y ${point.y}`);
      }
    } else {
      for (const point of numericPoints(item)) {
        lines.push(`- ${formatPatientDate(point.consultation_date)}: ${point.display_value}${point.unit ? ` ${point.unit}` : ""}`);
      }
    }
    lines.push("");
  }

  if (!series.length) lines.push("No se seleccionaron indicadores numéricos para exportar.", "");
  lines.push("Documento privado. Contiene información clínica confidencial.");
  return lines.join("\n");
}

export function downloadEvolutionText(filename: string, text: string) {
  downloadBlob(filename, new Blob([text], { type: "text/plain;charset=utf-8" }));
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function imageData(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "2-digit" })
    .format(date)
    .replace(/\./g, "");
}

function chartRange(values: number[]) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low === high) {
    const offset = Math.max(Math.abs(low) * 0.1, 1);
    return { low: low - offset, high: high + offset };
  }
  const padding = (high - low) * 0.12;
  return { low: low - padding, high: high + padding };
}

export async function downloadEvolutionPdf(
  filename: string,
  patient: Patient,
  history: LongitudinalHistory,
  selection: EvolutionExportSelection,
  professional: ProfessionalDocumentInfo,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const width = pageWidth - margin * 2;
  const series = exportableSeries(history, selection);
  const logo = professional.logoUrl ? await imageData(professional.logoUrl) : null;
  let cursor = 18;

  const header = (compact = false) => {
    const brand = professional.businessName?.trim() || professional.fullName.trim() || "Nuthrick";
    pdf.setFillColor(23, 61, 54);
    pdf.rect(0, 0, pageWidth, 2, "F");
    pdf.setFillColor(205, 161, 96);
    pdf.rect(margin, 2, 28, 1.2, "F");
    pdf.setTextColor(23, 61, 54);
    if (compact) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.text(brand, margin, 12);
      cursor = 20;
      return;
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(140, 103, 53);
    pdf.text("NUTRICIÓN Y BIENESTAR", margin, 13);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(23, 61, 54);
    pdf.text(pdf.splitTextToSize(brand, logo ? width - 38 : width), margin, 23);
    pdf.setFontSize(9.5);
    pdf.text(professional.fullName, margin, 35);
    const credentials = [professional.professionalTitle, professional.licenseNumber ? `Cédula profesional ${professional.licenseNumber}` : null]
      .filter(Boolean)
      .join(" · ");
    if (credentials) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(93, 112, 103);
      pdf.text(credentials, margin, 40);
    }
    if (logo) {
      try {
        const properties = pdf.getImageProperties(logo);
        const scale = Math.min(25 / properties.width, 25 / properties.height);
        pdf.addImage(logo, properties.fileType, pageWidth - margin - 25 + (25 - properties.width * scale) / 2, 12 + (25 - properties.height * scale) / 2, properties.width * scale, properties.height * scale, undefined, "FAST");
      } catch {
        // The textual professional identity remains available when the logo cannot be read.
      }
    }
    const contacts = [professional.businessAddress, ...(professional.contactLines ?? [])]
      .filter((line): line is string => Boolean(line?.trim()))
      .flatMap((line) => pdf.splitTextToSize(line, width - 10) as string[]);
    cursor = 51;
    if (contacts.length) {
      const contactHeight = contacts.length * 3.8 + 8;
      pdf.setFillColor(243, 247, 244);
      pdf.roundedRect(margin, cursor, width, contactHeight, 2, 2, "F");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(81, 105, 94);
      pdf.text(contacts, margin + 5, cursor + 5.5, { lineHeightFactor: 1.34 });
      cursor += contactHeight + 7;
    }
  };

  const footer = () => {
    const total = pdf.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      pdf.setPage(page);
      pdf.setDrawColor(218, 228, 221);
      pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(111, 128, 120);
      pdf.text("Documento privado · Información clínica confidencial", margin, pageHeight - 7);
      pdf.text(`Página ${page} de ${total}`, pageWidth - margin, pageHeight - 7, { align: "right" });
    }
  };

  const nextPage = () => {
    pdf.addPage();
    header(true);
  };

  const drawChart = (item: LongitudinalSeries) => {
    const points = numericPoints(item);
    const graphHeight = 57;
    const labelHeight = 16;
    const required = graphHeight + labelHeight + 22;
    if (cursor + required > pageHeight - 18) nextPage();
    pdf.setFillColor(248, 250, 248);
    pdf.roundedRect(margin, cursor, width, required, 2, 2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(31, 78, 67);
    pdf.text(item.label, margin + 5, cursor + 7);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(93, 112, 103);
    pdf.text([item.unit, item.provenance].filter(Boolean).join(" · ") || "Valores registrados", margin + 5, cursor + 12);

    const left = margin + 11;
    const top = cursor + 19;
    const graphWidth = width - 18;
    const values = points.map((point) => point.value);
    const range = chartRange(values);
    const color = hexToRgb(evolutionCategoryStyles[item.category].line);
    const x = (index: number) => points.length === 1 ? left + graphWidth / 2 : left + (graphWidth * index) / (points.length - 1);
    const y = (value: number) => top + graphHeight - ((value - range.low) / (range.high - range.low)) * graphHeight;
    pdf.setDrawColor(222, 230, 225);
    pdf.setLineWidth(0.25);
    for (let step = 0; step < 4; step += 1) {
      const lineY = top + (graphHeight * step) / 3;
      pdf.line(left, lineY, left + graphWidth, lineY);
    }
    pdf.setDrawColor(...color);
    pdf.setLineWidth(0.8);
    for (let index = 1; index < points.length; index += 1) {
      pdf.line(x(index - 1), y(points[index - 1].value), x(index), y(points[index].value));
    }
    points.forEach((point, index) => {
      pdf.setFillColor(...color);
      pdf.circle(x(index), y(point.value), 1.4, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(38, 63, 55);
      pdf.text(point.display_value, x(index), y(point.value) - 3, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      pdf.setTextColor(111, 128, 120);
      pdf.text(shortDate(point.consultation_date), x(index), top + graphHeight + 5, { align: "center" });
    });
    cursor += required + 6;
  };

  const drawSomatochart = (item: LongitudinalSeries) => {
    const points = somatochartPoints(item);
    const graphSize = 72;
    const required = graphSize + 28;
    if (cursor + required > pageHeight - 18) nextPage();
    const color = hexToRgb(evolutionCategoryStyles[item.category].line);
    pdf.setFillColor(248, 250, 248);
    pdf.roundedRect(margin, cursor, width, required, 2, 2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(31, 78, 67);
    pdf.text(item.label, margin + 5, cursor + 7);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(93, 112, 103);
    pdf.text("Coordenadas guardadas por consulta · Heath-Carter", margin + 5, cursor + 12);

    const size = graphSize - 6;
    const left = margin + (width - size) / 2;
    const top = cursor + 17;
    const limit = Math.max(4, ...points.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]).map((value) => Math.ceil(value + 1)));
    const x = (value: number) => left + ((value + limit) / (limit * 2)) * size;
    const y = (value: number) => top + ((limit - value) / (limit * 2)) * size;
    pdf.setDrawColor(222, 230, 225);
    pdf.setLineWidth(0.25);
    for (let step = 0; step < 5; step += 1) {
      const offset = (size * step) / 4;
      pdf.line(left + offset, top, left + offset, top + size);
      pdf.line(left, top + offset, left + size, top + offset);
    }
    pdf.setDrawColor(144, 161, 152);
    pdf.setLineWidth(0.35);
    pdf.line(x(0), top, x(0), top + size);
    pdf.line(left, y(0), left + size, y(0));
    pdf.setDrawColor(...color);
    pdf.setLineWidth(0.75);
    for (let index = 1; index < points.length; index += 1) {
      pdf.line(x(points[index - 1].x), y(points[index - 1].y), x(points[index].x), y(points[index].y));
    }
    points.forEach((point, index) => {
      pdf.setFillColor(...color);
      pdf.circle(x(point.x), y(point.y), index === points.length - 1 ? 1.7 : 1.25, "F");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      pdf.setTextColor(111, 128, 120);
      pdf.text(shortDate(point.consultation_date), x(point.x) + 2.5, y(point.y) - 2);
    });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(111, 128, 120);
    pdf.text("X · ectomorfia − endomorfia", left + size / 2, top + size + 5, { align: "center" });
    cursor += required + 6;
  };

  header();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.setTextColor(23, 61, 54);
  pdf.text("Evolución nutricional", margin, cursor);
  cursor += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(93, 112, 103);
  pdf.text(`Paciente: ${patient.full_name} · Generado: ${formatPatientDate(new Date().toISOString())}`, margin, cursor);
  cursor += 10;
  if (series.length) series.forEach((item) => {
    if (item.visualization === "somatochart") drawSomatochart(item);
    else drawChart(item);
  });
  else {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(93, 112, 103);
    pdf.text("No se seleccionaron indicadores numéricos para graficar.", margin, cursor);
  }
  footer();
  downloadBlob(filename, pdf.output("blob"));
}
