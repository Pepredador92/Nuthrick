import type { DietPlanPatch } from "@/src/services/dietPlans";
import type { NutritionPlan } from "@/src/types/domain";

export type AutosaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";

export const AUTOSAVE_DEBOUNCE_MS = 800;
export const AUTOSAVE_SAVED_INDICATOR_MS = 1_200;

export function encodePersistedValue(value: unknown) {
  return JSON.stringify(value);
}

export function changedDietPlanPatch(plan: NutritionPlan, patch: DietPlanPatch): DietPlanPatch {
  return Object.fromEntries(Object.entries(patch).filter(([key, value]) => {
    if (value === undefined) return false;
    return encodePersistedValue(plan[key as keyof NutritionPlan]) !== encodePersistedValue(value);
  })) as DietPlanPatch;
}
