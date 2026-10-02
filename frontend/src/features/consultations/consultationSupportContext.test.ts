import { describe, expect, it } from "vitest";
import {
  buildConsultationSupportContext,
  buildPesClinicalContext,
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

it("summarizes dated history without dropping current findings, contraindications or contradictory readings", () => {
  const current = [
    { source: "Entrevista · medication list", finding: JSON.stringify("Texto largo. ".repeat(100) + "No suspender el medicamento.") },
    { source: "Antropometría · skinfold", finding: "20 mm" },
    { source: "Entrevista · food reactions v2", finding: '[{"food": "nuez", "reaction": "alergia"}]' },
  ];
  const facts = [...current, current[1],
    ...["2026-08-01", "2026-06-01", "2026-07-01"].map(date => ({ source: "Historial · Peso", finding: `90 kg · consulta ${date}` })),
    { source: "Historial · Peso", finding: "91 kg · consulta 2026-08-01" },
    { source: "Historial · Pliegue tricipital", finding: "30 mm · consulta 2026-07-01" },
    { source: "Historial calculado · bmi · IMC", finding: "30 kg/m² · consulta 2026-08-01" },
    { source: "Historial calculado · body_fat_percentage · Método A", finding: "25 % · consulta 2026-08-01" },
    { source: "Historial calculado · body_fat_percentage · Método B", finding: "27 % · consulta 2026-08-01" },
  ];
  const context = buildPesClinicalContext({ facts, stamp: "s" });
  expect(context.facts.filter(f => f.source === current[1].source)).toHaveLength(1);
  expect(context.facts.find(f => f.source === current[0].source)?.finding).toContain("No suspender el medicamento.");
  expect(context.facts.find(f => f.source === current[2].source)?.finding).toBe('[{"food":"nuez","reaction":"alergia"}]');
  const history = context.facts.find(f => f.source === "Historial · Peso")!.finding;
  expect(history).toContain("2026-06-01");expect(history).toContain("2026-08-01");expect(history).toContain("91 kg");expect(history).not.toContain("2026-07-01");
  expect(context.facts.some(f => f.source === "Historial · Pliegue tricipital")).toBe(false);
  expect(context.facts.filter(f => f.source.includes("body_fat_percentage"))).toHaveLength(2);
  expect(buildConsultationSupportContext({ facts, stamp: "s" },true).facts.find(f => f.source === current[0].source)?.finding).toContain("No suspender el medicamento.");
  const evidence = [context.facts[0]];
  expect(clinicalEvidenceValid("pes_diagnosis",{problem:"Borrador",etiology:"",signsSymptoms:[],pesStatement:"Borrador",evidence},context)).toBe(true);
});
