import type { jsPDF } from "jspdf";
import { drawProfessionalHeader, type ProfessionalDocumentInfo } from "./document-letterhead.ts";

export const documentColors = { ink: "#203d48", muted: "#627681", teal: "#147e86", mint: "#edf6f0", violet: "#f2eff8", blue: "#edf5fa", line: "#dce6e8" };
export const documentRgb = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
export const documentText = (value: string) => value.replace(/[−–—]/g, "-").replace(/→/g, ">").replace(/×/g, "x").replace(/≤/g, "<=").replace(/≥/g, ">=");
export type DocumentField = { label?: string; value: string; inlineLabel?: boolean; spaceBefore?: number };
export type CardOptions = { eyebrow?: string; tone?: "mint" | "violet" | "blue"; columns?: 1 | 2 | 3; flow?: boolean; justify?: boolean; metrics?: boolean; spaceAfter?: number };
export type DocumentTextLine = { value: string; words?: { value: string; bold: boolean; width: number }[]; justify?: boolean };

/** Wrap styled labels and paragraphs together, retaining explicit line breaks. */
export function documentFieldLines(pdf: jsPDF, field: DocumentField, width: number, font: string, size: number, justify = false): DocumentTextLine[] {
  pdf.setFont(font, "normal"); pdf.setFontSize(size);
  if (!justify && !field.inlineLabel) return (pdf.splitTextToSize(documentText(field.value), width) as string[]).map(value => ({value}));
  const result: DocumentTextLine[] = [];
  const measure = (value: string, bold = false) => { pdf.setFont(font, bold ? "bold" : "normal"); return pdf.getTextWidth(value); };
  const space = measure(" ");
  for (const [index, paragraph] of documentText(field.value).split(/\r?\n/).entries()) {
    const words = [
      ...(index === 0 && field.inlineLabel && field.label ? `${field.label.replace(/:$/, "")}:`.split(/\s+/).map(value => ({value, bold: true})) : []),
      ...(paragraph.match(/\S+/g) ?? []).map(value => ({value, bold: false})),
    ].flatMap(word => {
      pdf.setFont(font, word.bold ? "bold" : "normal");
      return (pdf.splitTextToSize(word.value, width) as string[]).map(value => ({value, bold: word.bold, width: measure(value, word.bold)}));
    });
    const lines: NonNullable<DocumentTextLine["words"]>[] = [[]];
    let used = 0;
    for (const word of words) {
      const line = lines[lines.length - 1], gap = line.length ? space : 0;
      if (line.length && used + gap + word.width > width) { lines.push([word]); used = word.width; }
      else { line.push(word); used += gap + word.width; }
    }
    lines.forEach((line, i) => result.push({value: line.map(word => word.value).join(" "), words: line, justify: justify && i < lines.length - 1 && !/^\s*(?:[•*-]|\d+[.)])\s/.test(paragraph)}));
  }
  return result;
}

export function drawDocumentTextLine(pdf: jsPDF, line: DocumentTextLine, x: number, y: number, width: number, font: string, size: number) {
  pdf.setFont(font, "normal"); pdf.setFontSize(size);
  if (!line.words) { pdf.text(line.value, x, y); return; }
  const space = pdf.getTextWidth(" "), count = line.words.length;
  const extra = line.justify && count > 1 ? Math.max(0, (width - line.words.reduce((sum, word) => sum + word.width, 0) - space * (count - 1)) / (count - 1)) : 0;
  for (const word of line.words) {
    pdf.setFont(font, word.bold ? "bold" : "normal"); pdf.text(word.value, x, y);
    x += word.width + space + extra;
  }
}

/** Measured cards split at row/line boundaries; every answer remains in the PDF. */
export class DocumentLayout {
  y: number;
  private pendingSection: {title: string; subtitle?: string} | null = null;
  readonly x = 16;
  readonly width: number;
  readonly bottom: number;
  constructor(readonly pdf: jsPDF, readonly professional: ProfessionalDocumentInfo, readonly logo: string | null = null, readonly headerDetails: {contacts?: boolean; continuation?: string; strictLogo?: boolean} = {}) {
    this.width = pdf.internal.pageSize.getWidth() - 32;
    this.bottom = pdf.internal.pageSize.getHeight() - 21;
    this.y = drawProfessionalHeader(pdf, professional, logo, false, 'FAST', headerDetails.contacts, headerDetails.strictLogo);
  }
  newPage() {
    if (this.pdf.getNumberOfPages() >= 120) throw new Error("document_too_large");
    this.pdf.addPage();
    this.y = drawProfessionalHeader(this.pdf, this.professional, this.logo, true);
    if(this.headerDetails.continuation){const lines=this.lines(this.headerDetails.continuation,this.width,8);this.text(lines,this.x,this.y,8,false,documentColors.muted);this.y+=lines.length*4+5;}
  }
  ensure(height: number) { if (this.y + height > this.bottom) this.newPage(); }
  lines(value: string, width: number, size = 10, bold = false) {
    this.pdf.setFont("helvetica", bold ? "bold" : "normal"); this.pdf.setFontSize(size);
    return this.pdf.splitTextToSize(documentText(value), width) as string[];
  }
  text(value: string | string[], x: number, y: number, size = 10, bold = false, color = documentColors.ink) {
    this.pdf.setFont("helvetica", bold ? "bold" : "normal"); this.pdf.setFontSize(size);
    this.pdf.setTextColor(...documentRgb(color));
    this.pdf.text(typeof value === "string" ? documentText(value) : value.map(documentText), x, y, { lineHeightFactor: 1.4 });
  }
  section(title: string, subtitle?: string) {
    this.flushSection();
    this.pendingSection = {title, subtitle};
  }
  flushSection(followingHeight = 30) {
    if (!this.pendingSection) return;
    const {title, subtitle} = this.pendingSection;
    this.pendingSection = null;
    const titleLines = this.lines(title, this.width - 12, 15, true);
    const sub = subtitle ? this.lines(subtitle, this.width - 12, 9) : [];
    const height = titleLines.length * 7.4 + sub.length * 4.5 + 13;
    this.ensure(height + Math.min(followingHeight, this.bottom - 35 - height));
    this.pdf.setFillColor(...documentRgb(documentColors.teal)); this.pdf.roundedRect(this.x, this.y, 1.2, height - 6, .6, .6, "F");
    this.text(titleLines, this.x + 5, this.y + 5, 15, true);
    if (sub.length) this.text(sub, this.x + 5, this.y + 6 + titleLines.length * 7.4, 9, false, documentColors.muted);
    this.y += height;
  }
  card(title: string, fields: DocumentField[], options: CardOptions = {}) {
    const columns = fields.length === 1 ? 1 : options.columns ?? 1, padding = 6, gutter = 10;
    const colWidth = (this.width - padding * 2 - gutter * (columns - 1)) / columns;
    const titleLines = this.lines(title, this.width - padding * 2, 12, true);
    const headerHeight = 8 + titleLines.length * 5.9 + (options.eyebrow ? 5 : 0);
    const rowGap = 4, bodySize = options.metrics ? 15 : 10, bodyHeight = options.metrics ? 7 : 4.95;
    const rows: Array<Array<{ label: string[]; body: DocumentTextLine[]; spaceBefore: number }>> = [];
    for (let index = 0; index < fields.length; index += columns) {
      rows.push(fields.slice(index, index + columns).map(field => ({
        label: field.label && !field.inlineLabel ? this.lines(field.label, colWidth, 8, true) : [],
        body: documentFieldLines(this.pdf, field, colWidth, "helvetica", bodySize, options.justify),
        spaceBefore: field.spaceBefore ?? 0,
      })));
    }
    if (!rows.length) rows.push([{ label: [], body: [], spaceBefore: 0 }]);
    const cellHeight = (cell: (typeof rows)[number][number]) => cell.spaceBefore + cell.label.length * 4 + cell.body.length * bodyHeight;
    const attachedToHeading = Boolean(this.pendingSection);
    const totalHeight = rows.reduce((sum, row) => sum + Math.max(...row.map(cellHeight)) + rowGap, 0) + headerHeight + padding;
    this.flushSection(options.flow ? Math.min(totalHeight, 70) : totalHeight);
    let rowIndex = 0, continuation = false;
    while (rowIndex < rows.length) {
      // Move a normal card as a whole when it fits a fresh page.
      const remainingHeight = rows.slice(rowIndex).reduce((sum, row) => sum + Math.max(...row.map(cellHeight)) + rowGap, 0) + headerHeight + padding;
      const newPageCapacity = this.bottom - 30;
      if (!options.flow && (!attachedToHeading || continuation) && remainingHeight <= newPageCapacity && this.y + remainingHeight > this.bottom) this.newPage();
      this.ensure(headerHeight + 22);
      const available = this.bottom - this.y - headerHeight - padding;
      const chunks: typeof rows = [];
      let used = 0;
      while (rowIndex < rows.length) {
        const row = rows[rowIndex];
        const height = Math.max(...row.map(cellHeight)) + rowGap;
        if (used + height <= available) { chunks.push(row); used += height; rowIndex++; continue; }
        if (chunks.length && height <= newPageCapacity - headerHeight - padding) break;
        // A long answer gets continuation cards instead of clipping or shrinking.
        const labelHeight = Math.max(...row.map(cell => cell.spaceBefore + cell.label.length * 4));
        const count = Math.max(1, Math.floor((available - used - labelHeight - rowGap) / bodyHeight));
        if (chunks.length && count < 3) break;
        chunks.push(row.map(cell => ({ ...cell, body: cell.body.slice(0, count) })));
        rows[rowIndex] = row.map(cell => ({ ...cell, spaceBefore: 0, body: cell.body.slice(count) }));
        used += Math.max(...chunks.at(-1)!.map(cellHeight)) + rowGap;
        if (rows[rowIndex].every(cell => !cell.body.length)) rowIndex++;
        break;
      }
      const height = headerHeight + used + padding;
      const top = this.y;
      this.pdf.setFillColor(222, 232, 235); this.pdf.roundedRect(this.x + .6, top + 1.2, this.width, height, 3, 3, "F");
      this.pdf.setFillColor(...documentRgb(options.tone ? documentColors[options.tone] : "#ffffff"));
      this.pdf.setDrawColor(...documentRgb(documentColors.line)); this.pdf.setLineWidth(.2);
      this.pdf.roundedRect(this.x, top, this.width, height, 3, 3, "FD");
      if (options.eyebrow) this.text(options.eyebrow + (continuation ? " / continuación" : ""), this.x + padding, top + 7, 8, true, documentColors.teal);
      this.text(titleLines, this.x + padding, top + (options.eyebrow ? 13 : 8), 12, true);
      let atY = top + headerHeight + 1;
      for (const row of chunks) {
        row.forEach((cell, index) => {
          const x = this.x + padding + index * (colWidth + gutter);
          const y = atY + cell.spaceBefore;
          if (cell.label.length) this.text(cell.label, x, y, 8, true, documentColors.muted);
          this.pdf.setTextColor(...documentRgb(documentColors.ink));
          cell.body.forEach((line, i) => drawDocumentTextLine(this.pdf, line, x, y + cell.label.length * 4 + i * bodyHeight, colWidth, "helvetica", bodySize));
        });
        atY += Math.max(...row.map(cellHeight)) + rowGap;
      }
      this.y += height + (options.spaceAfter ?? 7);
      if (rowIndex < rows.length) { this.newPage(); continuation = true; }
    }
  }
  contacts() {
    const contacts = [this.professional.businessAddress, ...(this.professional.contactLines ?? [])].filter((v): v is string => Boolean(v?.trim()));
    if (contacts.length) this.card("Tu profesional", contacts.map(value => ({ value })), { tone: "blue" });
  }
}
