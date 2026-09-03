import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  output: vi.fn(() => new Blob(["pdf"], { type: "application/pdf" })),
  addImage: vi.fn(),
  text: vi.fn(),
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
    text = mocks.text;
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

import { consultationTextExport, downloadConsultationPdf } from "./exportText";

describe("downloadConsultationPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:consultation"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("omits unanswered questions and empty sections while preserving No and zero in both exports", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
    const unanswered = {
      missing: undefined,
      nullable: null,
      whitespace: "  ",
      choices: [],
      rows: [{ name: "" }],
      grid: { vegetables: "" },
    };
    const question = (key: string) => ({
      question_key: key,
      label: key,
      question_type: "short_text",
      configuration: {},
    });
    const patient = { full_name: "Paciente" } as never;
    const consultation = {
      consultation_type: "initial",
      consultation_date: "2026-09-03",
      summary: null,
    } as never;
    const snapshot = {
      template_name: "Prueba",
      template_version: 1,
      structure: {
        sections: [
          {
            title: "Sección completamente vacía",
            questions: Object.keys(unanswered).map(question),
          },
          {
            title: "Respuestas registradas",
            questions: [
              question("answer"),
              question("negative"),
              question("zero"),
              question("missing"),
            ],
          },
        ],
      },
    } as never;
    const values = {
      ...unanswered,
      answer: "Respuesta real",
      negative: false,
      zero: 0,
    };
    const professional = { fullName: "Profesional" };
    await downloadConsultationPdf(
      "consulta.pdf",
      patient,
      consultation,
      snapshot,
      values,
      professional,
    );
    const pdfText = mocks.text.mock.calls
      .flatMap(([text]) => (Array.isArray(text) ? text : [text]))
      .join("\n");
    const plainText = consultationTextExport(
      patient,
      consultation,
      snapshot,
      values,
      professional,
    );
    for (const output of [pdfText, plainText]) {
      expect(output).not.toContain("Sin registrar");
      expect(output).not.toContain("Sección completamente vacía");
      for (const key of Object.keys(unanswered))
        expect(output).not.toContain(key);
      expect(output).toContain("Respuesta real");
      expect(output).toContain("No");
      expect(output).toContain("0");
    }
    expect(pdfText).toContain("negative\nNo");
    expect(pdfText).toContain("zero\n0");
  });

  it("uses the current professional and establishment information in the letterhead", async () => {
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
      {
        fullName: "Lic. Andrea Nombre Actualizado",
        professionalTitle: "Nutrióloga clínica",
        licenseNumber: "9876543",
        businessName: "Consultorio Bienestar",
        businessAddress: "Av. Salud 123, Zacatecas",
        contactLines: ["WhatsApp: +52 492 123 4567"],
      },
    );
    const documentText = mocks.text.mock.calls
      .flatMap(([text]) => (Array.isArray(text) ? text : [text]))
      .join("\n");
    expect(documentText).toContain("Lic. Andrea Nombre Actualizado");
    expect(documentText).toContain("Nutrióloga clínica");
    expect(documentText).toContain("Cédula profesional 9876543");
    expect(documentText).toContain("Consultorio Bienestar");
    expect(documentText).toContain("Av. Salud 123, Zacatecas");
    expect(documentText).toContain("Informe de consulta nutricional");
    expect(documentText).toContain("WhatsApp: +52 492 123 4567");
    expect(mocks.output).toHaveBeenCalledWith("blob");
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(downloadedFilename).toBe("consulta.pdf");
  });
});
