import type { jsPDF } from "jspdf";
import { DocumentLayout } from "./document-layout.ts";
import {
  drawDocumentFooters,
  type ProfessionalDocumentInfo,
} from "./document-letterhead.ts";
import {
  drawFormalFooters,
  FormalDocumentLayout,
} from "./formal-document-layout.ts";
import type { PdfDesign } from "./document-design.ts";
export function pdfLayout(
  pdf: jsPDF,
  professional: ProfessionalDocumentInfo,
  logo: string | null,
  design: PdfDesign,
  details: { contacts?: boolean; continuation?: string; strictLogo?: boolean } =
    {},
) {
  return design === "formal"
    ? new FormalDocumentLayout(pdf, professional, logo, details)
    : new DocumentLayout(pdf, professional, logo, details);
}
export function pdfFooters(pdf: jsPDF, design: PdfDesign, label?: string) {
  if (design === "formal") drawFormalFooters(pdf);
  else drawDocumentFooters(pdf, label);
}
