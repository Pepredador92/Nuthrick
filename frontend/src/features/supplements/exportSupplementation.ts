import { downloadBlob, imageData, type ProfessionalDocumentInfo } from "@/src/features/consultations/exportText";
import { formatPatientDate } from "@/src/features/patients/patientUtils";
import { getProfessionalDocumentInfo } from "@/src/services/professionalDocuments";
import type { PatientSupplementation } from "@/src/services/patientSupplementation";
import type { Patient } from "@/src/types/domain";
import { pdfFooters, pdfLayout } from "../../../../supabase/functions/agenda/pdf-layout";
import type { PdfDesign } from "../../../../supabase/functions/agenda/document-design";
import { patientSupplements } from "../../../../supabase/functions/_shared/supplements";

const title = "Indicaciones de suplementación";

function supplementationContent(patient: Pick<Patient, "full_name">, record: PatientSupplementation, consultation?: string) {
  const details = [
    { label: "Paciente", value: patient.full_name },
    { label: "Fecha de indicación", value: formatPatientDate(record.updated_at) },
    ...(consultation ? [{ label: "Consulta vinculada", value: consultation }] : []),
  ];
  const products = patientSupplements(record.items).map(item => ({
    name: item.name,
    presentation: [item.brand, item.presentation].filter(Boolean).join(" · "),
    directions: item.instructions.startsWith(item.quantity + ".")
      ? item.instructions : [item.quantity, item.instructions].filter(Boolean).join("\n"),
  }));
  return { details, products };
}

export function supplementationTextExport(
  patient: Pick<Patient, "full_name">, record: PatientSupplementation, consultation?: string,
): string {
  const { details, products } = supplementationContent(patient, record, consultation);
  return [
    `Nuthrick · ${title}`,
    "",
    ...details.map(({ label, value }) => `${label}: ${value}`),
    ...products.flatMap(item => ["", [item.name, item.presentation, item.directions].filter(Boolean).join("\n")]),
    "",
  ].join("\n");
}

export function downloadSupplementationText(
  patient: Pick<Patient, "full_name">, record: PatientSupplementation, consultation?: string,
): void {
  const text = supplementationTextExport(patient, record, consultation);
  downloadBlob(`nuthrick-suplementacion-${record.id.slice(0, 8)}.txt`, new Blob([text], { type: "text/plain;charset=utf-8" }));
}

export async function buildSupplementationPdf(
  patient: Pick<Patient, "full_name">, record: PatientSupplementation,
  professional: ProfessionalDocumentInfo, design: PdfDesign, consultation?: string,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const logo = professional.logoUrl ? await imageData(professional.logoUrl) : null;
  const layout = pdfLayout(pdf, professional, logo, design, { title, continuation: patient.full_name, contacts: true });
  const { details, products } = supplementationContent(patient, record, consultation);
  layout.section(title);
  layout.card("Datos de la indicación", details, { tone: "blue", columns: 2 });
  for (const item of products) {
    layout.card(item.name, [
      { value: item.presentation },
      { value: item.directions },
    ].filter(field => field.value), { tone: "mint", flow: true, spaceAfter: 3 });
  }
  layout.contacts();
  pdfFooters(pdf, design, "Documento privado · Indicaciones para el paciente");
  return pdf;
}

export async function downloadSupplementationPdf(
  patient: Pick<Patient, "full_name" | "professional_id">,
  record: PatientSupplementation, design: PdfDesign, consultation?: string,
) {
  const professional = await getProfessionalDocumentInfo(patient.professional_id);
  const pdf = await buildSupplementationPdf(patient, record, professional, design, consultation);
  downloadBlob(`nuthrick-suplementacion-${record.id.slice(0, 8)}.pdf`, pdf.output("blob"));
}
