import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  output: vi.fn(() => new Blob(["pdf"], { type: "application/pdf" })),
  text: vi.fn(),
  line: vi.fn(),
  addPage: vi.fn(),
  addImage: vi.fn(),
}));

vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    saveGraphicsState() {}
    restoreGraphicsState() {}
    setLineCap() {}
    moveTo() {}
    curveTo() {}
    close() {}
    stroke() {}
    fill() {}
    setFillColor() {}
    rect() {}
    setTextColor() {}
    setFont() {}
    setFontSize() {}
    text = mocks.text;
    roundedRect() {}
    triangle() {}
    setDrawColor() {}
    setLineWidth() {}
    line = mocks.line;
    lines() {}
    circle() {}
    addPage = mocks.addPage;
    getImageProperties() { return { width: 400, height: 200, fileType: "PNG" }; }
    addImage = mocks.addImage;
    setPage() {}
    getNumberOfPages() { return 1; }
    splitTextToSize(text: string) { return [text]; }
    output = mocks.output;
  },
}));

import { downloadEvolutionPdf } from "./exportEvolution";
import { interpretResult } from "@/src/features/interpretations/engine";
import references from "@/src/features/interpretations/references.json";
import type { InterpretationReference } from "@/src/features/interpretations/types";
import type { LongitudinalSeries } from "./longitudinal";
import { historicalClassification } from "./clinicalSummary";
const NativeURL = URL;

describe("evolution PDF export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addImage.mockReset();
    vi.stubGlobal("URL", class extends NativeURL { static createObjectURL = vi.fn(() => "blob:evolution"); static revokeObjectURL = vi.fn(); });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("builds a letterheaded PDF with only selected evolution charts", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await downloadEvolutionPdf(
      "evolucion.pdf",
      { full_name: "Ana Paciente" } as never,
      {
        consultations: [],
        series: [{
          id: "weight", label: "Peso", category: "measurements", concept: "Peso", unit: "kg",
          sourceType: "manual_measurement", method: null, provenance: null, graphable: true,
          points: [
            { consultation_id: "a", consultation_date: "2026-09-01T12:00:00Z", raw_value: 64, display_value: "64", unit: "kg", source_reference: {} },
            { consultation_id: "b", consultation_date: "2026-09-05T12:00:00Z", raw_value: 63, display_value: "63", unit: "kg", source_reference: {} },
          ],
        }],
      },
      { seriesIds: ["weight"] },
      { fullName: "Lic. Andrea Nutri", professionalTitle: "Nutrióloga", licenseNumber: "12345", businessAddress: "Av. Salud 12", contactLines: ["WhatsApp: +52 555"] },
    );
    const text = mocks.text.mock.calls.flatMap(([value]) => Array.isArray(value) ? value : [value]).join("\n");
    expect(text).toContain("NUTHRICK");
    expect(text).toContain("Reporte de progreso del paciente");
    expect(text).toContain("Evolución nutricional");
    expect(text).toContain("Tus indicadores");
    expect(text).toContain("Lic. Andrea Nutri");
    expect(text).toContain("Av. Salud 12");
    expect(text).toContain("WhatsApp: +52 555");
    expect(text).toContain("Peso");
    expect(mocks.line).toHaveBeenCalled();
    expect(mocks.output).toHaveBeenCalledWith("blob");
    expect(click).toHaveBeenCalledOnce();
  });

  it("renders every selected chart across more than two pages and excludes unselected entries", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const series = Array.from({ length: 10 }, (_, index) => ({
      id: `metric-${index}`, label: `Indicador clínico ${index}`, category: "measurements" as const, concept: "Medición", unit: "cm", sourceType: "manual_measurement" as const, method: null, provenance: null, graphable: true,
      points: [{ consultation_id: "a", consultation_date: "2026-09-01T12:00:00Z", raw_value: 70 + index, display_value: String(70 + index), unit: "cm", source_reference: {} }],
    }));
    await downloadEvolutionPdf("all.pdf", { full_name: "Demostración" } as never, { consultations: [], series }, { seriesIds: series.slice(0, 9).map((item) => item.id) }, { fullName: "Profesional de demostración" });
    const rendered = mocks.text.mock.calls.flatMap(([value]) => Array.isArray(value) ? value : [value]).join("\n");
    for (const item of series.slice(0, 9)) expect(rendered).toContain(item.label);
    expect(rendered).not.toContain("Indicador clínico 9");
    expect(mocks.addPage.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(rendered).not.toContain("no incluidos");
  });

  it("embeds the professional logo at its aspect ratio and identifies the patient without shifting the birth date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchLogo = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer });
    vi.stubGlobal("fetch", fetchLogo);
    await downloadEvolutionPdf("logo.pdf", { full_name: "Ana Paciente", birth_date: "1992-09-27" } as never, { consultations: [], series: [] }, { seriesIds: [] }, { fullName: "Nutrióloga", logoUrl: "https://example.com/logo.png" });
    expect(fetchLogo).toHaveBeenCalledWith("https://example.com/logo.png");
    expect(mocks.addImage).toHaveBeenCalledWith(bytes, "PNG", 171, 12, 23, 11.5, undefined, "FAST");
    const rendered = mocks.text.mock.calls.flatMap(([value]) => Array.isArray(value) ? value : [value]).join("\n");
    expect(rendered).toContain("DATOS DEL PACIENTE");
    expect(rendered).toContain("Ana Paciente");
    expect(rendered).toContain("Edad al emitir: 33 años");
    expect(rendered).toMatch(/Nacimiento: 27 sept? 1992/);
  });

  it.each(["download", "image"])("reports a logo %s failure instead of downloading a report without the configured logo", async (failure) => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: failure !== "download", arrayBuffer: async () => new Uint8Array([1]).buffer }));
    if (failure === "image") mocks.addImage.mockImplementation(() => { throw new Error("invalid image"); });
    await expect(downloadEvolutionPdf("logo.pdf", { full_name: "Ana" } as never, { consultations: [], series: [] }, { seriesIds: [] }, { fullName: "Profesional", logoUrl: "https://example.com/logo.png" })).rejects.toThrow(/logo/);
    expect(click).not.toHaveBeenCalled();
  });

  it("shows missing age explicitly instead of inventing patient details", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await downloadEvolutionPdf("missing.pdf", { full_name: "Ana", birth_date: null } as never, { consultations: [], series: [] }, { seriesIds: [] }, { fullName: "Profesional" });
    const rendered = mocks.text.mock.calls.flatMap(([value]) => Array.isArray(value) ? value : [value]).join("\n");
    expect(rendered).toContain("Edad al emitir: Sin registrar · Nacimiento: Sin registrar");
  });

  it.each([null, false])("preserves BMI classification history and uses the matching visit for the scale (pregnant=%s)", async (pregnant) => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const bmi: LongitudinalSeries = {
      id: "bmi", label: "IMC", concept: "IMC", conceptCode: "bmi", category: "calculations", unit: "kg/m²", sourceType: "calculation", method: "IMC", provenance: null, graphable: true,
      points: [36.8, 33.9].map((value, index) => ({
        consultation_id: String(index), consultation_date: `2026-09-${index ? "15" : "01"}T12:00:00Z`, raw_value: value, display_value: String(value), unit: "kg/m²", source_reference: {},
        interpretation: interpretResult("bmi", value, "kg/m²", { age: 30, pregnant: index ? pregnant : false }, references as InterpretationReference[], String(index)),
      })),
    };
    await downloadEvolutionPdf("bmi.pdf", { full_name: "Demostración" } as never, { consultations: [], series: [bmi] }, { seriesIds: ["bmi"] }, { fullName: "Profesional" });
    const rendered = mocks.text.mock.calls.flatMap(([value]) => Array.isArray(value) ? value : [value]).join("\n");
    expect(rendered).toContain("33.9 kg/m²");
    expect(rendered).toContain("Historial de referencias · IMC");
    expect(rendered).toMatch(/01 sept? 26 · 36.8 kg\/m² · Obesidad grado II/);
    const displayedPoint = bmi.points[pregnant === null ? 0 : 1];
    const scale = historicalClassification(displayedPoint)!;
    const markerX = 22 + 166 * scale.marker / 100;
    expect(mocks.line.mock.calls.some(([x1, y1, x2, y2]) => x1 === markerX && x2 === markerX && y2 - y1 === 5)).toBe(true);
    if (pregnant === null) {
      expect(rendered).toContain("Sin clasificación en esta consulta: Falta: situación de gestación.");
      expect(rendered).toMatch(/Última clasificación registrada · 1 sept? 2026 · 36.8 kg\/m²/);
      expect(rendered).toMatch(/15 sept? 26 · 33.9 kg\/m² · Sin clasificación/);
    } else {
      expect(rendered).toContain("Clasificación registrada: Obesidad grado I");
      expect(rendered).not.toContain("Última clasificación registrada");
      expect(rendered).not.toContain("Sin clasificación");
    }
  });
});
