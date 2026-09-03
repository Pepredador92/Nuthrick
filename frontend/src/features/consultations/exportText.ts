import { formatPatientDate } from "@/src/features/patients/patientUtils";
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

export interface ProfessionalDocumentInfo {
  fullName: string;
  professionalTitle?: string | null;
  licenseNumber?: string | null;
  businessName?: string | null;
  businessAddress?: string | null;
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
          ...(professional.businessAddress
            ? [`Dirección del establecimiento: ${professional.businessAddress}`]
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

export async function downloadConsultationPdf(
  filename: string,
  patient: Patient,
  consultation: Consultation,
  snapshot: ConsultationSnapshot,
  values: Record<string, unknown>,
  professional: ProfessionalDocumentInfo,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 16;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const logo = professional.logoUrl
    ? await imageData(professional.logoUrl)
    : null;
  let cursor = 18;

  const header = (compact = false) => {
    const brand =
      professional.businessName?.trim() ||
      professional.fullName.trim() ||
      "Nuthrick";
    const width = pageWidth - margin * 2;
    pdf.setFillColor(23, 61, 54);
    pdf.rect(0, 0, pageWidth, 2, "F");
    pdf.setFillColor(205, 161, 96);
    pdf.rect(margin, 2, 28, 1.2, "F");

    if (compact) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      const lines = pdf.splitTextToSize(brand, width) as string[];
      pdf.setTextColor(23, 61, 54);
      pdf.text(lines, margin, 12);
      cursor = 14 + lines.length * 4;
      pdf.setDrawColor(220, 229, 223);
      pdf.line(margin, cursor, pageWidth - margin, cursor);
      cursor += 10;
      return;
    }

    const textWidth = width - (logo ? 38 : 0);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(140, 103, 53);
    pdf.text("NUTRICIÓN Y BIENESTAR", margin, 13);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(21);
    const brandLines = pdf.splitTextToSize(brand, textWidth) as string[];
    pdf.setTextColor(23, 61, 54);
    pdf.text(brandLines, margin, 23, { lineHeightFactor: 1.12 });
    let identityY = 23 + brandLines.length * 8.3 + 2;

    if (logo) {
      try {
        const properties = pdf.getImageProperties(logo);
        const scale = Math.min(28 / properties.width, 28 / properties.height);
        const width = properties.width * scale;
        const height = properties.height * scale;
        pdf.addImage(
          logo,
          properties.fileType,
          pageWidth - margin - 28 + (28 - width) / 2,
          12 + (28 - height) / 2,
          width,
          height,
          undefined,
          "FAST",
        );
      } catch {
        // The professional identity remains readable if an optional image is unavailable.
      }
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    const nameLines = pdf.splitTextToSize(
      professional.fullName,
      textWidth,
    ) as string[];
    pdf.text(nameLines, margin, identityY);
    identityY += nameLines.length * 4.6 + 1;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(93, 112, 103);
    const credentials = [
      professional.professionalTitle?.trim(),
      professional.licenseNumber
        ? `Cédula profesional ${professional.licenseNumber}`
        : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
    if (credentials) {
      const lines = pdf.splitTextToSize(credentials, textWidth) as string[];
      pdf.text(lines, margin, identityY);
      identityY += lines.length * 4 + 2;
    }

    const contactLines = [
      professional.businessAddress,
      ...(professional.contactLines ?? []),
    ]
      .filter((line): line is string => Boolean(line?.trim()))
      .flatMap((line) => pdf.splitTextToSize(line, width - 10) as string[]);
    cursor = Math.max(logo ? 46 : 0, identityY + 3);
    if (contactLines.length) {
      const height = contactLines.length * 3.8 + 8;
      pdf.setFillColor(243, 247, 244);
      pdf.roundedRect(margin, cursor, width, height, 2, 2, "F");
      pdf.setTextColor(81, 105, 94);
      pdf.setFontSize(8);
      pdf.text(contactLines, margin + 5, cursor + 5.5, {
        lineHeightFactor: 1.34,
      });
      cursor += height + 10;
    } else {
      pdf.setDrawColor(220, 229, 223);
      pdf.line(margin, cursor, pageWidth - margin, cursor);
      cursor += 10;
    }
  };

  const pageBreak = () => {
    pdf.addPage();
    header(true);
  };
  const write = (
    text: string,
    size = 9.5,
    color: [number, number, number] = [55, 77, 69],
    gap = 4.8,
  ) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(text, pageWidth - margin * 2) as string[];
    for (const line of lines) {
      if (cursor + gap > pageHeight - 18) pageBreak();
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      pdf.text(line, margin, cursor);
      cursor += gap;
    }
    cursor += 1.2;
  };
  const heading = (text: string) => {
    if (cursor + 13 > pageHeight - 18) pageBreak();
    pdf.setFillColor(237, 243, 239);
    pdf.roundedRect(margin, cursor - 5, pageWidth - margin * 2, 9, 2, 2, "F");
    pdf.setTextColor(31, 78, 67);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.text(text, margin + 3, cursor + 1);
    cursor += 11;
  };

  header();
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(140, 103, 53);
  pdf.text("REGISTRO CLÍNICO", margin, cursor);
  cursor += 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(23, 61, 54);
  pdf.text("Informe de consulta nutricional", margin, cursor);
  cursor += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(93, 112, 103);
  pdf.text(
    `${formatPatientDate(consultation.consultation_date)}  ·  ${consultation.consultation_type === "initial" ? "Consulta inicial" : "Consulta de seguimiento"}`,
    margin,
    cursor,
  );
  cursor += 7;
  const basics = patientBasics(patient).flatMap(
    (line) =>
      pdf.splitTextToSize(line, pageWidth - margin * 2 - 10) as string[],
  );
  const patientHeight = basics.length * 4.2 + 10;
  pdf.setFillColor(248, 250, 248);
  pdf.roundedRect(
    margin,
    cursor,
    pageWidth - margin * 2,
    patientHeight,
    2,
    2,
    "F",
  );
  pdf.setFillColor(205, 161, 96);
  pdf.rect(margin, cursor + 3, 0.8, patientHeight - 6, "F");
  pdf.setTextColor(55, 77, 69);
  pdf.text(basics, margin + 5, cursor + 6, { lineHeightFactor: 1.4 });
  cursor += patientHeight + 11;

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
    heading(section.title);
    for (const [label, answer] of entries) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(38, 63, 55);
      const labelLines = pdf.splitTextToSize(
        label,
        pageWidth - margin * 2,
      ) as string[];
      if (cursor + labelLines.length * 4.8 + 8 > pageHeight - 18) pageBreak();
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(38, 63, 55);
      pdf.text(labelLines, margin, cursor);
      cursor += labelLines.length * 4.8;
      write(answer, 9.2, [95, 112, 104], 4.6);
      cursor += 2;
    }
  }
  if (consultation.summary) {
    heading("Resumen de cierre");
    write(consultation.summary);
  }
  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(218, 228, 221);
    pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(111, 128, 120);
    pdf.text(
      "Documento privado · Información clínica confidencial",
      margin,
      pageHeight - 7,
    );
    pdf.text(
      `Página ${page} de ${totalPages}`,
      pageWidth - margin,
      pageHeight - 7,
      { align: "right" },
    );
  }
  downloadBlob(filename, pdf.output("blob"));
}
