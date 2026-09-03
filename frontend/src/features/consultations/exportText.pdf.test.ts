import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  output: vi.fn(() => new Blob(["pdf"], { type: "application/pdf" })),
  addImage: vi.fn(),
}));

vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    setFillColor() {}
    rect() {}
    addImage = mocks.addImage;
    setTextColor() {}
    setFont() {}
    setFontSize() {}
    text() {}
    addPage() {}
    splitTextToSize(text: string) {
      return [text];
    }
    roundedRect() {}
    getNumberOfPages() {
      return 1;
    }
    setPage() {}
    setDrawColor() {}
    line() {}
    output = mocks.output;
  },
}));

import { downloadConsultationPdf } from "./exportText";

describe("downloadConsultationPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:consultation"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("creates a PDF blob and triggers a named browser download", async () => {
    let downloadedFilename = "";
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedFilename = this.download;
      });
    await downloadConsultationPdf(
      "consulta.pdf",
      { full_name: "Ana Paciente" } as never,
      {
        consultation_type: "initial",
        consultation_date: "2026-09-03T12:00:00Z",
        summary: null,
      } as never,
      {
        template_name: "Inicial",
        template_version: 1,
        structure: {
          sections: [
            {
              section_key: "motivo",
              title: "Motivo",
              questions: [
                {
                  question_key: "reason",
                  label: "¿Qué te trae hoy?",
                  question_type: "short_text",
                  response_area: "patient_reported",
                  is_required: false,
                  configuration: {},
                },
              ],
            },
          ],
        },
      } as never,
      { reason: "Mejorar digestión" },
      { fullName: "Dra. Sofía Nutrióloga" },
    );
    expect(mocks.output).toHaveBeenCalledWith("blob");
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(downloadedFilename).toBe("consulta.pdf");
  });
});
