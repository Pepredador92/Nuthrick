// Offline visual/E2E fixture only. Never imported by the application build.
import type { FoodItem } from "../../src/types/domain";
export const hasSupabaseConfig = false;
export const aiMessages = {
  insufficient_credits: "No tienes créditos de IA disponibles.",
  provider_outcome_unknown: "Comprueba la solicitud pendiente.",
};
export type AIState =
  "idle" | "generating" | "ready" | "error" | "insufficient" | "uncertain";
export class AIRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export const getAIBalance = async () => ({
  available_credits: 100,
  reserved_credits: 0,
});
export const getAIGenerationStatus = async () => null;
export async function clinicalObjective(
  _id: string,
  revision: number,
  action = "read",
  _stamp?: string,
  questionKey?: string,
) {
  const records = JSON.parse(
    localStorage.getItem("qa-clinical-records") || "{}",
  );
  const pes = records.pes ?? null;
  let objective = JSON.parse(
    localStorage.getItem("qa-clinical-objective") || "null",
  );
  if (action === "approve") {
    if (!pes) throw new Error("Revisa y aprueba primero el PES.");
    const value = localStorage.getItem("qa-goal-text") || "";
    objective = {
      question_key: questionKey,
      value,
      content: value,
      revision,
      approved_at: new Date().toISOString(),
    };
    localStorage.setItem("qa-clinical-objective", JSON.stringify(objective));
  } else if (action === "revoke") {
    objective = null;
    localStorage.removeItem("qa-clinical-objective");
  }
  return {
    stamp: "synthetic-stamp",
    pes,
    objective,
    facts: [
      {
        source: "Entrevista · Motivo",
        finding: "Mejorar la regularidad de comidas",
      },
      {
        source: "Antropometría · Estatura",
        finding: "170 cm · medición 2026-09-21",
      },
    ],
    target: null,
  };
}
const food = (
  id: string,
  name: string,
  group_code: FoodItem["group_code"],
  portion_amount: number,
  portion_unit: FoodItem["portion_unit"],
  edible_grams: number,
): FoodItem => ({
  id,
  owner_id: null,
  name,
  normalized_name: name.toLowerCase(),
  aliases: [],
  active: true,
  is_custom: false,
  portion_amount,
  portion_unit,
  edible_grams,
  group_code,
  attributes: {},
  portion_description: `${portion_amount} ${portion_unit}`,
  exchange_system_code: "SMAE_NOM037_2012",
  exchange_catalog_version: "1.0.0",
  source: "Fixture",
  source_version: "1",
  stable_code: null,
  catalog_code: null,
  brand: null,
  category: null,
  alternate_portions: [],
  source_reference: null,
  use_count: 0,
  created_at: "2026-09-21",
  updated_at: "2026-09-21",
  energy_kcal: null,
  carbohydrate_g: null,
  protein_g: null,
  fat_g: null,
  fiber_g: null,
  sodium_mg: null,
});
export const foods = [
  food("egg", "Huevo entero", "AOA_MODERATE_FAT", 1, "piece", 50),
  food("tortilla", "Tortilla de maíz", "CEREALS_NO_FAT", 1, "tortilla", 30),
  food("beans", "Frijoles cocidos", "LEGUMES", 0.5, "cup", 90),
  food("chicken", "Pollo cocido", "AOA_VERY_LOW_FAT", 30, "g", 30),
  food("rice", "Arroz cocido", "CEREALS_NO_FAT", 0.25, "cup", 50),
];
const chain = {
  select: () => chain,
  or: () => chain,
  eq: () => chain,
  order: () => chain,
  range: async () => ({ data: foods, error: null }),
};
export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: { id: "offline" } }, error: null }),
  },
  from: () => chain,
};
export async function clinicalWorkspace(
  _id: string,
  _revision: number,
  kind?: string,
  payload?: Record<string, unknown>,
) {
  const records = JSON.parse(
    localStorage.getItem("qa-clinical-records") || "{}",
  );
  if (kind && payload) {
    records[kind] = { ...payload, approved_at: new Date().toISOString() };
    if (kind === "recall" && payload.method !== "ai_estimate")
      records[kind].items = (payload.items as { foodId: string }[]).map(
        (i) => ({ ...i, food: foods.find((f) => f.id === i.foodId) }),
      );
    if (kind === "recall" && payload.method === "ai_estimate") records[kind].items = [];
    localStorage.setItem("qa-clinical-records", JSON.stringify(records));
  }
  return {
    stamp: "synthetic-stamp",
    records,
    readiness: {
      interview: true,
      objective: true,
      anthropometry: true,
      laboratories: false,
    },
    target: {
      energy_kcal: 2000,
      protein_g: 100,
      carbohydrate_g: 250,
      fat_g: 66.7,
    },
  };
}
export async function runAIRequest(request: {
  feature: string;
  narrative?: string;
}) {
  await new Promise((r) => setTimeout(r, 250));
  if (request.feature === "consultation_support") return {
    generationId: crypto.randomUUID(), status: "succeeded", replay: false,
    output: { objectives: [{
      text: "Organizar las comidas durante la jornada laboral.",
      evidence: [{ source: "Entrevista · Motivo", finding: "Mejorar la regularidad de comidas" }],
    }] },
  };
  return {
    generationId: crypto.randomUUID(),
    status: "succeeded",
    replay: false,
    output:
      request.feature === "pes_diagnosis"
        ? {
            problem: "Consumo alimentario por precisar",
            etiology: "Contexto pendiente de revisión profesional",
            signsSymptoms: ["Peso registrado: 92 kg"],
            pesStatement: "Borrador de prueba para revisión profesional.",
            evidence: [
              { source: "Antropometría de consulta", finding: "Peso: 92 kg" },
            ],
            missingContext: ["Cantidades del recordatorio por precisar"],
            uncertainties: [
              "Información de prueba; no es un diagnóstico clínico",
            ],
          }
        : {
            confidence: 'low',
            assumptions: ['Para la leche se asumió un vaso de 240 ml.', 'Se estimaron porciones domésticas para el arroz y los frijoles.'],
            uncertainties: ['Confirmar la cantidad de arroz y frijoles y cómo se prepararon las alitas.'],
            meals: [
              { mealLabel: 'Desayuno', description: 'Dos gorditas de chicharrón con papa y un vaso de refresco.', energy_kcal: 700, protein_g: 18, carbohydrate_g: 80, fat_g: 34 },
              { mealLabel: 'Comida', description: 'Alitas, dos tortillas, arroz, frijoles y agua de limón; las porciones faltantes son supuestas.', energy_kcal: 850, protein_g: 36, carbohydrate_g: 105, fat_g: 32 },
              { mealLabel: 'Cena', description: 'Una lata de atún con jitomate y cebolla, galletas saladas y un vaso de leche.', energy_kcal: 490, protein_g: 39, carbohydrate_g: 42, fat_g: 18 },
            ],
          },
  };
}
export async function removeClinicalRecall() {
  const records = JSON.parse(localStorage.getItem('qa-clinical-records') || '{}');
  delete records.recall; delete records.pes;
  localStorage.setItem('qa-clinical-records', JSON.stringify(records));
}
