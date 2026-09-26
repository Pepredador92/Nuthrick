import { formatPatientDate } from "@/src/features/patients/patientUtils";
import type { ProfessionalDocumentInfo } from "@/src/features/consultations/exportText";
import type { LongitudinalHistory, LongitudinalSeries } from "@/src/features/evolution/longitudinal";
import type { ProgressReferenceOptions } from "./progressReferences";
import { emptyProgressReferences, formatReferenceNumber, weightReference } from "./progressReferences";
import { pointClassification } from "./clinicalSummary";
import type { Patient } from "@/src/types/domain";

export type EvolutionExportSelection = {
  seriesIds: string[];
  references?: ProgressReferenceOptions;
};

export function numericPoints(series: LongitudinalSeries) {
  return series.points
    .filter((point) => typeof point.raw_value === "number")
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
        const referenceOptions = selection.references ?? emptyProgressReferences;
        const classification = pointClassification(item, point, history.series, referenceOptions);
        if (classification) lines.push(`  ${classification.origin}: ${classification.label} · ${classification.source}`);
        if (item.conceptCode === "weight") {
          const reference = weightReference(point, history.series, referenceOptions);
          if (reference.interval) lines.push(`  Intervalo por IMC adulto: ${formatReferenceNumber(reference.interval.lower)} a menos de ${formatReferenceNumber(reference.interval.upper)} kg · talla ${reference.interval.heightCm} cm · OMS`);
          if (reference.recorded) lines.push(`  Referencia registrada: ${formatReferenceNumber(reference.recorded.value)} kg · ${reference.recorded.method ?? "Método no registrado"}`);
          if (reference.target) lines.push(`  Objetivo elegido: ${formatReferenceNumber(reference.target.value)} kg · IMC ${reference.target.bmi}`);
        }
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

const reportPriority = ["peso", "imc", "grasa", "somatocarta", "cintura", "muscular"];

function reportPriorityFor(series: LongitudinalSeries) {
  const label = series.label.toLocaleLowerCase("es-MX");
  if (series.visualization === "somatochart") return reportPriority.indexOf("somatocarta");
  const match = reportPriority.findIndex((term) => label.includes(term));
  return match === -1 ? reportPriority.length : match;
}

export function reportSeries(series: LongitudinalSeries[], limit = Infinity) {
  return series
    .slice()
    .sort((left, right) => reportPriorityFor(left) - reportPriorityFor(right) || left.label.localeCompare(right.label, "es"))
    .slice(0, limit);
}

function signedValue(value: number) {
  const formatted = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(Math.abs(value));
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatted}`;
}

export function progressMetrics(series: LongitudinalSeries[]) {
  return series
    .filter((item) => item.visualization !== "somatochart")
    .map((item) => {
      const points = numericPoints(item);
      const initial = points[0];
      const current = points.at(-1);
      if (!initial || !current) return null;
      return {
        label: item.label,
        current: `${current.display_value}${current.unit ? ` ${current.unit}` : ""}`,
        change: signedValue(current.value - initial.value),
      };
    })
    .filter((item): item is { label: string; current: string; change: string } => Boolean(item));
}

export async function downloadEvolutionPdf(
  filename: string,
  patient: Patient,
  history: LongitudinalHistory,
  selection: EvolutionExportSelection,
  professional: ProfessionalDocumentInfo,
) {
  const { buildEvolutionPdf } = await import("./evolutionPdf");
  const pdf = await buildEvolutionPdf(patient, history, selection, professional);
  downloadBlob(filename, pdf.output("blob"));
}
