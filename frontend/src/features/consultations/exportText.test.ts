import { describe, expect, it } from "vitest";
import { consultationTextExport } from "./exportText";

describe("consultationTextExport", () => {
  it("includes only visible answered fields in a readable private record", () => {
    const text = consultationTextExport(
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
              section_key: "a",
              title: "Motivo",
              description: null,
              questions: [
                {
                  question_key: "reason",
                  label: "¿Qué te trae hoy?",
                  question_type: "short_text",
                  response_area: "patient_reported",
                  is_required: false,
                  configuration: {},
                  visibility_condition: null,
                },
                {
                  question_key: "hidden",
                  label: "Oculta",
                  question_type: "short_text",
                  response_area: "patient_reported",
                  is_required: false,
                  configuration: {},
                  visibility_condition: {
                    question_key: "reason",
                    equals: "No",
                  },
                },
              ],
            },
          ],
        },
      } as never,
      { reason: "Mejorar digestión" },
      {
        fullName: "Dra. Sofía Nutrióloga",
        professionalTitle: "Nutrióloga clínica",
        licenseNumber: "1234567",
        businessName: "Consulta Nutricional",
        contactLines: ["WhatsApp: +52 5555555555"],
      },
    );
    expect(text).toContain("Ana Paciente");
    expect(text).toContain("Dra. Sofía Nutrióloga · Nutrióloga clínica");
    expect(text).toContain("Cédula profesional: 1234567");
    expect(text).toContain("¿Qué te trae hoy?: Mejorar digestión");
    expect(text).not.toContain("Oculta");
  });
});
