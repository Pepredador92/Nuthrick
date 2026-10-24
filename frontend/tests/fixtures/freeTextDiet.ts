import type { NutritionPlan } from "../../src/types/domain";
import { createMacroDistribution, patchMacroInput } from "../../src/features/macros/model";

export function freeTextDietPlan(): NutritionPlan {
  let macros = createMacroDistribution(2000, 70);
  macros = patchMacroInput(macros, "PROTEIN", "percentage", 20);
  macros = patchMacroInput(macros, "CARBOHYDRATE", "percentage", 50);
  macros = patchMacroInput(macros, "FAT", "percentage", 30);
  return {
    id: "11111111-1111-4111-8111-111111111111", professional_id: "owner", patient_id: null, consultation_id: null,
    title: "Menú de 2000 kcal", status: "draft", last_workshop_step: "review", draft_revision: 1,
    assigned_at: "2026-10-23", review_date: null, plan_type: null, category: null,
    target_calories: 2000, energy_calculation: null, macro_distribution: macros,
    exchange_prescription: null, meal_distribution: null, diet_menu: null, created_at: "", updated_at: "",
    text_diet: {
      schema_version: 1, requested_count: 2, reviewed_at: "2026-10-23T12:00:00Z",
      prescription: { target_calories: 2000, macro_distribution: macros },
      meals: [{ name: "Desayuno", time: "08:00" }, { name: "Comida", time: "14:00" }],
      diets: [{ id: "first", title: "Dieta 1", text: "Desayuno\n• 2 huevos\nComida\n• 120 g de pollo" },
        { id: "second", title: "Dieta 2", text: "Desayuno\n• 1 taza de avena\nComida\n• 1 taza de lentejas" }],
    },
  };
}
