import { downloadBlob, imageData, type ProfessionalDocumentInfo } from "@/src/features/consultations/exportText";
import { consultationLabel, formatPatientDate } from "@/src/features/patients/patientUtils";
import { getProfessionalDocumentInfo } from "@/src/services/professionalDocuments";
import type { Patient } from "@/src/types/domain";
import { pdfFooters, pdfLayout } from "../../../../supabase/functions/agenda/pdf-layout";
import type { PdfDesign } from "../../../../supabase/functions/agenda/document-design";
import type { DocumentField } from "../../../../supabase/functions/agenda/document-layout";
import { goalStatuses, strategyStatuses, type ProgressDocument, type ProgressReview, type ProgressSource } from "./clinicalProgress";

type ExportPatient = Pick<Patient, "full_name" | "professional_id">;
type ProgressField = DocumentField & { compact?: boolean };

const title = "Progreso del paciente";
const confidential = "Documento privado · Información clínica confidencial";

function progressContent(patient: ExportPatient, source: ProgressSource, review: ProgressReview | null, document: ProgressDocument) {
  const details = [
    { label: "Paciente", value: patient.full_name },
    { label: "Consulta de origen", value: `${consultationLabel(source)} · ${formatPatientDate(source.consultation_date)}` },
    { label: "Versión", value: review ? `Revisión ${review.version} · ${formatPatientDate(review.recorded_at)}` : "Acuerdos originales" },
    ...(review?.review_consultation_date ? [{ label: "Consulta de seguimiento", value: formatPatientDate(review.review_consultation_date) }] : []),
  ];
  const sections = [
    {
      title: "Objetivos acordados",
      cards: document.goals.map((goal, index) => ({
        title: `Objetivo ${index + 1}`,
        fields: [
          { value: goal.text },
          { label: "Avance", value: goalStatuses[goal.assessment.status], compact: true },
          { label: "Resultado observado", value: goal.assessment.result, compact: !goal.assessment.result.includes("\n") && goal.assessment.result.length <= 80 },
          { label: "Nota de seguimiento", value: goal.assessment.note },
          { label: "Última revisión", value: goal.assessment.date ? formatPatientDate(goal.assessment.date) : "" },
        ] satisfies ProgressField[],
      })),
    },
    {
      title: "Estrategias acordadas",
      cards: document.strategies.map((strategy, index) => ({
        title: `Estrategia ${index + 1}`,
        fields: [
          { value: strategy.text },
          { label: "Objetivos vinculados", value: document.goals.flatMap((goal, i) => strategy.goalIds.includes(goal.id) ? [`Objetivo ${i + 1}`] : []).join(", "), compact: true },
          { label: "¿Se aplicó?", value: strategyStatuses[strategy.assessment.status], compact: true },
          { label: "Última revisión", value: strategy.assessment.date ? formatPatientDate(strategy.assessment.date) : "" },
        ] satisfies ProgressField[],
      })),
    },
    {
      title: "Indicaciones de la consulta",
      cards: document.instructions.trim() ? [{ title: "Indicaciones acordadas", fields: [{ value: document.instructions }] as ProgressField[] }] : [],
    },
  ];
  return { details, sections };
}

export async function buildProgressPdf(patient: ExportPatient, source: ProgressSource, review: ProgressReview | null, document: ProgressDocument, professional: ProfessionalDocumentInfo, design: PdfDesign) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const logo = professional.logoUrl ? await imageData(professional.logoUrl) : null;
  const { details, sections } = progressContent(patient, source, review, document);
  const layout = pdfLayout(pdf, professional, logo, design, { title, continuation: patient.full_name, contacts: true });
  layout.section(title);
  layout.card("Datos del seguimiento", details.map((field) => ({ ...field, inlineLabel: true })), { tone: "blue", columns: 2, spaceAfter: 3 });
  const cardOptions = { spaceAfter: 2 };
  for (const section of sections) {
    if (!section.cards.length) continue;
    const singleBlock = section.title === "Indicaciones de la consulta" && section.cards.length === 1;
    if (singleBlock && design === "formal") layout.ensure(45);
    if (!singleBlock || design === "formal") layout.section(section.title);
    for (const card of section.cards) {
      const [description, ...metadata] = card.fields;
      const summaries = metadata.filter(({ value }) => value.trim());
      // Keep the agreements together and put short labels on the same line.
      const summary = [
        summaries.filter((field) => "compact" in field && field.compact)
          .map(({ label, value }) => `${label}: ${value}`).join(" · "),
        ...summaries.filter((field) => !("compact" in field && field.compact))
          .map(({ label, value }) => `${label}: ${value}`),
      ].filter(Boolean).join("\n");
      const fields = [{ value: [description.value, summary].filter((value) => value.trim()).join("\n") }];
      layout.card(singleBlock && design === "current" ? section.title : card.title, fields, { ...cardOptions, flow: singleBlock });
    }
  }
  pdfFooters(pdf, design, confidential);
  return pdf;
}

async function wordLogo(url?: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(120 / bitmap.width, 46 / bitmap.height, 1);
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) { bitmap.close(); return null; }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? { data: await blob.arrayBuffer(), width: canvas.width, height: canvas.height } : null;
  } catch {
    return null;
  }
}

export async function buildProgressWord(patient: ExportPatient, source: ProgressSource, review: ProgressReview | null, document: ProgressDocument, professional: ProfessionalDocumentInfo) {
  const { AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, TabStopType, TextRun } = await import("docx");
  const { details, sections } = progressContent(patient, source, review, document);
  const logo = await wordLogo(professional.logoUrl);
  const identity = professional.businessName || professional.fullName || "Nuthrick";
  const credential = [
    professional.businessName ? professional.fullName : "",
    professional.professionalTitle,
    professional.licenseNumber ? `Cédula profesional ${professional.licenseNumber}` : "",
  ].filter(Boolean).join(" · ");
  const contacts = [professional.businessAddress, ...(professional.contactLines ?? [])].filter(Boolean).join(" · ");
  const bodyField = ({ label, value }: DocumentField) => value.trim() ? value.split(/\r?\n/).map((line, index) => new Paragraph({
    children: [
      ...(label && index === 0 ? [new TextRun({ text: `${label}  `, bold: true })] : []),
      new TextRun(line),
    ],
  })) : [];
  const file = new Document({
    title,
    creator: identity,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { after: 65, line: 255 } } },
        title: { run: { color: "000000", bold: true, size: 42 }, paragraph: { spacing: { after: 200 } } },
        heading1: { run: { color: "000000", bold: true, size: 29 }, paragraph: { spacing: { before: 190, after: 100 }, keepNext: true } },
        heading2: { run: { color: "000000", bold: true, size: 24 }, paragraph: { spacing: { before: 125, after: 80 }, keepNext: true } },
      },
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1760, bottom: 1050, left: 960, right: 960, header: 420, footer: 420 } } },
      headers: { default: new Header({ children: [
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: 9986 }],
          children: [
            new TextRun({ text: identity, bold: true, size: 27 }),
            new TextRun("\t"),
            logo ? new ImageRun({ data: logo.data, type: "png", transformation: { width: logo.width, height: logo.height } }) : new TextRun({ text: identity === "Nuthrick" ? "" : "Nuthrick", bold: true }),
          ],
        }),
        new Paragraph({
          border: { bottom: { color: "A8BEB1", space: 5, style: BorderStyle.SINGLE, size: 5 } },
          children: [new TextRun({ text: [credential, `Generado el ${formatPatientDate(new Date().toISOString())}`].filter(Boolean).join(" · "), size: 17, color: "4D6256" })],
        }),
      ] }) },
      footers: { default: new Footer({ children: [
        new Paragraph({
          border: { top: { color: "A8BEB1", space: 5, style: BorderStyle.SINGLE, size: 5 } },
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ children: [confidential, " · Página ", PageNumber.CURRENT], size: 16, color: "4D6256" })],
        }),
      ] }) },
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
        ...details.flatMap(bodyField),
        ...bodyField({ value: contacts }),
        ...sections.flatMap((section) => section.cards.length ? [
          new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
          ...section.cards.flatMap((card) => [
            ...(section.title === "Indicaciones de la consulta" ? [] : [new Paragraph({ text: card.title, heading: HeadingLevel.HEADING_2 })]),
            ...card.fields.flatMap(bodyField),
          ]),
        ] : []),
      ],
    }],
  });
  return Packer.toArrayBuffer(file);
}

function filename(source: ProgressSource, review: ProgressReview | null, extension: string) {
  return `progreso-${source.consultation_date.slice(0, 10)}-${review ? `revision-${review.version}` : "original"}.${extension}`;
}

export async function downloadProgressPdf(patient: ExportPatient, source: ProgressSource, review: ProgressReview | null, document: ProgressDocument, design: PdfDesign) {
  const professional = await getProfessionalDocumentInfo(patient.professional_id);
  const pdf = await buildProgressPdf(patient, source, review, document, professional, design);
  downloadBlob(filename(source, review, "pdf"), pdf.output("blob"));
}

export async function downloadProgressWord(patient: ExportPatient, source: ProgressSource, review: ProgressReview | null, document: ProgressDocument) {
  const professional = await getProfessionalDocumentInfo(patient.professional_id);
  const word = await buildProgressWord(patient, source, review, document, professional);
  downloadBlob(filename(source, review, "docx"), new Blob([word], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
}
