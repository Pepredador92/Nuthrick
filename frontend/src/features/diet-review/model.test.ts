import { describe, expect, it } from "vitest";
import { weeklyFixture } from "../../../tests/fixtures/weeklyMenu";
import { organizeWeek } from "@/src/features/menu/week";
import { prepareSingleDayForReview, validateNutritionPlanForPublication } from "./model";
import type { NutritionPlan } from "@/src/types/domain";

function readyPlan(): NutritionPlan {
  const fixture = weeklyFixture([1, 1, 1]);
  const menu = {
    ...fixture.menu,
    week_plan: organizeWeek({ ...fixture, days: ["mon"] }),
    status: "ready" as const,
    confirmed_at: "2026-09-15T12:00:00.000Z",
    source_meal_distribution_snapshot: structuredClone(fixture.distribution),
  };
  return {
    id: "plan", professional_id: "professional", patient_id: "patient", consultation_id: null,
    title: "Plan de prueba", assigned_at: "2026-09-15", review_date: null, plan_type: null, category: null,
    target_calories: 1800,
    energy_calculation: null,
    macro_distribution: { version: 1, target_energy_kcal: 1800, reference_weight_kg: null, reference_weight_source: "unavailable", reference_weight_override_kg: null, macros: {
      CARBOHYDRATE: { code: "CARBOHYDRATE", input_mode: "grams", input_value: 200, percentage: 44, kcal: 800, grams: 200, grams_per_kg: null },
      PROTEIN: { code: "PROTEIN", input_mode: "grams", input_value: 90, percentage: 20, kcal: 360, grams: 90, grams_per_kg: null },
      FAT: { code: "FAT", input_mode: "grams", input_value: 64, percentage: 32, kcal: 576, grams: 64, grams_per_kg: null },
    }, totals: { percentage: 96, kcal: 1736, difference_kcal: -64 }, complete: true, updated_at: "2026-09-15" },
    exchange_prescription: { schema_version: 1, exchange_system_code: "SMAE_NOM037_2012", catalog_version: "1", target_snapshot: { energy_kcal: 1800, carbohydrate_g: 200, protein_g: 90, fat_g: 64 }, confirmed_target_snapshot: { energy_kcal: 1800, carbohydrate_g: 200, protein_g: 90, fat_g: 64 }, groups: [], derived_totals: { energy_kcal: 1800, carbohydrate_g: 200, protein_g: 90, fat_g: 64 }, differences: { energy_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0 }, status: "ready", confirmed_at: "2026-09-15", updated_at: "2026-09-15" },
    meal_distribution: fixture.distribution,
    diet_menu: menu,
    draft_revision: 3,
    current_version_id: null,
    status: "draft", created_at: "", updated_at: "",
  };
}

describe("publication review", () => {
  it("validates each applied day without summing unused options", () => {
    const plan = readyPlan();
    expect(validateNutritionPlanForPublication(plan)).toMatchObject({ canPublish: true, errors: [] });
    plan.diet_menu!.meal_options!.push({ ...plan.diet_menu!.meal_options![0], id: "unused", status: "draft" });
    expect(validateNutritionPlanForPublication(plan)).toMatchObject({ canPublish: true, errors: [] });
  });

  it("reports the exact day and meal that is missing", () => {
    const plan = readyPlan();
    plan.diet_menu!.week_plan!.days[0].assignments = plan.diet_menu!.week_plan!.days[0].assignments.filter((entry) => entry.meal_time_id !== "lunch");
    expect(validateNutritionPlanForPublication(plan).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CALENDAR_INCOMPATIBLE", step: "menu" }),
    ]));
  });

  it("requires an explicit confirmation for the times and applied menu", () => {
    const plan = readyPlan();
    plan.meal_distribution = { ...plan.meal_distribution!, confirmed_at: null };
    plan.diet_menu = { ...plan.diet_menu!, confirmed_at: null };
    expect(validateNutritionPlanForPublication(plan).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MEAL_DISTRIBUTION_INCOMPLETE", step: "meals" }),
      expect.objectContaining({ code: "MENU_UNCONFIRMED", step: "menu" }),
    ]));
  });

  it("prepares a legacy plan as one explicit day without generating a week", () => {
    const plan = readyPlan();
    const legacy = { ...plan.diet_menu!, week_plan: null };
    const prepared = prepareSingleDayForReview(legacy, plan.meal_distribution!);
    expect(prepared?.week_plan?.days).toHaveLength(1);
    expect(prepared?.week_plan?.days[0].day).toBe("mon");
    expect(prepared?.week_plan?.days[0].assignments).toHaveLength(3);
  });
});
