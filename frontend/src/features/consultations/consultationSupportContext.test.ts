import { describe, expect, it } from "vitest";
import {
  buildConsultationSupportContext,
  clinicalEvidenceValid,
} from "../../../../supabase/functions/ai/clinical.ts";
import { withConfirmedRecall } from "../../../../supabase/functions/ai/recall-context.ts";

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

it("uses confirmed catalog nutrients in PES/objective/instruction context and redacts identifiers", () => {
  const source = withConfirmedRecall({ stamp: "s", identifiers: ["Ana Paciente"], facts: [
    { source: "Entrevista · first actions", finding: "Ana Paciente acordó preparar su colación" },
  ], recall: { approved_at: "2026-10-02", narrative: "PRIVATE RAW NARRATIVE", items: [
    { mealLabel: "Desayuno", quantity: 1, unit: "piece", food: { name: "Huevo", portion_amount: 1, portion_unit: "piece", group_code: "AOA_MODERATE_FAT" } },
  ] } });
  expect(source.facts.find(fact => fact.source.includes("Consumo estimado"))?.finding).toContain("75 kcal");
  expect(source.facts.find(fact => fact.source.includes("Consumo estimado"))?.finding).toContain("38.4 %");
  expect(JSON.stringify(source.facts)).not.toContain("PRIVATE RAW NARRATIVE");
  const context = buildConsultationSupportContext(source, true);
  expect(JSON.stringify(context)).not.toContain("Ana Paciente");
  expect(context.facts.some(fact => fact.source.startsWith("Recordatorio confirmado"))).toBe(true);
  const agreement = context.facts.find(fact => fact.source.includes("first actions"))!.id;
  const recall = context.facts.find(fact => fact.source.includes("Consumo estimado"))!.id;
  expect(clinicalEvidenceValid("patient_instructions", { instructions: [{ text: "Preparar la colación acordada.", evidenceFactIds: [recall] }] }, context)).toBe(false);
  expect(clinicalEvidenceValid("patient_instructions", { instructions: [{ text: "Preparar la colación acordada.", evidenceFactIds: [agreement, recall] }] }, context)).toBe(true);
});

it("does not turn an unconfirmed record into nutrient evidence", () => {
  const source = { stamp: "s", facts: [], recall: { items: [{ quantity: 1, food: {} }] } };
  expect(withConfirmedRecall(source).facts).toEqual([]);
});
