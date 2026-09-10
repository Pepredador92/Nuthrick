import React from "react";
import { createRoot } from "react-dom/client";
import { DietMealDistributionStep } from "@/src/components/diet/DietMealDistributionStep";
import { createExchangePrescription, setExchangePortions } from "@/src/features/exchanges/model";
import { applyMealDistributionSuggestion, createMealDistribution, suggestMealDistribution } from "@/src/features/meal-distribution/model";
import type { ExchangeGroupCode, NutritionPlan } from "@/src/types/domain";
import "../../app/globals.css";

const targets = { energy_kcal: 2100, carbohydrate_g: 270, protein_g: 105, fat_g: 66 };
let exchange = createExchangePrescription(targets);
const inventory: Partial<Record<ExchangeGroupCode, number>> = {
  VEGETABLES: 5, FRUITS: 4, CEREALS_NO_FAT: 8, LEGUMES: 1, AOA_VERY_LOW_FAT: 4,
  AOA_LOW_FAT: 5, MILK_SKIM: 2, FATS_NO_PROTEIN: 4, FATS_WITH_PROTEIN: 1,
};
for (const [code, portions] of Object.entries(inventory)) exchange = setExchangePortions(exchange, targets, code as ExchangeGroupCode, portions ?? 0);
const base = createMealDistribution();
const mealDistribution = applyMealDistributionSuggestion(base, suggestMealDistribution(base, exchange));

const plan: NutritionPlan = {
  id: "visual-meal-plan", professional_id: "visual-professional", patient_id: null, consultation_id: null,
  title: "Plan de verificación", assigned_at: "2026-09-10", review_date: null, plan_type: null, category: null,
  target_calories: 2100, energy_calculation: null, macro_distribution: null, exchange_prescription: exchange,
  meal_distribution: mealDistribution, status: "draft", created_at: "2026-09-10T09:00:00Z", updated_at: "2026-09-10T09:00:00Z",
};

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto min-h-screen max-w-[1440px] bg-[#f7f8f4] p-3 sm:p-8">
    <DietMealDistributionStep plan={plan} onSave={async () => undefined} onDraftChange={() => undefined} onGoToEquivalents={() => undefined} />
  </main>,
);
