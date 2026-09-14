import { describe, expect, it } from "vitest";
import { changedDietPlanPatch } from "./autosave";
import type { NutritionPlan } from "@/src/types/domain";

const plan = {
  id: "plan", title: "Plan", target_calories: 1800, energy_calculation: null, macro_distribution: null,
  exchange_prescription: null, meal_distribution: null, diet_menu: null,
} as NutritionPlan;

describe("diet plan autosave diff", () => {
  it("removes unchanged and undefined fields before UPDATE", () => {
    expect(changedDietPlanPatch(plan, { title: "Plan", target_calories: undefined, diet_menu: null })).toEqual({});
    expect(changedDietPlanPatch(plan, { title: "Plan ajustado", target_calories: 1900 })).toEqual({ title: "Plan ajustado", target_calories: 1900 });
  });
});
