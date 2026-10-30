import type { jsPDF } from "jspdf";
import { brandArcs, brandPerson } from "../_shared/brand-mark.ts";
export interface ProfessionalDocumentInfo {
  fullName: string; professionalTitle?: string | null; licenseNumber?: string | null;
  businessName?: string | null; businessAddress?: string | null; contactLines?: string[]; logoUrl?: string | null;
}
export type DocumentHeaderDetails = { contacts?: boolean; continuation?: string; strictLogo?: boolean; title?: string; generatedAt?: string };
const clean = (value: string) => value.replace(/[−–—]/g, "-").replace(/→/g, ">");
/** A white printable sheet, with no decorative page frame or shadows. */
export function drawDocumentCanvas(pdf: jsPDF) {
  pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), "F");
}
function drawNuthrickMark(pdf: jsPDF, x: number, y: number, size: number, color: [number, number, number] = [23, 63, 57]) {
  const scale = size / 104;
  pdf.saveGraphicsState(); pdf.setDrawColor(...color); pdf.setFillColor(...color); pdf.setLineWidth(7 * scale); pdf.setLineCap("round");
  const path = (value: string) => {
    for (const command of value.matchAll(/([MCZ])([^MCZ]*)/g)) {
      const points = command[2].trim().split(/\s+/).filter(Boolean).map(Number).map((v, i) => v * scale + (i % 2 ? y : x));
      if (command[1] === "M") pdf.moveTo(points[0], points[1]);
      else if (command[1] === "C") pdf.curveTo(points[0], points[1], points[2], points[3], points[4], points[5]);
      else pdf.close();
    }
  };
  for (const arc of brandArcs) { path(arc); pdf.stroke(); }
  pdf.circle(x + 50 * scale, y + 50 * scale, 7.6 * scale, "F"); path(brandPerson); pdf.fill(); pdf.restoreGraphicsState();
}
/** Shared horizontal letterhead: identity left, logo and issue data right. */
export function drawLetterhead(pdf: jsPDF, professional: ProfessionalDocumentInfo, logo: string | null, compact = false, formal = false, details: DocumentHeaderDetails = {}, compression: "FAST" | "NONE" = "FAST"): number {
  drawDocumentCanvas(pdf);
  const pageWidth = pdf.internal.pageSize.getWidth(), margin = 16, rightWidth = 48;
  const font = formal ? "times" : "helvetica";
  const ink: [number, number, number] = formal ? [32, 46, 40] : [255, 255, 255];
  const muted: [number, number, number] = formal ? [91, 107, 98] : [220, 237, 227];
  const rightX = pageWidth - margin - rightWidth, leftWidth = rightX - margin - 10;
  const blocks: Array<{ lines: string[]; y: number; size: number; bold: boolean }> = [];
  let y = 10;
  const block = (value: string | null | undefined, size: number, bold = false, gap = 1.1) => {
    if (!value?.trim()) return;
    pdf.setFont(font, bold ? "bold" : "normal"); pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(clean(value.trim()), leftWidth) as string[];
    blocks.push({ lines, y, size, bold });
    y += lines.length * size * .3528 * 1.3 + gap;
  };
  const institution = professional.businessName?.trim(), name = professional.fullName.trim();
  block(institution || name || "Nuthrick", compact ? 10 : 14.5, true, compact ? 1 : 1.5);
  if (compact) block(details.title, 8);
  else {
    block([institution ? name : null, professional.professionalTitle].filter(Boolean).join(" · "), 8, false, .8);
    block(professional.licenseNumber ? `Cédula profesional: ${professional.licenseNumber}` : null, 7.5, false, .8);
    block(details.title, 8.5, true, 0);
  }
  const bottom = Math.max(y + 3, compact ? 25 : 35);
  if (!formal) { pdf.setFillColor(29, 79, 66); pdf.rect(0, 0, pageWidth, bottom, "F"); }
  for (const item of blocks) {
    pdf.setFont(font, item.bold ? "bold" : "normal"); pdf.setFontSize(item.size); pdf.setTextColor(...(item.bold ? ink : muted));
    pdf.text(item.lines, margin, item.y, { lineHeightFactor: 1.3 });
  }
  const logoTop = compact ? 6 : 5, logoBoxHeight = compact ? 10 : 19;
  let embedded = false;
  if (logo) {
    try {
      const image = pdf.getImageProperties(logo), scale = Math.min(36 / image.width, (logoBoxHeight - 2) / image.height);
      const w = image.width * scale, h = image.height * scale;
      pdf.setFillColor(255, 255, 255); pdf.roundedRect(rightX + 6, logoTop, rightWidth - 6, logoBoxHeight, 1.4, 1.4, "F");
      pdf.addImage(logo, image.fileType, rightX + 6 + (rightWidth - 6 - w) / 2, logoTop + (logoBoxHeight - h) / 2, w, h, undefined, compression);
      embedded = true;
    } catch {
      if (details.strictLogo) throw new Error("No pudimos incorporar el logo al PDF. Revisa la imagen guardada en Perfil y vuelve a exportar.");
    }
  }
  if (!embedded) {
    const markSize = compact ? 7 : 10;
    drawNuthrickMark(pdf, rightX + 7, logoTop + 1, markSize, ink);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(compact ? 10 : 13); pdf.setTextColor(...ink);
    pdf.text("Nuthrick", rightX + 9 + markSize, logoTop + markSize * .75 + 1);
  }
  const issued = new Date(details.generatedAt ?? Date.now());
  const date = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric" }).format(issued);
  const time = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(issued);
  pdf.setFont(font, "normal"); pdf.setFontSize(7); pdf.setTextColor(...muted);
  pdf.text(`Generado: ${date}${compact ? "" : ` · ${time}`}`, pageWidth - margin, compact ? 21 : 30, { align: "right" });
  pdf.setDrawColor(formal ? 105 : 207, formal ? 124 : 225, formal ? 112 : 215); pdf.setLineWidth(.25);
  pdf.line(margin, bottom, pageWidth - margin, bottom);
  let contentY = bottom + 6;
  if (!compact && details.contacts) {
    const contacts = [professional.businessAddress, ...(professional.contactLines ?? [])].filter((value): value is string => Boolean(value?.trim()));
    if (contacts.length) {
      pdf.setFont(font, "normal"); pdf.setFontSize(7.5); pdf.setTextColor(91, 107, 98);
      const contactLines = pdf.splitTextToSize(clean(contacts.join(" · ")), pageWidth - margin * 2) as string[];
      pdf.text(contactLines, margin, contentY, { lineHeightFactor: 1.3 });
      contentY += contactLines.length * 3.5 + 3;
    }
  }
  return contentY;
}
export function drawProfessionalHeader(pdf: jsPDF, professional: ProfessionalDocumentInfo, logo: string | null, compact = false, compression: "FAST" | "NONE" = "FAST", includeContacts = false, strictLogo = false, details: DocumentHeaderDetails = {}): number {
  return drawLetterhead(pdf, professional, logo, compact, false, { ...details, contacts: includeContacts, strictLogo }, compression);
}
export function drawDocumentFooters(pdf: jsPDF, label = "Documento privado · Información clínica confidencial", formal = false) {
  const count = pdf.getNumberOfPages(), width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  for (let page = 1; page <= count; page++) {
    pdf.setPage(page); pdf.setDrawColor(215, 226, 218); pdf.setLineWidth(.2); pdf.line(16, height - 15, width - 16, height - 15);
    pdf.setFont(formal ? "times" : "helvetica", "normal"); pdf.setFontSize(6.8); pdf.setTextColor(91, 107, 98);
    drawNuthrickMark(pdf, 16, height - 13, 4);
    const caption = label.replace(/^NUTHRICK\s*·\s*/i, "");
    const text = `${formal ? "Nuthrick Software para nutriólogos" : "Nuthrick"} · ${caption}${/confidencial/i.test(caption) ? "" : " · Información clínica confidencial"}`;
    const lines = pdf.splitTextToSize(clean(text), width - 70) as string[];
    pdf.text(lines, 22, height - 10, { lineHeightFactor: 1.2 });
    pdf.text(`Página ${page} de ${count}`, width - 16, height - 10, { align: "right" });
  }
}
export const drawPrivateFooters = (pdf: jsPDF) => drawDocumentFooters(pdf);
