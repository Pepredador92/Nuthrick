import { consultationLabel, formatPatientDate } from "@/src/features/patients/patientUtils";
import {
  emptyValue,
  formatAnswer,
  matchesCondition,
} from "@/src/features/consultations/questionnaire";
import type {
  Consultation,
  ConsultationSnapshot,
  Patient,
} from "@/src/types/domain";

import {DocumentLayout} from "../../../../supabase/functions/agenda/document-layout";

export type { ProfessionalDocumentInfo } from "../../../../supabase/functions/agenda/document-letterhead";
import {drawPrivateFooters,type ProfessionalDocumentInfo} from "../../../../supabase/functions/agenda/document-letterhead";

export function consultationTextExport(
  patient: Patient,
  consultation: Consultation,
  snapshot: ConsultationSnapshot,
  values: Record<string, unknown>,
  professional?: ProfessionalDocumentInfo,
): string {
  const lines = [
    "Nuthrick · Registro de consulta",
    ...(professional
      ? [
          `Profesional: ${professional.fullName}${professional.professionalTitle ? ` · ${professional.professionalTitle}` : ""}`,
          ...(professional.licenseNumber
            ? [`Cédula profesional: ${professional.licenseNumber}`]
            : []),
          ...(professional.businessName
            ? [`Consultorio: ${professional.businessName}`]
            : []),
          ...(professional.businessAddress
            ? [`Dirección del establecimiento: ${professional.businessAddress}`]
            : []),
          ...(professional.contactLines ?? []),
          "",
        ]
      : []),
    `Paciente: ${patient.full_name}`,
    `Consulta: ${consultationLabel(consultation)}`,
    `Fecha: ${formatPatientDate(consultation.consultation_date)}`,
    `Tipo: ${consultation.consultation_type === "initial" ? "Consulta inicial" : "Consulta de seguimiento"}`,
    `Plantilla: ${snapshot.template_name} · v${snapshot.template_version}`,
    "",
  ];
  for (const section of snapshot.structure.sections) {
    const entries = section.questions
      .filter(
        (question) =>
          matchesCondition(question.visibility_condition, values) &&
          !emptyValue(values[question.question_key]),
      )
      .map(
        (question) =>
          [
            question.label,
            formatAnswer(question, values[question.question_key]),
          ] as const,
      )
      .filter(([, answer]) => answer.trim());
    if (!entries.length) continue;
    lines.push(section.title);
    for (const [label, answer] of entries) lines.push(`- ${label}: ${answer}`);
    lines.push("");
  }
  if (consultation.summary)
    lines.push("Resumen de cierre", consultation.summary, "");
  lines.push(
    "Documento privado. Contiene información clínica registrada durante la entrevista.",
  );
  return lines.join("\n");
}

export function downloadConsultationText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob): void {
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

function patientBasics(patient: Patient): string[] {
  return [
    `Paciente: ${patient.full_name}`,
    ...(patient.birth_date
      ? [`Fecha de nacimiento: ${formatPatientDate(patient.birth_date)}`]
      : []),
    ...(patient.email ? [`Correo: ${patient.email}`] : []),
    ...(patient.phone
      ? [`Teléfono: ${patient.country_code ?? ""} ${patient.phone}`.trim()]
      : []),
  ];
}

async function imageData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildConsultationPdf(
  patient: Patient,
  consultation: Consultation,
  snapshot: ConsultationSnapshot,
  values: Record<string, unknown>,
  professional: ProfessionalDocumentInfo,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const logo = professional.logoUrl ? await imageData(professional.logoUrl) : null;
  const layout = new DocumentLayout(pdf, professional, logo);
  layout.section("Informe de consulta nutricional", "Registro clínico para revisión del profesional.");
  layout.card(patient.full_name, [
    { label: "Consulta", value: consultationLabel(consultation) },
    { label: "Fecha y tipo", value: `${formatPatientDate(consultation.consultation_date)} · ${consultation.consultation_type === "initial" ? "Consulta inicial" : "Consulta de seguimiento"}` },
    ...patientBasics(patient).slice(1).map(value => ({ value })),
  ], { tone: "blue", columns: 2 });
  // The closing summary gives the reader an orientation before the complete record.
  if (consultation.summary) layout.card("Resumen de cierre", [{ value: consultation.summary }], { tone: "mint", eyebrow: "VISTA GENERAL" });
  let sectionNumber = 0;
  for (const section of snapshot.structure.sections) {
    const entries = section.questions
      .filter(question => matchesCondition(question.visibility_condition, values) && !emptyValue(values[question.question_key]))
      .map(question => ({ label: question.label, value: formatAnswer(question, values[question.question_key]) }))
      .filter(entry => entry.value.trim());
    if (!entries.length) continue;
    sectionNumber++;
    layout.section(`${String(sectionNumber).padStart(2, "0")} · ${section.title}`);
    // Pair short answers, while giving narratives the full width of their own card.
    let shortAnswers: typeof entries = [];
    const flush = () => {
      if (shortAnswers.length) layout.card("Datos registrados", shortAnswers, { columns: 2 });
      shortAnswers = [];
    };
    for (const entry of entries) {
      if (entry.value.length <= 100 && !entry.value.includes("\n")) {
        shortAnswers.push(entry);
        if (shortAnswers.length === 4) flush();
      } else { flush(); layout.card(entry.label, [{ value: entry.value }]); }
    }
    flush();
  }
  layout.contacts();
  drawPrivateFooters(pdf);
  return pdf;
}

export async function downloadConsultationPdf(
  filename: string,
  patient: Patient,
  consultation: Consultation,
  snapshot: ConsultationSnapshot,
  values: Record<string, unknown>,
  professional: ProfessionalDocumentInfo,
): Promise<void> {
  const pdf = await buildConsultationPdf(patient, consultation, snapshot, values, professional);
  downloadBlob(filename, pdf.output("blob"));
}
