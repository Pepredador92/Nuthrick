import { describe, expect, it } from "vitest";
import {
  buildConsultationSupportContext,
  clinicalEvidenceValid,
} from "../../../../supabase/functions/ai/clinical.ts";

describe("consultation objective AI context", () => {
  it("keeps only approved interview topics and selected progress history", () => {
    const context = buildConsultationSupportContext({
      stamp: "stamp",
      identifiers: ["Ana Nutrióloga", "ana@example.com"],
      facts: [
        { source: "Entrevista · expectations", finding: "Ana Nutrióloga quiere organizar horarios" },
        { source: "Entrevista · medication list", finding: "dato excluido" },
        { source: "Historial · Peso corporal", finding: "92 kg" },
        { source: "Historial · Pliegue tricipital", finding: "20 mm" },
      ],
    });
    expect(context.facts.map(({ source }) => source)).toEqual([
      "Entrevista · expectations",
      "Historial · Peso corporal",
    ]);
    expect(context.facts[0].finding).not.toContain("Ana Nutrióloga");
  });

  it("requires each proposed objective to cite existing context facts", () => {
    const context = { facts: [{ id: "f1", source: "Entrevista", finding: "Quiere organizar horarios" }] };
    expect(clinicalEvidenceValid("consultation_support", {
      objectives: [{ text: "Elegir un horario para organizar la comida.", evidenceFactIds: ["f1"] }],
    }, context)).toBe(true);
    expect(clinicalEvidenceValid("consultation_support", {
      objectives: [{ text: "Bajar cinco kilos.", evidenceFactIds: ["f2"] }],
    }, context)).toBe(false);
    expect(clinicalEvidenceValid("consultation_support", {
      objectives: [{ text: "Elegir un horario para organizar la comida.", evidenceFactIds: [] }],
    }, context)).toBe(false);
  });
});
