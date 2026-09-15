import { describe, expect, it } from "vitest";
import { exchangeAlternatives, exchangeKey, mealAlternatives, mealKey, preparationLimitations } from "./proposals";
import type { FoodItem, Recipe } from "@/src/types/domain";
import { createFoodSnapshot, recipeExchangeContributions } from "@/src/features/menu/model";
import { calculateDistributionStatus, createMealDistribution, setDistributedPortions, suggestMealDistribution } from "@/src/features/meal-distribution/model";
import { createExchangePrescription, setExchangePortions } from "@/src/features/exchanges/model";
import { suggestExchangePrescription } from "@/src/features/exchanges/suggestion";

const targets = { energy_kcal: 2000, carbohydrate_g: 250, protein_g: 100, fat_g: 60 };
const prescription = () => {
  let p = createExchangePrescription(targets);
  for (const [code, n] of [["AOA_MODERATE_FAT", 2], ["CEREALS_NO_FAT", 4], ["LEGUMES", 2.33], ["VEGETABLES", 3]] as const) p = setExchangePortions(p, targets, code, n);
  return p;
};
describe("coordinated proposals", () => {
  it("uses a feasible recipe as evidence and identifies inventory without catalog foods", () => {
    const foods = (["AOA_MODERATE_FAT", "CEREALS_NO_FAT", "LEGUMES"] as const).map((group_code, i) => ({
      id: `food-${i}`, owner_id: null, stable_code: null, catalog_code: null, name: ["Huevo", "Tortilla", "Frijoles"][i], normalized_name: "", aliases: [], brand: null, category: null,
      exchange_system_code: "SMAE_NOM037_2012", exchange_catalog_version: "1", group_code, portion_amount: 1, portion_unit: "piece", portion_description: "1 pieza", alternate_portions: [], edible_grams: null,
      energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null, attributes: {}, source: "TEST", source_version: "1", source_reference: null, is_custom: false, use_count: 0, active: true, created_at: "", updated_at: "",
    } satisfies FoodItem));
    const recipe: Recipe = { id: "recipe", owner_id: null, stable_code: null, name: "Huevo con frijoles y tortilla", normalized_name: "", description: null, meal_types: ["BREAKFAST"], servings: 1, instructions: null, image_path: null, tags: [], substitution_notes: null, source: "TEST", source_version: "1", source_reference: null, is_custom: false, active: true, created_at: "", updated_at: "", items: foods.map((f, i) => ({ id: String(i), owner_id: null, recipe_id: "recipe", food_item_id: f.id, amount: 1, unit: f.portion_unit, display_order: i, food_snapshot: createFoodSnapshot(f), exchange_contribution: [{ group_code: f.group_code, portions: 1 }], created_at: "" })) };
    const current = createMealDistribution();
    const breakfast = current.meal_times.find(m => m.meal_type === "BREAKFAST")!.id;
    const alternatives = mealAlternatives(current, prescription(), [], false, { foods, recipes: [recipe] });
    expect(alternatives.some(a => recipeExchangeContributions(recipe).every(c => (a.distribution.find(e => e.meal_time_id === breakfast && e.group_code === c.group_code)?.portions ?? 0) >= c.portions))).toBe(true);
    expect(preparationLimitations(["VEGETABLES"], { foods, recipes: [recipe] })).toMatch(/Verduras/);
  });
  it("keeps different milk subtypes apart while allowing intentionally fixed combinations", () => {
    let p = createExchangePrescription(targets);
    p = setExchangePortions(p, targets, "MILK_SKIM", 2);
    p = setExchangePortions(p, targets, "MILK_WHOLE", 2);
    let current = createMealDistribution();
    const alternatives = mealAlternatives(current, p, [], false);
    expect(alternatives.some(a => current.meal_times.every(m => a.distribution.filter(e => e.meal_time_id === m.id && e.group_code.startsWith("MILK_")).length <= 1))).toBe(true);
    const id = current.meal_times[0].id;
    current = setDistributedPortions(setDistributedPortions(current, "MILK_SKIM", id, 2), "MILK_WHOLE", id, 2);
    expect(mealAlternatives(current, p, [id], false)[0].distribution).toEqual(current.distribution);
  });
  it("offers reproducible, distinct comparable alternatives including a milk-free option", () => {
    const alternatives = exchangeAlternatives({ targets });
    expect(alternatives.length).toBeGreaterThan(1);
    expect(new Set(alternatives.map(exchangeKey)).size).toBe(alternatives.length);
    expect(alternatives.map(exchangeKey)).toEqual(exchangeAlternatives({ targets }).map(exchangeKey));
    expect(alternatives.some(p => p.groups.every(g => !g.groupCode.startsWith("MILK_") || g.portions === 0))).toBe(true);
    for (const p of alternatives) for (const key of Object.keys(targets) as Array<keyof typeof targets>) expect(Math.abs(p.differences[key]) / targets[key]).toBeLessThanOrEqual(0.15);
    console.info("Equivalentes antes/después", { before: suggestExchangePrescription({ targets }).groups.filter(g => g.portions), after: alternatives[0].groups.filter(g => g.portions), differences: alternatives[0].differences });
  });
  it("preserves arbitrary locked values and exclusions and reports their conflicts", () => {
    const alternatives = exchangeAlternatives({ targets, options: { lockedGroups: { LEGUMES: 1.33 }, groupPreferences: { MILK_SKIM: "exclude" } } });
    expect(alternatives.length).toBeGreaterThan(0);
    for (const p of alternatives) { expect(p.groups.find(g => g.groupCode === "LEGUMES")?.portions).toBe(1.33); expect(p.groups.find(g => g.groupCode === "MILK_SKIM")?.portions).toBe(0); }
    expect(() => exchangeAlternatives({ targets, options: { lockedGroups: { LEGUMES: 1 }, groupPreferences: { LEGUMES: "exclude" } } })).toThrow(/fijado y excluido/);
  });
  it("keeps exact inventory and creates an egg-bean-tortilla breakfast without requiring a recipe", () => {
    const current = createMealDistribution();
    const p = prescription();
    const alternatives = mealAlternatives(current, p, [], false);
    expect(alternatives.length).toBeGreaterThan(1);
    expect(alternatives.map(mealKey)).toEqual(mealAlternatives(current, p, [], false).map(mealKey));
    const breakfast = current.meal_times.find(m => m.meal_type === "BREAKFAST")!.id;
    expect(alternatives.some(a => ["AOA_MODERATE_FAT", "LEGUMES", "CEREALS_NO_FAT"].every(code => a.distribution.some(e => e.meal_time_id === breakfast && e.group_code === code && e.portions >= 1)))).toBe(true);
    for (const a of alternatives) expect(calculateDistributionStatus(a.distribution, p).canConfirm).toBe(true);
    console.info("Tiempos antes/después", { before: suggestMealDistribution(current, p).distribution.length, after: alternatives[0].distribution.length });
  });
  it("preserves a locked meal exactly and rejects overdrawn or fully locked inventory", () => {
    const p = prescription();
    let current = createMealDistribution();
    const id = current.meal_times[0].id;
    current = setDistributedPortions(current, "LEGUMES", id, 0.33);
    for (const a of mealAlternatives(current, p, [id], true)) {
      expect(a.distribution.filter(e => e.meal_time_id === id)).toEqual(current.distribution.filter(e => e.meal_time_id === id));
      expect(calculateDistributionStatus(a.distribution, p).canConfirm).toBe(true);
    }
    expect(() => mealAlternatives(current, p, current.meal_times.map(m => m.id), false)).toThrow(/Libera un tiempo/);
    expect(() => mealAlternatives(setDistributedPortions(current, "LEGUMES", id, 100), p, [id], false)).toThrow(/excede/);
  });
});
