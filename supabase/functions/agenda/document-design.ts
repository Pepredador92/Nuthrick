export type PdfDesign = "current" | "formal";

/** Omitted design preserves existing downloads. Unknown values never choose a renderer. */
export function pdfDesign(value: unknown): PdfDesign {
  if (value === undefined || value === "current") return "current";
  if (value === "formal") return "formal";
  throw new Error("invalid_input");
}
