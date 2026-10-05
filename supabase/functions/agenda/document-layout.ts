import type { jsPDF } from "jspdf";
import { drawProfessionalHeader, type ProfessionalDocumentInfo } from "./document-letterhead.ts";

export const documentColors = { ink: "#203d48", muted: "#627681", teal: "#147e86", mint: "#edf6f0", violet: "#f2eff8", blue: "#edf5fa", line: "#dce6e8" };
export const documentRgb = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
export const documentText = (value: string) => value.replace(/[−–—]/g, "-").replace(/→/g, ">").replace(/×/g, "x").replace(/≤/g, "<=").replace(/≥/g, ">=");
export type DocumentField = { label?: string; value: string };
type CardOptions = { eyebrow?: string; tone?: "mint" | "violet" | "blue"; columns?: 1 | 2 };

/** Measured cards split at row/line boundaries; every answer remains in the PDF. */
export class DocumentLayout {
  y: number;
  private pendingSection: {title: string; subtitle?: string} | null = null;
  readonly x = 16;
  readonly width: number;
  readonly bottom: number;
  constructor(readonly pdf: jsPDF, readonly professional: ProfessionalDocumentInfo, readonly logo: string | null = null) {
    this.width = pdf.internal.pageSize.getWidth() - 32;
    this.bottom = pdf.internal.pageSize.getHeight() - 21;
    this.y = drawProfessionalHeader(pdf, professional, logo);
  }
  newPage() {
    if (this.pdf.getNumberOfPages() >= 120) throw new Error("document_too_large");
    this.pdf.addPage();
    this.y = drawProfessionalHeader(this.pdf, this.professional, this.logo, true);
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
    const rowGap = 4;
    const rows: Array<Array<{ label: string[]; body: string[] }>> = [];
    for (let index = 0; index < fields.length; index += columns) {
      rows.push(fields.slice(index, index + columns).map(field => ({
        label: field.label ? this.lines(field.label, colWidth, 8, true) : [],
        body: this.lines(field.value, colWidth, 10),
      })));
    }
    if (!rows.length) rows.push([{ label: [], body: [] }]);
    const attachedToHeading = Boolean(this.pendingSection);
    const totalHeight = rows.reduce((sum, row) => sum + Math.max(...row.map(cell => cell.label.length * 4 + cell.body.length * 4.95)) + rowGap, 0) + headerHeight + padding;
    this.flushSection(totalHeight);
    let rowIndex = 0, continuation = false;
    while (rowIndex < rows.length) {
      // Move a normal card as a whole when it fits a fresh page.
      const remainingHeight = rows.slice(rowIndex).reduce((sum, row) => sum + Math.max(...row.map(cell => cell.label.length * 4 + cell.body.length * 4.95)) + rowGap, 0) + headerHeight + padding;
      const newPageCapacity = this.bottom - 30;
      if ((!attachedToHeading || continuation) && remainingHeight <= newPageCapacity && this.y + remainingHeight > this.bottom) this.newPage();
      this.ensure(headerHeight + 22);
      const available = this.bottom - this.y - headerHeight - padding;
      const chunks: typeof rows = [];
      let used = 0;
      while (rowIndex < rows.length) {
        const row = rows[rowIndex];
        const height = Math.max(...row.map(cell => cell.label.length * 4 + cell.body.length * 4.95)) + rowGap;
        if (used + height <= available) { chunks.push(row); used += height; rowIndex++; continue; }
        if (chunks.length && height <= newPageCapacity - headerHeight - padding) break;
        // A long answer gets continuation cards instead of clipping or shrinking.
        const labelHeight = Math.max(...row.map(cell => cell.label.length * 4));
        const count = Math.max(1, Math.floor((available - used - labelHeight - rowGap) / 4.95));
        if (chunks.length && count < 3) break;
        chunks.push(row.map(cell => ({ label: cell.label, body: cell.body.slice(0, count) })));
        rows[rowIndex] = row.map(cell => ({ label: cell.label, body: cell.body.slice(count) }));
        used += labelHeight + Math.max(...chunks.at(-1)!.map(cell => cell.body.length)) * 4.95 + rowGap;
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
          if (cell.label.length) this.text(cell.label, x, atY, 8, true, documentColors.muted);
          this.text(cell.body, x, atY + cell.label.length * 4, 10);
        });
        atY += Math.max(...row.map(cell => cell.label.length * 4 + cell.body.length * 4.95)) + rowGap;
      }
      this.y += height + 7;
      if (rowIndex < rows.length) { this.newPage(); continuation = true; }
    }
  }
  contacts() {
    const contacts = [this.professional.businessAddress, ...(this.professional.contactLines ?? [])].filter((v): v is string => Boolean(v?.trim()));
    if (contacts.length) this.card("Tu profesional", contacts.map(value => ({ value })), { tone: "blue" });
  }
}
