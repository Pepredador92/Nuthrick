// Offline visual/E2E fixture only. Never imported by the application build.
import type { FoodItem } from "../../src/types/domain";
export const aiMessages = {
  insufficient_credits: "No tienes créditos de IA disponibles.",
  provider_outcome_unknown: "Comprueba la solicitud pendiente.",
};
export type AIState =
  | "idle"
  | "generating"
  | "ready"
  | "error"
  | "insufficient"
  | "uncertain";
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
    if (kind === "recall")
      records[kind].items = (payload.items as { foodId: string }[]).map(
        (i) => ({ ...i, food: foods.find((f) => f.id === i.foodId) }),
      );
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
  const item = (
    rawText: string,
    normalizedName: string,
    quantity: number | null,
    unit: string | null,
  ) => ({
    rawText,
    normalizedName,
    quantity,
    unit,
    confidence: 0.8,
    needsConfirmation: quantity === null,
  });
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
            meals: [
              {
                mealLabel: "Desayuno",
                approximateTime: null,
                items: [
                  item("2 huevos", "Huevo entero", 2, "piece"),
                  item("3 tortillas", "Tortilla de maíz", 3, "tortilla"),
                  item(
                    "media taza de frijoles",
                    "Frijoles cocidos",
                    0.5,
                    "cup",
                  ),
                ],
              },
              {
                mealLabel: "Comida",
                approximateTime: null,
                items: [
                  item("pollo", "Pollo cocido", null, null),
                  item("arroz", "Arroz cocido", null, null),
                  item("agua", "Agua", null, null),
                ],
              },
              {
                mealLabel: "Cena",
                approximateTime: null,
                items: [item("3 tacos de carne", "Tacos de carne", 3, null)],
              },
            ],
            unresolvedItems: [
              "Agua: precisar presentación",
              "Tacos: precisar ingredientes y tamaño",
            ],
            ambiguities: ["Pollo y arroz: cantidades pendientes"],
          },
  };
}
