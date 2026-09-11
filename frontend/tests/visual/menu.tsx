import React from "react";
import { createRoot } from "react-dom/client";
import { DietMenuStep } from "@/src/components/diet/DietMenuStep";
import { addFoodToMenu, createDietMenu } from "@/src/features/menu/model";
import type { FoodItem, MealDistribution, NutritionPlan } from "@/src/types/domain";
import "../../app/globals.css";

const meals = [
  { id: "breakfast", meal_type: "BREAKFAST" as const, display_name: "Desayuno", time: "08:00", display_order: 0 },
  { id: "snack", meal_type: "SNACK" as const, display_name: "Colación", time: "11:30", display_order: 1 },
  { id: "lunch", meal_type: "MAIN_MEAL" as const, display_name: "Comida", time: "15:00", display_order: 2 },
  { id: "dinner", meal_type: "DINNER" as const, display_name: "Cena", time: "20:00", display_order: 3 },
];
const mealDistribution: MealDistribution = {
  schema_version: 1, source_exchange_snapshot: null, meal_times: meals,
  distribution: [
    { meal_time_id: "breakfast", group_code: "FRUITS", portions: 1 },
    { meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT", portions: 2 },
    { meal_time_id: "breakfast", group_code: "MILK_SKIM", portions: 1 },
    { meal_time_id: "lunch", group_code: "VEGETABLES", portions: 2 },
  ], derived_meal_totals: [], status: "ready", confirmed_at: "2026-09-10T09:00:00Z", updated_at: "2026-09-10T09:00:00Z",
};
const papaya: FoodItem = {
  id: "papaya", owner_id: "visual", stable_code: null, catalog_code: null, name: "Papaya preparada", normalized_name: "papaya preparada", aliases: [], brand: null, category: null,
  exchange_system_code: "SMAE_NOM037_2012", exchange_catalog_version: "1.0.0", group_code: "FRUITS",
  portion_amount: 1, portion_unit: "cup", portion_description: "1 taza", alternate_portions: [], edible_grams: null,
  energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null,
  attributes: { gluten: "free", lactose: "free" }, source: "PROFESSIONAL_CUSTOM", source_version: "1", source_reference: null, is_custom: true,
  use_count: 2, active: true, created_at: "2026-09-10T09:00:00Z", updated_at: "2026-09-10T09:00:00Z",
};
let menu = createDietMenu(mealDistribution, () => "main");
menu = addFoodToMenu(menu, mealDistribution, "breakfast", papaya, 1, "entry-papaya");
const plan: NutritionPlan = {
  id: "visual", professional_id: "visual", patient_id: null, consultation_id: null, title: "Plan visual", assigned_at: "2026-09-10",
  review_date: null, plan_type: null, category: null, target_calories: 1800, energy_calculation: null, macro_distribution: null,
  exchange_prescription: null, meal_distribution: mealDistribution, diet_menu: menu, status: "draft", created_at: "", updated_at: "",
};

createRoot(document.getElementById("root")!).render(<main className="mx-auto min-h-screen max-w-[1440px] bg-[#f7f8f4] p-3 sm:p-8"><DietMenuStep plan={plan} catalog={{ foods: [papaya], recipes: [] }} onSave={async () => undefined} onGoToMeals={() => undefined} /></main>);
