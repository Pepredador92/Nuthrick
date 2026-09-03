import { formatPatientDate } from "@/src/features/patients/patientUtils";
import {
  formatAnswer,
  matchesCondition,
} from "@/src/features/consultations/questionnaire";
import type {
  Consultation,
  ConsultationSnapshot,
  Patient,
} from "@/src/types/domain";

export interface ProfessionalDocumentInfo {
  fullName: string;
  professionalTitle?: string | null;
  licenseNumber?: string | null;
  businessName?: string | null;
  contactLines?: string[];
  logoUrl?: string | null;
}

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
          ...(professional.contactLines ?? []),
          "",
        ]
      : []),
    `Paciente: ${patient.full_name}`,
    `Fecha: ${formatPatientDate(consultation.consultation_date)}`,
    `Tipo: ${consultation.consultation_type === "initial" ? "Consulta inicial" : "Consulta de seguimiento"}`,
    `Plantilla: ${snapshot.template_name} · v${snapshot.template_version}`,
    "",
  ];
  for (const section of snapshot.structure.sections) {
    const entries = section.questions
      .filter((question) =>
        matchesCondition(question.visibility_condition, values),
      )
      .map(
        (question) =>
          [
            question.label,
            formatAnswer(question, values[question.question_key]),
          ] as const,
      )
      .filter(([, answer]) => answer && answer !== "Sin respuesta");
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
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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

export async function downloadConsultationPdf(
  filename: string,
  patient: Patient,
  consultation: Consultation,
  snapshot: ConsultationSnapshot,
  values: Record<string, unknown>,
  professional: ProfessionalDocumentInfo,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const logo = professional.logoUrl
    ? await imageData(professional.logoUrl)
    : null;
  let cursor = 18;

  const header = (compact = false) => {
    document.setFillColor(23, 61, 54);
    document.rect(0, 0, pageWidth, compact ? 20 : 34, "F");
    if (!compact && logo) {
      try {
        document.addImage(
          logo,
          logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG",
          margin,
          7,
          20,
          20,
          undefined,
          "FAST",
        );
      } catch {
        // A logo is optional; a text mark keeps the document usable.
      }
    }
    document.setTextColor(255, 255, 255);
    document.setFont("helvetica", "bold");
    document.setFontSize(compact ? 10 : 14);
    document.text(
      professional.businessName || professional.fullName,
      logo && !compact ? 40 : margin,
      compact ? 12 : 14,
    );
    if (!compact) {
      document.setFont("helvetica", "normal");
      document.setFontSize(8.5);
      const professionalLine = [
        professional.professionalTitle,
        professional.licenseNumber
          ? `Céd. ${professional.licenseNumber}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      if (professionalLine)
        document.text(professionalLine, logo ? 40 : margin, 21);
      const contact = professional.contactLines?.join(" · ");
      if (contact) document.text(contact, logo ? 40 : margin, 27);
    }
    document.setTextColor(38, 63, 55);
    cursor = compact ? 29 : 45;
  };

  const pageBreak = () => {
    document.addPage();
    header(true);
  };
  const write = (
    text: string,
    size = 9.5,
    color: [number, number, number] = [55, 77, 69],
    gap = 4.8,
  ) => {
    document.setFont("helvetica", "normal");
    document.setFontSize(size);
    document.setTextColor(...color);
    const lines = document.splitTextToSize(
      text,
      pageWidth - margin * 2,
    ) as string[];
    if (cursor + lines.length * gap > pageHeight - 18) pageBreak();
    document.text(lines, margin, cursor);
    cursor += lines.length * gap + 1.2;
  };
  const heading = (text: string) => {
    if (cursor + 13 > pageHeight - 18) pageBreak();
    document.setFillColor(237, 243, 239);
    document.roundedRect(
      margin,
      cursor - 5,
      pageWidth - margin * 2,
      9,
      2,
      2,
      "F",
    );
    document.setTextColor(31, 78, 67);
    document.setFont("helvetica", "bold");
    document.setFontSize(10.5);
    document.text(text, margin + 3, cursor + 1);
    cursor += 11;
  };

  header();
  document.setFillColor(248, 250, 248);
  document.roundedRect(
    margin,
    cursor - 5,
    pageWidth - margin * 2,
    27,
    3,
    3,
    "F",
  );
  document.setTextColor(31, 78, 67);
  document.setFont("helvetica", "bold");
  document.setFontSize(11);
  document.text("Registro de consulta", margin + 4, cursor + 1);
  document.setFont("helvetica", "normal");
  document.setFontSize(8.5);
  document.setTextColor(84, 105, 96);
  document.text(patientBasics(patient), margin + 4, cursor + 7);
  document.text(
    `Fecha: ${formatPatientDate(consultation.consultation_date)}  ·  ${consultation.consultation_type === "initial" ? "Consulta inicial" : "Consulta de seguimiento"}`,
    margin + 4,
    cursor + 22,
  );
  cursor += 34;

  for (const section of snapshot.structure.sections) {
    const entries = section.questions
      .filter((question) =>
        matchesCondition(question.visibility_condition, values),
      )
      .map(
        (question) =>
          [
            question.label,
            formatAnswer(question, values[question.question_key]),
          ] as const,
      )
      .filter(([, answer]) => answer && answer !== "Sin respuesta");
    if (!entries.length) continue;
    heading(section.title);
    for (const [label, answer] of entries) {
      document.setFont("helvetica", "bold");
      document.setFontSize(9.5);
      document.setTextColor(38, 63, 55);
      const labelLines = document.splitTextToSize(
        label,
        pageWidth - margin * 2,
      ) as string[];
      if (cursor + labelLines.length * 4.8 + 8 > pageHeight - 18) pageBreak();
      document.text(labelLines, margin, cursor);
      cursor += labelLines.length * 4.8;
      write(answer, 9.2, [95, 112, 104], 4.6);
      cursor += 2;
    }
  }
  if (consultation.summary) {
    heading("Resumen de cierre");
    write(consultation.summary);
  }
  const totalPages = document.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    document.setPage(page);
    document.setDrawColor(218, 228, 221);
    document.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    document.setFont("helvetica", "normal");
    document.setFontSize(7.5);
    document.setTextColor(111, 128, 120);
    document.text(
      "Documento privado · Información clínica confidencial",
      margin,
      pageHeight - 7,
    );
    document.text(
      `Página ${page} de ${totalPages}`,
      pageWidth - margin,
      pageHeight - 7,
      { align: "right" },
    );
  }
  document.save(filename);
}
