import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  output: vi.fn(() => new Blob(["pdf"], { type: "application/pdf" })),
  text: vi.fn(),
  line: vi.fn(),
}));

vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    setFillColor() {}
    rect() {}
    setTextColor() {}
    setFont() {}
    setFontSize() {}
    text = mocks.text;
    roundedRect() {}
    setDrawColor() {}
    setLineWidth() {}
    line = mocks.line;
    circle() {}
    addPage() {}
    setPage() {}
    getNumberOfPages() { return 1; }
    splitTextToSize(text: string) { return [text]; }
    output = mocks.output;
  },
}));

import { downloadEvolutionPdf } from "./exportEvolution";

describe("evolution PDF export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:evolution"), revokeObjectURL: vi.fn() });
  });

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
    expect(text).toContain("Evolución nutricional");
    expect(text).toContain("Lic. Andrea Nutri");
    expect(text).toContain("Av. Salud 12");
    expect(text).toContain("WhatsApp: +52 555");
    expect(text).toContain("Peso");
    expect(mocks.line).toHaveBeenCalled();
    expect(mocks.output).toHaveBeenCalledWith("blob");
    expect(click).toHaveBeenCalledOnce();
  });
});
