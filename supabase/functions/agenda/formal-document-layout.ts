import type { jsPDF } from "jspdf";
import { drawLetterhead, drawDocumentFooters, type ProfessionalDocumentInfo, type DocumentHeaderDetails } from "./document-letterhead.ts";
import { DocumentLayout, type CardOptions, type DocumentField } from "./document-layout.ts";
export function drawFormalHeader(pdf: jsPDF, professional: ProfessionalDocumentInfo, logo: string | null, compact = false, strictLogo = false, details: DocumentHeaderDetails = {}): number {
  return drawLetterhead(pdf, professional, logo, compact, true, { ...details, contacts: true, strictLogo });
}
export function drawFormalFooters(pdf: jsPDF, label?: string) { drawDocumentFooters(pdf, label, true); }
/** Serif variant of the same measured letterhead, columns and framed blocks. */
export class FormalDocumentLayout extends DocumentLayout {
  private sectionNumber = 0;
  private subsectionNumber = 0;
  private formalStarted = false;
  constructor(pdf: jsPDF, professional: ProfessionalDocumentInfo, logo: string | null = null, details: DocumentHeaderDetails = {}) {
    super(pdf, professional, logo, { ...details, contacts: true }, true);
  }
  override section(title: string, subtitle?: string) {
    if (!this.formalStarted) { this.formalStarted = true; super.section(title, subtitle); return; }
    this.sectionNumber++; this.subsectionNumber = 0;
    super.section(`${this.sectionNumber}. ${title.replace(/^\d+\s*[·.]\s*/, "")}`, subtitle);
  }
  override card(title: string, fields: DocumentField[], options: CardOptions = {}) {
    super.card(this.sectionNumber ? `${this.sectionNumber}.${++this.subsectionNumber} ${title}` : title, fields, options);
  }
}
