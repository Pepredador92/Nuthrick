import React from "react";
import { createRoot } from "react-dom/client";
import { DietEquivalentsStep } from "@/src/components/diet/DietEquivalentsStep";
import type { NutritionPlan } from "@/src/types/domain";
import "../../app/globals.css";

const plan: NutritionPlan = {
  id: "visual-exchange-plan", professional_id: "visual-professional", patient_id: null, consultation_id: null,
  title: "Plan de verificación", assigned_at: "2026-09-10", review_date: null, plan_type: null, category: null,
  target_calories: 2000, energy_calculation: null, macro_distribution: null, exchange_prescription: null, meal_distribution: null,
  status: "draft", created_at: "2026-09-10T09:00:00Z", updated_at: "2026-09-10T09:00:00Z",
};

createRoot(document.getElementById("root")!).render(
  <main className="mx-auto min-h-screen max-w-[1440px] bg-[#f7f8f4] p-3 sm:p-8">
    <DietEquivalentsStep
      plan={plan}
      targets={{ energy_kcal: 2000, carbohydrate_g: 250.5, protein_g: 100.4, fat_g: 60.2 }}
      onSave={async () => undefined}
      onDraftChange={() => undefined}
      onGoToMacros={() => undefined}
    />
  </main>,
);
