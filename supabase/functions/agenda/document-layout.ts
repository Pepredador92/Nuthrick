import type { jsPDF } from "jspdf";
import { drawLetterhead, type ProfessionalDocumentInfo, type DocumentHeaderDetails } from "./document-letterhead.ts";

export const documentColors = { ink: "#243d33", muted: "#627369", teal: "#25745d", mint: "#f3f8f4", violet: "#f7f5fa", blue: "#f2f6f5", line: "#d7e2db" };
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
  private pendingSection: {title: string; subtitle?: string; main: boolean} | null = null;
  private started = false;
  readonly font: string;
  readonly x = 16;
  readonly width: number;
  readonly bottom: number;
  constructor(readonly pdf: jsPDF, readonly professional: ProfessionalDocumentInfo, readonly logo: string | null = null, readonly headerDetails: DocumentHeaderDetails = {}, readonly formal = false) {
    this.font = formal ? "times" : "helvetica";
    this.headerDetails = { ...headerDetails, generatedAt: headerDetails.generatedAt ?? new Date().toISOString() };
    this.width = pdf.internal.pageSize.getWidth() - 32;
    this.bottom = pdf.internal.pageSize.getHeight() - 23;
    this.y = drawLetterhead(pdf, professional, logo, false, formal, this.headerDetails);
  }
  newPage() {
    if (this.pdf.getNumberOfPages() >= 120) throw new Error("document_too_large");
    this.pdf.addPage();
    this.y = drawLetterhead(this.pdf, this.professional, this.logo, true, this.formal, this.headerDetails);
    if(this.headerDetails.continuation){const lines=this.lines(this.headerDetails.continuation,this.width,8);this.text(lines,this.x,this.y,8,false,documentColors.muted);this.y+=lines.length*4+5;}
  }
  ensure(height: number) { if (this.y + height > this.bottom) this.newPage(); }
  lines(value: string, width: number, size = 10, bold = false) {
    this.pdf.setFont(this.font, bold ? "bold" : "normal"); this.pdf.setFontSize(size);
    return this.pdf.splitTextToSize(documentText(value), width) as string[];
  }
  text(value: string | string[], x: number, y: number, size = 10, bold = false, color = documentColors.ink) {
    this.pdf.setFont(this.font, bold ? "bold" : "normal"); this.pdf.setFontSize(size);
    this.pdf.setTextColor(...documentRgb(color));
    this.pdf.text(typeof value === "string" ? documentText(value) : value.map(documentText), x, y, { lineHeightFactor: 1.3 });
  }
  section(title: string, subtitle?: string) {
    this.flushSection();
    this.pendingSection = {title, subtitle, main: !this.started};
    this.started = true;
  }
  flushSection(followingHeight = 30) {
    if (!this.pendingSection) return;
    const {title, subtitle, main} = this.pendingSection;
    this.pendingSection = null;
    const size = main ? (this.formal ? 16 : 14) : 11.5;
    const step = main ? 6.3 : 5.2;
    const titleLines = this.lines(title, this.width, size, true);
    const sub = subtitle ? this.lines(subtitle, this.width, 8.5) : [];
    const height = titleLines.length * step + sub.length * 3.8 + 6;
    this.ensure(height + Math.min(followingHeight, this.bottom - 42 - height));
    this.text(titleLines, this.x, this.y + 4, size, true, main ? documentColors.ink : documentColors.teal);
    if (sub.length) this.text(sub, this.x, this.y + 4 + titleLines.length * step, 8.5, false, documentColors.muted);
    this.pdf.setDrawColor(...documentRgb(documentColors.line)); this.pdf.setLineWidth(.2);
    this.pdf.line(this.x, this.y + height - 3, this.x + this.width, this.y + height - 3);
    this.y += height;
  }
  card(title: string, fields: DocumentField[], options: CardOptions = {}) {
    const compactFields = options.flow && fields.length >= 4 && fields.every(field => field.value.length <= 180 && !field.value.includes("\n"));
    const columns = fields.length === 1 ? 1 : options.columns ?? (compactFields ? 2 : 1), padding = 4, gutter = 6;
    const colWidth = (this.width - padding * 2 - gutter * (columns - 1)) / columns;
    const titleLines = this.lines(title, this.width - padding * 2, 10.5, true);
    const headerHeight = 6 + titleLines.length * 5 + (options.eyebrow ? 3.5 : 0);
    const rowGap = compactFields ? 2 : 2.8;
    const bodySize = options.metrics ? 14 : compactFields ? 9.5 : this.formal ? 10.5 : 10;
    const bodyHeight = options.metrics ? 6.5 : compactFields ? 4.2 : this.formal ? 4.8 : 4.6;
    const rows: Array<Array<{ label: string[]; body: DocumentTextLine[]; spaceBefore: number }>> = [];
    for (let index = 0; index < fields.length; index += columns) {
      rows.push(fields.slice(index, index + columns).map(field => {
        const inline = compactFields && field.label && field.value.length <= 100 && field.label.length <= 40;
        const item = inline ? { ...field, inlineLabel: true } : field;
        return {
          label: item.label && !item.inlineLabel ? this.lines(item.label, colWidth, 7.5, true) : [],
          body: documentFieldLines(this.pdf, item, colWidth, this.font, bodySize, options.justify),
          spaceBefore: item.spaceBefore ?? 0,
        };
      }));
    }
    if (!rows.length) rows.push([{ label: [], body: [], spaceBefore: 0 }]);
    const cellHeight = (cell: (typeof rows)[number][number]) => cell.spaceBefore + cell.label.length * 3.4 + Math.max(0, cell.body.length - 1) * bodyHeight + (cell.body.length ? 2 : 0);
    const attachedToHeading = Boolean(this.pendingSection);
    const totalHeight = rows.reduce((sum, row) => sum + Math.max(...row.map(cellHeight)) + rowGap, 0) + headerHeight + padding;
    this.flushSection(options.flow ? Math.min(totalHeight, 55) : totalHeight);
    let rowIndex = 0, continuation = false;
    while (rowIndex < rows.length) {
      // Move a normal card as a whole when it fits a fresh page.
      const remainingHeight = rows.slice(rowIndex).reduce((sum, row) => sum + Math.max(...row.map(cellHeight)) + rowGap, 0) + headerHeight + padding;
      const newPageCapacity = this.bottom - 42;
      if (!options.flow && (!attachedToHeading || continuation) && remainingHeight <= newPageCapacity && this.y + remainingHeight > this.bottom) this.newPage();
      this.ensure(headerHeight + 18);
      const available = this.bottom - this.y - headerHeight - padding;
      const chunks: typeof rows = [];
      let used = 0;
      while (rowIndex < rows.length) {
        const row = rows[rowIndex];
        const height = Math.max(...row.map(cellHeight)) + rowGap;
        if (used + height <= available) { chunks.push(row); used += height; rowIndex++; continue; }
        if (chunks.length && height <= newPageCapacity - headerHeight - padding) break;
        // A long answer gets continuation cards instead of clipping or shrinking.
        const labelHeight = Math.max(...row.map(cell => cell.spaceBefore + cell.label.length * 3.4));
        const count = Math.max(1, Math.floor((available - used - labelHeight - rowGap) / bodyHeight));
        if (chunks.length && count < 3) break;
        chunks.push(row.map(cell => ({ ...cell, body: cell.body.slice(0, count) })));
        rows[rowIndex] = row.map(cell => ({ ...cell, spaceBefore: 0, body: cell.body.slice(count) }));
        used += Math.max(...chunks.at(-1)!.map(cellHeight)) + rowGap;
        if (rows[rowIndex].every(cell => !cell.body.length)) rowIndex++;
        break;
      }
      const height = headerHeight + Math.max(0, used - rowGap) + padding;
      const top = this.y;
      this.pdf.setFillColor(...documentRgb(!this.formal && options.tone ? documentColors[options.tone] : "#ffffff"));
      this.pdf.setDrawColor(...documentRgb(documentColors.line)); this.pdf.setLineWidth(.2);
      this.pdf.roundedRect(this.x, top, this.width, height, this.formal ? 1 : 2, this.formal ? 1 : 2, "FD");
      if (options.eyebrow) this.text(options.eyebrow + (continuation ? " / continuación" : ""), this.x + padding, top + 5, 6.5, true, documentColors.teal);
      this.text(titleLines, this.x + padding, top + (options.eyebrow ? 10 : 6.5), 10.5, true);
      let atY = top + headerHeight + 1;
      for (const row of chunks) {
        row.forEach((cell, index) => {
          const x = this.x + padding + index * (colWidth + gutter);
          const y = atY + cell.spaceBefore;
          if (cell.label.length) this.text(cell.label, x, y, 7.5, true, documentColors.muted);
          this.pdf.setTextColor(...documentRgb(documentColors.ink));
          cell.body.forEach((line, i) => drawDocumentTextLine(this.pdf, line, x, y + cell.label.length * 3.4 + i * bodyHeight, colWidth, this.font, bodySize));
        });
        atY += Math.max(...row.map(cellHeight)) + rowGap;
      }
      this.y += height + (options.spaceAfter ?? 4);
      if (rowIndex < rows.length) { this.newPage(); continuation = true; }
    }
  }
  contacts() {
    if (this.headerDetails.contacts) return;
    const contacts = [this.professional.businessAddress, ...(this.professional.contactLines ?? [])].filter((v): v is string => Boolean(v?.trim()));
    if (contacts.length) this.card("Tu profesional", contacts.map(value => ({ value })), { tone: "blue" });
  }
}
