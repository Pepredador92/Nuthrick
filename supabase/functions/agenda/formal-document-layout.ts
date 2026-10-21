import type { jsPDF } from "jspdf";
import type { ProfessionalDocumentInfo } from "./document-letterhead.ts";
import { type CardOptions, type DocumentField, documentText, documentFieldLines, drawDocumentTextLine } from "./document-layout.ts";

const margin = 25.4;
const lineHeight = 5.2;

/** Traditional, printable letterhead, always populated from the attending professional. */
export function drawFormalHeader(
  pdf: jsPDF,
  professional: ProfessionalDocumentInfo,
  logo: string | null,
  compact = false,
  strictLogo = false,
): number {
  const width = pdf.internal.pageSize.getWidth();
  const usable = width - margin * 2;
  const institution = professional.businessName?.trim();
  const name = professional.fullName.trim();
  let y = compact ? 17 : margin;
  const write = (
    value: string | null | undefined,
    size: number,
    bold = false,
    gap = 1.3,
  ) => {
    if (!value?.trim()) return;
    pdf.setFont("times", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(25, 25, 25);
    const lines = pdf.splitTextToSize(
      documentText(value.trim()),
      usable,
    ) as string[];
    for (const line of lines) {
      if (y + size * .3528 > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, width / 2, y + size * .3528, { align: "center" });
      y += size * .3528 * 1.32;
    }
    y += gap;
  };
  if (compact) {
    write([institution, name].filter(Boolean).join(" - "), 9, true, 2);
  } else {
    if (logo) {
      try {
        const image = pdf.getImageProperties(logo),
          scale = Math.min(24 / image.width, 18 / image.height);
        const w = image.width * scale, h = image.height * scale;
        pdf.addImage(
          logo,
          image.fileType,
          (width - w) / 2,
          y,
          w,
          h,
          undefined,
          "FAST",
        );
        y += h + 4;
      } catch {
        if (strictLogo) {
          throw new Error(
            "No pudimos incorporar el logo al PDF. Revisa la imagen guardada en Perfil.",
          );
        }
      }
    }
    write(institution || name || "Consulta nutricional", 18, true, 3);
    write(
      [institution ? name : "", professional.professionalTitle].filter(Boolean)
        .join(", "),
      11,
    );
    write(
      professional.licenseNumber
        ? `Cédula profesional: ${professional.licenseNumber}`
        : null,
      10,
    );
    write(professional.businessAddress, 10);
    for (const contact of professional.contactLines ?? []) write(contact, 10);
    y += 3;
  }
  pdf.setDrawColor(65, 65, 65);
  pdf.setLineWidth(.25);
  pdf.line(margin, y, width - margin, y);
  return y + (compact ? 7 : 9);
}

export function drawFormalFooters(pdf: jsPDF) {
  const count = pdf.getNumberOfPages(),
    width = pdf.internal.pageSize.getWidth(),
    height = pdf.internal.pageSize.getHeight();
  for (let page = 1; page <= count; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(90, 90, 90);
    pdf.setLineWidth(.2);
    pdf.line(margin, height - 19, width - margin, height - 19);
    pdf.setFont("times", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(65, 65, 65);
    pdf.text(
      `Nuthrick Software para nutriólogos - ${page} de ${count}`,
      width / 2,
      height - 14,
      { align: "center" },
    );
    pdf.setFontSize(7.5);
    pdf.text(
      "Documento privado. Información clínica confidencial.",
      width / 2,
      height - 9,
      { align: "center" },
    );
  }
}

/** Same content contract as the card layout; no cards, colored canvas or omitted fields. */
export class FormalDocumentLayout {
  y: number;
  readonly x = margin;
  readonly width: number;
  readonly bottom: number;
  private pending: { title: string; subtitle?: string; main: boolean } | null =
    null;
  private sections = 0;
  private subsections = 0;
  private started = false;
  constructor(
    readonly pdf: jsPDF,
    readonly professional: ProfessionalDocumentInfo,
    readonly logo: string | null = null,
    readonly details: { continuation?: string; strictLogo?: boolean } = {},
  ) {
    this.width = pdf.internal.pageSize.getWidth() - margin * 2;
    this.bottom = pdf.internal.pageSize.getHeight() - margin;
    this.y = drawFormalHeader(
      pdf,
      professional,
      logo,
      false,
      details.strictLogo,
    );
  }
  newPage() {
    if (this.pdf.getNumberOfPages() >= 120) {
      throw new Error("document_too_large");
    }
    this.pdf.addPage();
    this.y = drawFormalHeader(this.pdf, this.professional, null, true);
    if (this.details.continuation) this.paragraph(this.details.continuation, 9);
  }
  ensure(height: number) {
    if (this.y + height > this.bottom) this.newPage();
  }
  lines(value: string, width: number, size = 11, bold = false) {
    this.pdf.setFont("times", bold ? "bold" : "normal");
    this.pdf.setFontSize(size);
    return this.pdf.splitTextToSize(documentText(value), width) as string[];
  }
  text(
    value: string | string[],
    x: number,
    y: number,
    size = 11,
    bold = false,
    _color?: string,
  ) {
    this.pdf.setFont("times", bold ? "bold" : "normal");
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(25, 25, 25);
    this.pdf.text(
      typeof value === "string" ? documentText(value) : value.map(documentText),
      x,
      y,
      { lineHeightFactor: 1.34 },
    );
  }
  section(title: string, subtitle?: string) {
    this.flushSection();
    const main = !this.started;
    this.started = true;
    if (!main) {
      this.sections++;
      this.subsections = 0;
    }
    this.pending = {
      title: main
        ? title
        : `${this.sections}. ${title.replace(/^\d+\s*[·.]\s*/, "")}`,
      subtitle,
      main,
    };
  }
  flushSection(followingHeight = 18) {
    if (!this.pending) return;
    const { title, subtitle, main } = this.pending;
    this.pending = null;
    const size = main ? 17 : 14;
    const lines = this.lines(title, this.width, size, true),
      sub = subtitle ? this.lines(subtitle, this.width, 10) : [];
    this.ensure(
      lines.length * 7 + sub.length * lineHeight + 8 +
        Math.min(followingHeight, this.bottom - 50),
    );
    this.y += 2;
    for (const line of lines) {
      if (main) {
        this.pdf.setFont("times", "bold");
        this.pdf.setFontSize(size);
        this.pdf.setTextColor(25, 25, 25);
        this.pdf.text(line, this.x + this.width / 2, this.y, {
          align: "center",
        });
      } else this.text(line, this.x, this.y, size, true);
      this.y += 7;
    }
    for (const line of sub) {
      this.text(line, this.x, this.y, 10);
      this.y += lineHeight;
    }
    this.y += 4;
  }
  private paragraph(value: string, size = 11, bold = false) {
    for (const line of this.lines(value, this.width, size, bold)) {
      this.ensure(lineHeight);
      this.text(line, this.x, this.y, size, bold);
      this.y += lineHeight;
    }
  }
  card(
    title: string,
    fields: DocumentField[],
    options: CardOptions = {},
  ) {
    const heading = this.sections
      ? `${this.sections}.${++this.subsections} ${title}`
      : title;
    const headings = this.lines(heading, this.width, 12, true);
    const eyebrowHeight = options.eyebrow ? this.lines(options.eyebrow, this.width, 9).length * lineHeight + 1 : 0;
    const contentHeight = options.metrics ? 20 * Math.ceil(fields.length / (options.columns ?? 3)) : fields.reduce((height, field) => {
      if (!field.value.trim()) return height;
      const label = field.label ? `${field.label}: ` : "";
      this.pdf.setFont("times", "bold"); this.pdf.setFontSize(11);
      const labelWidth = this.pdf.getTextWidth(documentText(label));
      this.pdf.setFont("times", "normal");
      const inline = !!label && !field.value.includes("\n") && labelWidth + this.pdf.getTextWidth(documentText(field.value)) <= this.width;
      const labelLines = label && !field.inlineLabel && (options.justify || !inline) ? this.lines(label, this.width, 11, true).length : 0;
      const bodyLines = options.justify || field.inlineLabel ? documentFieldLines(this.pdf, field, this.width, "times", 11, options.justify).length : inline ? 1 : this.lines(field.value, this.width).length;
      return height + (field.spaceBefore ?? 0) + (labelLines + bodyLines) * lineHeight + 1.3;
    }, 0);
    const totalHeight = headings.length * lineHeight + 2 + eyebrowHeight + contentHeight + (options.spaceAfter ?? 4);
    const keepTogether = !options.flow && totalHeight < this.bottom - 50;
    this.flushSection(keepTogether ? totalHeight : 18);
    if (keepTogether) this.ensure(totalHeight);
    this.ensure(headings.length * lineHeight + 17);
    this.paragraph(heading, 12, true);
    this.y += 2;
    if (options.eyebrow) {
      this.paragraph(options.eyebrow, 9);
      this.y += 1;
    }
    if (options.metrics) {
      const columns = options.columns ?? 3, width = this.width / columns;
      const rows = fields.map(field => ({field, labels: this.lines(field.label ?? "", width - 5, 10, true), values: this.lines(field.value, width - 5, 15)}));
      for (let start = 0; start < rows.length; start += columns) {
        const row = rows.slice(start, start + columns), labelHeight = Math.max(...row.map(cell => cell.labels.length)) * lineHeight;
        const height = labelHeight + Math.max(...row.map(cell => cell.values.length)) * 7 + 5;
        this.ensure(height);
        row.forEach((cell, index) => { this.text(cell.labels, this.x + index * width, this.y, 10, true); this.text(cell.values, this.x + index * width, this.y + labelHeight + 1, 15); });
        this.y += height;
      }
      this.y += options.spaceAfter ?? 4;
      return;
    }
    for (const field of fields) {
      if (!field.value.trim()) continue;
      this.ensure((field.spaceBefore ?? 0) + lineHeight * 2);
      this.y += field.spaceBefore ?? 0;
      const label = field.label ? `${field.label}: ` : "";
      if (options.justify || field.inlineLabel) {
        if (label && !field.inlineLabel) {
          this.ensure(this.lines(label, this.width, 11, true).length * lineHeight + lineHeight * 2);
          this.paragraph(label, 11, true);
        }
        const lines = documentFieldLines(this.pdf, field, this.width, "times", 11, options.justify);
        for (const line of lines) {
          this.ensure(lineHeight);
          this.pdf.setTextColor(25, 25, 25);
          drawDocumentTextLine(this.pdf, line, this.x, this.y, this.width, "times", 11);
          this.y += lineHeight;
        }
        this.y += 1.3;
        continue;
      }
      this.pdf.setFont("times", "bold");
      this.pdf.setFontSize(11);
      const labelWidth = label ? this.pdf.getTextWidth(documentText(label)) : 0;
      this.pdf.setFont("times", "normal");
      const inline = !!label && !field.value.includes("\n") &&
        labelWidth + this.pdf.getTextWidth(documentText(field.value)) <=
          this.width;
      if (inline) {
        this.ensure(lineHeight);
        this.text(label, this.x, this.y, 11, true);
        this.text(field.value, this.x + labelWidth, this.y);
        this.y += lineHeight;
      } else {
        if (label) {
          this.ensure(
            this.lines(label, this.width, 11, true).length * lineHeight +
              lineHeight * 2,
          );
          this.paragraph(label, 11, true);
        }
        this.paragraph(field.value);
      }
      this.y += 1.3;
    }
    this.y += options.spaceAfter ?? 4;
  }
  contacts() {
    /* The complete contact block is already in the first-page letterhead. */
  }
}
