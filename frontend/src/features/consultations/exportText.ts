import type {ConsultationDocumentData} from './clinicalDocument';
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

import {pdfLayout,pdfFooters} from "../../../../supabase/functions/agenda/pdf-layout";
import type {PdfDesign} from "../../../../supabase/functions/agenda/document-design";

export type { ProfessionalDocumentInfo } from "../../../../supabase/functions/agenda/document-letterhead";
import {type ProfessionalDocumentInfo} from "../../../../supabase/functions/agenda/document-letterhead";

export function consultationTextExport(
  patient: Patient,
  consultation: Consultation,
  snapshot: ConsultationSnapshot,
  values: Record<string, unknown>,
  professional?: ProfessionalDocumentInfo,
  clinical?: ConsultationDocumentData,
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
    ...(snapshot.revision ? [`Revisión de la consulta: ${snapshot.revision}`] : []),
    "",
  ];
  for (const section of snapshot.structure.sections) {
    const entries = section.questions
      .filter(
        (question) =>
          !clinical?.coveredKeys.includes(question.question_key) && matchesCondition(question.visibility_condition, values) &&
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
  for (const section of clinical?.sections ?? []) {
    lines.push(section.title);
    for (const card of section.cards) {
      lines.push(card.title);
      for (const field of card.fields) if (field.value.trim()) lines.push(field.label ? `- ${field.label}: ${field.value}` : field.value);
      lines.push('');
    }
  }
  if (consultation.summary)
    lines.push("Resumen de cierre", consultation.summary, "");
  lines.push(
    "Documento privado. Contiene información clínica guardada de la consulta. Los borradores se identifican por separado.",
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
    if (url.startsWith("data:image/")) return url;
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
  clinical?: ConsultationDocumentData,
  design: PdfDesign = "current",
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const logo = professional.logoUrl ? await imageData(professional.logoUrl) : null;
  const formal = design === "formal";
  const layout = pdfLayout(pdf, professional, logo, design, { contacts: true, title: "Consulta nutricional", continuation: patient.full_name });
  layout.section(formal ? "Registro de consulta nutricional" : "Informe de consulta nutricional", formal ? undefined : "Registro clínico para revisión del profesional.");
  layout.card(formal ? "Datos del paciente y la consulta" : patient.full_name, [
    ...(formal ? [{label:"Paciente",value:patient.full_name}] : []),
    { label: "Consulta", value: consultationLabel(consultation) },
    { label: "Plantilla", value: `${snapshot.template_name} · v${snapshot.template_version}` },
    ...(snapshot.revision ? [{label:"Revisión del registro",value:String(snapshot.revision)}] : []),
    { label: "Fecha y tipo", value: `${formatPatientDate(consultation.consultation_date)} · ${consultation.consultation_type === "initial" ? "Consulta inicial" : "Consulta de seguimiento"}` },
    ...patientBasics(patient).slice(1).map(value => ({ value })),
  ], { tone: "blue", columns: 3, eyebrow: "DATOS DEL PACIENTE" });
  // The closing summary gives the reader an orientation before the complete record.
  if (!formal && consultation.summary) layout.card("Resumen de cierre", [{ value: consultation.summary }], { tone: "mint", eyebrow: "VISTA GENERAL" });
  let sectionNumber = 0;
  let formalInterviewStarted = false;
  for (const section of snapshot.structure.sections) {
    const entries = section.questions
      .filter(question => !clinical?.coveredKeys.includes(question.question_key) && matchesCondition(question.visibility_condition, values) && !emptyValue(values[question.question_key]))
      .map(question => ({ label: question.label, value: formatAnswer(question, values[question.question_key]) }))
      .filter(entry => entry.value.trim());
    if (!entries.length) continue;
    if (formal) { if (!formalInterviewStarted) { layout.section("Entrevista clínica y hábitos"); formalInterviewStarted = true; } layout.card(section.title, entries, {flow:true}); continue; }
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
  for (const section of clinical?.sections ?? []) {
    if (!section.cards.length) continue;
    layout.section(section.title);
    for (const card of section.cards) layout.card(card.title, card.fields.filter(field => field.value.trim()), {flow: true});
  }
  if (formal && consultation.summary) { layout.section("Cierre de consulta"); layout.card("Resumen de cierre", [{value:consultation.summary}], {flow:true}); }
  layout.contacts();
  pdfFooters(pdf,design);
  return pdf;
}

export async function downloadConsultationPdf(
  filename: string,
  patient: Patient,
  consultation: Consultation,
  snapshot: ConsultationSnapshot,
  values: Record<string, unknown>,
  professional: ProfessionalDocumentInfo,
  clinical?: ConsultationDocumentData,
  design: PdfDesign = "current",
): Promise<void> {
  const pdf = await buildConsultationPdf(patient, consultation, snapshot, values, professional, clinical, design);
  downloadBlob(filename, pdf.output("blob"));
}
