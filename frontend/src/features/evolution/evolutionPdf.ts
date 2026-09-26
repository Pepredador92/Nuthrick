import { jsPDF } from "jspdf";
import type { Patient } from "@/src/types/domain";
import type { ProfessionalDocumentInfo } from "@/src/features/consultations/exportText";
import { calculateAge, formatPatientDate } from "@/src/features/patients/patientUtils";
import { exportableSeries, numericPoints, reportSeries, type EvolutionExportSelection } from "./exportEvolution";
import { historicalClassification, pointClassification } from "./clinicalSummary";
import { emptyProgressReferences, formatReferenceNumber, reportBodyFatInterpretation, weightReference } from "./progressReferences";
import { evolutionCategoryStyles, hexToRgb } from "./presentation";
import { somatoBoundary, somatoColors, somatoProjection, somatoRegions } from "./somatochart";
import type { LongitudinalHistory, LongitudinalSeries } from "./longitudinal";

const ink = "#173d36", muted = "#60766a";
const plain = (text: string) => text.replace(/[−–—]/g, "-").replace(/→/g, ">").replace(/×/g, "x").replace(/≤/g, "<=").replace(/≥/g, ">=");
const shortDate = (value: string) => new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "2-digit" }).format(new Date(value)).replace(/\./g, "");

async function imageData(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Logo unavailable");
    return new Uint8Array(await response.arrayBuffer());
  } catch { throw new Error("No pudimos cargar el logo del nutriólogo. Reintenta la exportación o revisa el logo en Perfil."); }
}

/** Vector report: every selected series is paginated, never silently truncated. */
export async function buildEvolutionPdf(patient: Patient, history: LongitudinalHistory, selection: EvolutionExportSelection, professional: ProfessionalDocumentInfo) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const margin = 16, width = 178, pageHeight = 297;
  const series = reportSeries(exportableSeries(history, selection));
  const references = selection.references ?? emptyProgressReferences;
  let cursor = 18;
  const color = (hex: string) => pdf.setTextColor(...hexToRgb(hex));
  const font = (size = 8, bold = false) => { pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(size); };
  const lines = (text: string, maxWidth: number, size = 8) => { font(size); return pdf.splitTextToSize(plain(text), maxWidth) as string[]; };
  const text = (value: string | string[], x: number, y: number, size = 8, bold = false, hex = ink, align: "left" | "center" | "right" = "left") => {
    font(size, bold); color(hex); pdf.text(Array.isArray(value) ? value.map(plain) : plain(value), x, y, { align, lineHeightFactor: 1.3 });
  };
  const compactHeader = () => {
    pdf.setFillColor(...hexToRgb(ink)); pdf.rect(0, 0, 210, 2, "F");
    text("NUTHRICK / Evolución nutricional", margin, 12, 9, true);
    text(lines(patient.full_name, 78, 7), 194, 12, 7, false, muted, "right");
    cursor = 24;
  };
  const ensureSpace = (height: number) => {
    if (cursor + height > pageHeight - 19) { pdf.addPage(); compactHeader(); }
  };
  const flowText = (value: string, size = 8, hex = muted, bold = false) => {
    for (const line of lines(value, width, size)) {
      ensureSpace(6); text(line, margin, cursor, size, bold, hex); cursor += size * 0.46;
    }
  };
  const card = (height: number) => {
    ensureSpace(height); pdf.setFillColor(249, 251, 249); pdf.setDrawColor(221, 232, 225); pdf.setLineWidth(0.25);
    pdf.roundedRect(margin, cursor, width, height, 3, 3, "FD");
  };
  const polygon = (points: Array<{ x: number; y: number }>, fill: string | null, project: { x: (value: number) => number; y: (value: number) => number }) => {
    if (fill) pdf.setFillColor(...hexToRgb(fill));
    const projected = points.map((point) => ({ x: project.x(point.x), y: project.y(point.y) }));
    const first = projected[0];
    pdf.lines(projected.slice(1).map((point, index) => [point.x - projected[index].x, point.y - projected[index].y]), first.x, first.y, [1, 1], fill ? "F" : "S", true);
  };

  pdf.setFillColor(...hexToRgb(ink)); pdf.rect(0, 0, 210, 2, "F");
  pdf.setFillColor(205, 161, 96); pdf.rect(margin, 2, 28, 1.2, "F");
  text("NUTHRICK", margin, 13, 8, true, "#986e36");
  text("Reporte de progreso del paciente", margin, 23, 17, true);
  cursor = 33;
  const identityWidth = professional.logoUrl ? 142 : width;
  const identity = lines(professional.fullName.trim() || "Profesional Nuthrick", identityWidth, 10);
  text(identity, margin, cursor, 10, true); cursor += identity.length * 4.6;
  const credentials = [professional.professionalTitle, professional.licenseNumber ? `Cédula profesional ${professional.licenseNumber}` : null].filter(Boolean).join(" · ");
  if (credentials) { const wrapped = lines(credentials, identityWidth, 8); text(wrapped, margin, cursor, 8, false, muted); cursor += wrapped.length * 3.8; }
  if (professional.logoUrl) {
    const logo = await imageData(professional.logoUrl);
    try {
      const props = pdf.getImageProperties(logo), scale = Math.min(23 / props.width, 18 / props.height);
      pdf.addImage(logo, props.fileType, 171, 29, props.width * scale, props.height * scale, undefined, "FAST");
    } catch { throw new Error("No pudimos incorporar el logo al PDF. Revisa la imagen guardada en Perfil y vuelve a exportar."); }
    cursor = Math.max(cursor, 49);
  }
  for (const contact of [professional.businessName, professional.businessAddress, ...(professional.contactLines ?? [])]) if (contact?.trim()) flowText(contact, 7);
  cursor += 4;
  const dates = [...new Set(series.flatMap((item) => item.points.map((point) => point.consultation_date)))].sort();
  const visitCount = new Set(series.flatMap((item) => item.points.map((point) => point.consultation_id))).size;
  const generatedAt = new Date();
  const age = calculateAge(patient.birth_date, generatedAt);
  const patientName = lines(patient.full_name, width - 12, 12);
  const birthDate = patient.birth_date && age !== null ? formatPatientDate(`${patient.birth_date}T12:00:00`) : "Sin registrar";
  const patientDetails = [
    `Edad al emitir: ${age === null ? "Sin registrar" : `${age} ${age === 1 ? "año" : "años"}`} · Nacimiento: ${birthDate}`,
    dates.length ? `Periodo del seguimiento: ${formatPatientDate(dates[0])} - ${formatPatientDate(dates.at(-1)!)}` : "Sin fechas clínicas disponibles",
    `${visitCount} ${visitCount === 1 ? "consulta incluida" : "consultas incluidas"} · ${series.length} gráficas seleccionadas · Emitido: ${formatPatientDate(generatedAt.toISOString())}`,
  ].flatMap((detail) => lines(detail, width - 12, 7.5));
  const patientCardHeight = 18 + patientName.length * 5.5 + patientDetails.length * 4;
  card(patientCardHeight);
  text("DATOS DEL PACIENTE", margin + 6, cursor + 7, 7, true, muted);
  text(patientName, margin + 6, cursor + 14, 12, true);
  text(patientDetails, margin + 6, cursor + 16 + patientName.length * 5.5, 7.5, false, muted);
  cursor += patientCardHeight + 7;
  flowText("Evolución nutricional · Indicadores clave", 10, ink, true);
  cursor += 3;

  const drawLineChart = (item: LongitudinalSeries) => {
    const points = numericPoints(item), latest = points.at(-1)!;
    const classification = pointClassification(item, latest, history.series, references);
    const weight = item.conceptCode === "weight" ? weightReference(latest, history.series, references) : null;
    const bodyFat = reportBodyFatInterpretation(item, latest, history.series, references);
    const title = lines(item.label, width - 52, 10);
    const provenance = lines([item.unit, item.provenance].filter(Boolean).join(" · ") || "Medición registrada", width - 12, 7);
    const headerHeight = Math.max(14, title.length * 4.7 + 5) + provenance.length * 3.3;
    const notes: string[] = [];
    if (weight?.interval) notes.push(`Intervalo por IMC adulto: ${formatReferenceNumber(weight.interval.lower)} a <${formatReferenceNumber(weight.interval.upper)} kg · talla ${weight.interval.heightCm} cm · OMS`);
    if (weight?.recorded) notes.push(`Referencia registrada: ${formatReferenceNumber(weight.recorded.value)} kg${weight.recorded.method ? ` · ${weight.recorded.method}` : ""}`);
    if (weight?.target) notes.push(`Objetivo elegido: ${formatReferenceNumber(weight.target.value)} kg · IMC ${weight.target.bmi}`);
    if (classification) notes.push(`${classification.origin}: ${classification.label} · ${classification.source}`);
    else if (bodyFat?.reason) notes.push(`Sin categoría: ${bodyFat.reason}`);
    const noteLines = notes.flatMap((note) => lines(note, width - 12, 7));
    const bandHeight = classification?.bands.length ? 11 : 0;
    const weightBarHeight = weight && (weight.recorded || weight.interval || weight.target) ? 11 : 0;
    const detailHeight = noteLines.length * 3.6 + bandHeight + weightBarHeight;
    const height = headerHeight + detailHeight + 53;
    card(height);
    text(title, margin + 6, cursor + 7, 10, true);
    text(`${latest.display_value} ${latest.unit ?? ""}`, 188, cursor + 8, 11, true, ink, "right");
    text(shortDate(latest.consultation_date), 188, cursor + 13, 6.5, false, muted, "right");
    text(provenance, margin + 6, cursor + headerHeight - provenance.length * 3.3, 7, false, muted);
    let detailY = cursor + headerHeight + 1;
    if (noteLines.length) { text(noteLines, margin + 6, detailY, 7, false, muted); detailY += noteLines.length * 3.6; }
    if (classification?.bands.length) {
      const barX = margin + 6, barW = width - 12;
      for (const band of classification.bands) {
        pdf.setFillColor(...hexToRgb(band.color)); pdf.rect(barX + barW * band.left / 100, detailY, barW * band.width / 100, 3, "F");
      }
      pdf.setDrawColor(...hexToRgb(ink)); pdf.setLineWidth(0.6);
      const marker = barX + barW * classification.marker / 100;
      pdf.line(marker, detailY - 1, marker, detailY + 4);
      const legend = classification.rules.map((rule) => rule.label).join(" · ");
      text(legend, barX, detailY + 7, 6, false, muted);
      detailY += bandHeight;
    }
    if (weight && weightBarHeight) {
      const scale = Math.max(latest.value, weight.interval?.upper ?? 0, weight.recorded?.value ?? 0, weight.target?.value ?? 0);
      const base = margin + 6, barW = width - 12;
      pdf.setFillColor(232, 238, 234); pdf.rect(base, detailY, barW, 3, "F");
      if (weight.interval) { pdf.setFillColor(184, 222, 208); pdf.rect(base + barW * weight.interval.lower / scale, detailY, barW * (weight.interval.upper - weight.interval.lower) / scale, 3, "F"); }
      pdf.setFillColor(...hexToRgb(ink)); pdf.rect(base, detailY + 5, barW * latest.value / scale, 2, "F");
      const target = weight.target?.value ?? weight.recorded?.value;
      if (target) { pdf.setDrawColor(90, 115, 172); pdf.setLineWidth(0.6); pdf.line(base + barW * target / scale, detailY - 1, base + barW * target / scale, detailY + 8); }
      text(`Banda clara: intervalo · barra oscura: peso actual${target ? " · línea azul: objetivo o referencia" : ""}`, base, detailY + 10, 6, false, muted);
      detailY += weightBarHeight;
    }
    const left = margin + 16, top = detailY + 5, graphW = width - 28, graphH = 31;
    const values = points.map((point) => point.value), min = Math.min(...values), max = Math.max(...values);
    const padding = Math.max((max - min) * 0.18, Math.abs(max) * 0.015, 0.1), low = min - padding, high = max + padding;
    const times = points.map((point) => new Date(point.consultation_date).getTime()), duration = times.at(-1)! - times[0];
    const x = (index: number) => duration > 0 ? left + graphW * (times[index] - times[0]) / duration : left + graphW / 2;
    const y = (value: number) => top + graphH * (high - value) / (high - low);
    for (let step = 0; step <= 3; step++) {
      const lineY = top + graphH * step / 3;
      pdf.setDrawColor(222, 231, 225); pdf.setLineWidth(0.2); pdf.line(left, lineY, left + graphW, lineY);
      text(formatReferenceNumber(high - (high - low) * step / 3), left - 3, lineY + 1, 6.5, false, muted, "right");
    }
    const stroke = hexToRgb(evolutionCategoryStyles[item.category].line);
    pdf.setDrawColor(...stroke); pdf.setLineWidth(0.7);
    for (let index = 1; index < points.length; index++) pdf.line(x(index - 1), y(points[index - 1].value), x(index), y(points[index].value));
    points.forEach((point, index) => {
      pdf.setFillColor(...stroke); pdf.circle(x(index), y(point.value), index === points.length - 1 ? 1.3 : 0.85, "F");
      if (index === 0 || index === points.length - 1) {
        text(point.display_value, x(index), y(point.value) - 2.5, 7, true, ink, index === 0 && points.length > 1 ? "left" : "right");
        text(shortDate(point.consultation_date), x(index), top + graphH + 5, 6.5, false, muted, index === 0 && points.length > 1 ? "left" : "right");
      }
    });
    text(`${points.length} registros · Método y unidades conservados`, margin + 6, cursor + height - 3.5, 6.5, false, muted);
    cursor += height + 6;
    const classifiedHistory = points.flatMap((point) => {
      const saved = pointClassification(item, point, history.series, references);
      return saved ? [`${shortDate(point.consultation_date)} · ${point.display_value} ${point.unit ?? ""} · ${saved.label} · ${saved.source}`] : [];
    });
    if (classifiedHistory.length > 1) {
      ensureSpace(15); flowText(`Historial de referencias · ${item.label}`, 7, ink, true);
      for (const entry of classifiedHistory) flowText(entry, 6.5);
      cursor += 4;
    }
  };

  const drawSomatochart = (item: LongitudinalSeries) => {
    const points = item.points.filter((point) => point.coordinates && Number.isFinite(point.coordinates.x) && Number.isFinite(point.coordinates.y));
    const title = lines(item.label, width - 12, 10), titleHeight = title.length * 4.6 + 12;
    card(titleHeight + 102);
    text(title, margin + 6, cursor + 7, 10, true);
    text("Heath-Carter · consultas históricas", margin + 6, cursor + titleHeight - 3, 7, false, muted);
    const originX = margin + 4, originY = cursor + titleHeight;
    const projection = somatoProjection(points.map((point) => point.coordinates!), 103, 94, 10);
    const x = (value: number) => originX + projection.x(value), y = (value: number) => originY + projection.y(value);
    for (const region of somatoRegions) polygon(region.points, region.color, { x, y });
    pdf.setDrawColor(174, 195, 185); pdf.setLineWidth(0.25); polygon(somatoBoundary, null, { x, y });
    pdf.line(x(0), y(12), x(0), y(-9)); pdf.line(x(-6), y(-6), x(6), y(6)); pdf.line(x(-6), y(6), x(6), y(-6));
    text("MESOMORFIA", x(0), y(12) - 3, 7, true, "#315e50", "center");
    text("ENDOMORFIA", x(-6), y(-6) + 4, 6.5, true, "#805a3c", "right");
    text("ECTOMORFIA", x(6), y(-6) + 4, 6.5, true, "#456a86");
    for (const tick of [-6, -3, 0, 3, 6]) text(String(tick), x(tick), y(-10) + 2, 6, false, muted, "center");
    for (const tick of [-6, 0, 6, 12]) text(String(tick), x(-8) - 1, y(tick) + 1, 6, false, muted, "right");
    pdf.setDrawColor(74, 111, 94); pdf.setLineWidth(0.35);
    for (let index = 1; index < points.length; index++) pdf.line(x(points[index - 1].coordinates!.x), y(points[index - 1].coordinates!.y), x(points[index].coordinates!.x), y(points[index].coordinates!.y));
    points.forEach((point, index) => {
      const at = point.coordinates!;
      pdf.setFillColor(...hexToRgb(somatoColors[index % somatoColors.length]));
      pdf.circle(x(at.x), y(at.y), 1.8, "F");
      text(String(index + 1), x(at.x), y(at.y) + 0.6, 5.5, true, "#ffffff", "center");
      if (index === points.length - 1) { pdf.setDrawColor(...hexToRgb(ink)); pdf.circle(x(at.x), y(at.y), 2.4, "S"); }
    });
    let legendY = originY + 5;
    let index = 0;
    const legend = (point: typeof points[number], atX: number, atY: number, maxWidth: number) => {
      pdf.setFillColor(...hexToRgb(somatoColors[index % somatoColors.length])); pdf.circle(atX + 2, atY - 1, 2.1, "F");
      text(String(index + 1), atX + 2, atY - 0.3, 6, true, "#ffffff", "center");
      text(`${shortDate(point.consultation_date)}${index === points.length - 1 ? " · Actual" : ""}`, atX + 6, atY, 7, true);
      const at = point.coordinates!;
      const detail = lines(`X ${formatReferenceNumber(at.x)} · Y ${formatReferenceNumber(at.y)}${historicalClassification(point)?.label ? ` · ${historicalClassification(point)!.label}` : ""}`, maxWidth - 6, 6.5);
      text(detail, atX + 6, atY + 4, 6.5, false, muted);
      return 8 + detail.length * 3;
    };
    while (index < points.length && legendY < originY + 74) {
      legendY += legend(points[index], margin + 113, legendY, width - 120); index++;
    }
    text("X = ectomorfia - endomorfia", originX + 51, originY + 94, 6, false, muted, "center");
    text("Y = 2 x mesomorfia - endomorfia - ectomorfia", originX + 51, originY + 98, 6, false, muted, "center");
    cursor += titleHeight + 108;
    if (index < points.length) { ensureSpace(18); flowText("Somatocarta · consultas restantes", 8, ink, true); cursor += 2; }
    while (index < points.length) { ensureSpace(18); cursor += legend(points[index], margin + 3, cursor, width - 6); index++; }
  };

  for (const item of series) {
    if (item.visualization === "somatochart") drawSomatochart(item); else drawLineChart(item);
  }
  if (!series.length) flowText("No se seleccionaron indicadores numéricos para graficar.");
  const usesWeight = series.some((item) => item.conceptCode === "weight" && item.points.some((point) => weightReference(point, history.series, references).interval));
  const usesGallagher = series.some((item) => references.gallagherSeriesIds.includes(item.id));
  if (usesWeight || usesGallagher || series.some((item) => item.visualization === "somatochart")) {
    ensureSpace(24); cursor += 2; flowText("Referencias de la comparación", 8, ink, true); cursor += 1;
    if (usesWeight) flowText("Peso por IMC: OMS, intervalo adulto 18.5 a <25. El objetivo individual es elegido por el profesional. who.int/data/nutrition/nlis/info/malnutrition-in-women", 6.5);
    if (usesGallagher) flowText("Gallagher et al. (2000), tabla 4. doi:10.1093/ajcn/72.3.694. Comparación orientativa seleccionada por el profesional según población, edad, sexo y método; conserva la clasificación histórica registrada. No constituye diagnóstico.", 6.5);
    if (series.some((item) => item.visualization === "somatochart")) flowText("Somatocarta: Carter (2002), manual Heath-Carter, figura 5. Coordenadas conservadas; contorno orientativo.", 6.5);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor(218, 228, 221); pdf.setLineWidth(0.25); pdf.line(margin, 285, 194, 285);
    text("NUTHRICK · Progreso del paciente", margin, 290, 7, false, muted);
    text(`Página ${page} de ${pages}`, 194, 290, 7, false, muted, "right");
  }
  return pdf;
}
