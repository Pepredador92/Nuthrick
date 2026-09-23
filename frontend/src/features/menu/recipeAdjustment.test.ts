import { describe, expect, it } from "vitest";
import { activeMenu, addRecipeToMenu, calculateMenuStatus, createDietMenu, createFoodSnapshot, exchangeContributionForFood } from "./model";
import { suggestRecipeAdjustment } from "./recipeAdjustment";
import type { ExchangeGroupCode, FoodItem, MealDistribution, Recipe } from "@/src/types/domain";

const mealId = "lunch";
const food = (id: string, group_code: ExchangeGroupCode, portion_amount = 1, portion_unit: FoodItem["portion_unit"] = "piece"): FoodItem => ({
  id, owner_id: null, stable_code: null, catalog_code: null, name: id, normalized_name: id, aliases: [], brand: null, category: null,
  exchange_system_code: "TEST", exchange_catalog_version: "1", group_code, portion_amount, portion_unit, portion_description: "",
  alternate_portions: [], edible_grams: null, energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null,
  attributes: {}, source: "TEST", source_version: "1", source_reference: null, is_custom: false, use_count: 0, active: true, created_at: "", updated_at: "",
});
const ingredient = (item: FoodItem, amount: number, index: number): Recipe["items"][number] => ({
  id: `ingredient-${index}`, owner_id: null, recipe_id: "recipe", food_item_id: item.id, amount, unit: item.portion_unit, display_order: index,
  food_snapshot: createFoodSnapshot(item), exchange_contribution: exchangeContributionForFood(item, amount), created_at: "",
});
const recipe = (...items: Recipe["items"]): Recipe => ({
  id: "recipe", owner_id: null, stable_code: null, name: "Receta", normalized_name: "receta", description: null, meal_types: ["MAIN_MEAL"],
  servings: 1, instructions: "Preparar", image_path: null, tags: [], substitution_notes: null, source: "TEST", source_version: "1",
  source_reference: null, is_custom: false, active: true, created_at: "", updated_at: "", items: items.flat(),
});
const distribution = (groups: Array<[ExchangeGroupCode, number]>): MealDistribution => ({
  schema_version: 1, source_exchange_snapshot: null, meal_times: [{ id: mealId, meal_type: "MAIN_MEAL", display_name: "Comida", time: "14:00", display_order: 0 }],
  distribution: groups.map(([group_code, portions]) => ({ meal_time_id: mealId, group_code, portions })), derived_meal_totals: [], status: "ready", confirmed_at: null, updated_at: "",
});

describe("recipe adjustment suggestion", () => {
  const cereal = food("Arroz", "CEREALS_NO_FAT", 0.5, "cup");
  const chicken = food("Pollo", "AOA_VERY_LOW_FAT", 30, "g");
  const vegetables = food("Verduras", "VEGETABLES", 1, "cup");

  it("proposes only existing ingredient increases and recalculates the full meal vector", () => {
    const target = distribution([["CEREALS_NO_FAT", 2], ["AOA_VERY_LOW_FAT", 4], ["VEGETABLES", 1], ["FRUITS", 1]]);
    const original = recipe(ingredient(cereal, 0.5, 0), ingredient(chicken, 90, 1), ingredient(vegetables, 1, 2));
    const library = structuredClone(original);
    const menu = createDietMenu(target);
    const menuBefore = structuredClone(menu);
    const suggestion = suggestRecipeAdjustment(menu, target, mealId, original)!;
    expect(suggestion.changes.map(change => [change.name, change.from, change.to])).toEqual([["Arroz", 0.5, 1], ["Pollo", 90, 120]]);
    expect(suggestion.outcomeRows.map(row => [row.group_code, row.remaining])).toEqual([
      ["CEREALS_NO_FAT", 0], ["AOA_VERY_LOW_FAT", 0], ["VEGETABLES", 0], ["FRUITS", 1],
    ]);
    expect(menu).toEqual(menuBefore); // Opening the preview never writes.
    expect(original).toEqual(library);
    const applied = addRecipeToMenu(menu, target, mealId, suggestion.recipe);
    const entry = activeMenu(applied).meal_menus[0].entries[0];
    expect(entry.recipe_snapshot?.items.map(item => item.amount)).toEqual([1, 120, 1]);
    expect(calculateMenuStatus(applied, target).rows.find(row => row.group_code === "FRUITS")?.remaining).toBe(1);
    expect(original).toEqual(library); // The global recipe remains untouched after apply.
  });

  it("does not suggest unrelated changes for an incompatible missing group", () => {
    const target = distribution([["CEREALS_NO_FAT", 1], ["FRUITS", 1]]);
    expect(suggestRecipeAdjustment(createDietMenu(target), target, mealId, recipe(ingredient(cereal, 0.5, 0)))).toBeNull();
  });

  it("rejects a practical quantity that would create a new excess", () => {
    const tiny = food("Tiny", "CEREALS_NO_FAT", 1, "g");
    const target = distribution([["CEREALS_NO_FAT", 2]]);
    expect(suggestRecipeAdjustment(createDietMenu(target), target, mealId, recipe(ingredient(tiny, 1, 0)))).toBeNull();
  });

  it("chooses the single ingredient that solves a gap over partial changes", () => {
    const awkward = food("Awkward", "CEREALS_NO_FAT", 6, "g");
    const tortilla = food("Tortilla", "CEREALS_NO_FAT", 1, "tortilla");
    const target = distribution([["CEREALS_NO_FAT", 3]]);
    const original = recipe(ingredient(awkward, 6, 0), ingredient(tortilla, 1, 1));
    const suggestion = suggestRecipeAdjustment(createDietMenu(target), target, mealId, original)!;
    expect(suggestion.changes).toEqual([{ itemId: "ingredient-1", name: "Tortilla", from: 1, to: 2, unit: "tortilla" }]);
  });

  it("preserves half-portion precision without floating-point artifacts", () => {
    const tortilla = food("Tortilla", "CEREALS_NO_FAT", 1, "tortilla");
    const target = distribution([["CEREALS_NO_FAT", 1.5]]);
    const suggestion = suggestRecipeAdjustment(createDietMenu(target), target, mealId, recipe(ingredient(tortilla, 1, 0)))!;
    expect(suggestion.changes[0].to).toBe(1.5);
    expect(suggestion.outcomeRows[0].remaining).toBe(0);
  });

  it("scales ingredient changes by the recipe's total yield while previewing one serving", () => {
    const target = distribution([["CEREALS_NO_FAT", 2]]);
    const original = { ...recipe(ingredient(cereal, 2, 0)), servings: 4 }; // Four servings, one exchange each.
    const suggestion = suggestRecipeAdjustment(createDietMenu(target), target, mealId, original)!;
    expect(suggestion.changes[0]).toMatchObject({ from: 2, to: 4 });
    expect(suggestion.outcomeRows[0].remaining).toBe(0);
  });

  it("preserves an existing excess while improving another group's deficit", () => {
    const fat = food("Aceite", "FATS_NO_PROTEIN", 1, "teaspoon");
    const target = distribution([["CEREALS_NO_FAT", 2], ["FATS_NO_PROTEIN", 1]]);
    const original = recipe(ingredient(cereal, 0.5, 0), ingredient(fat, 2, 1));
    const suggestion = suggestRecipeAdjustment(createDietMenu(target), target, mealId, original)!;
    expect(suggestion.changes).toHaveLength(1);
    expect(suggestion.changes[0].name).toBe("Arroz");
    expect(suggestion.outcomeRows.map(row => [row.group_code, row.remaining])).toEqual([["CEREALS_NO_FAT", 0], ["FATS_NO_PROTEIN", -1]]);
  });

  it("declines inconsistent or multi-group ingredient data instead of guessing", () => {
    const target = distribution([["CEREALS_NO_FAT", 2]]);
    const original = recipe(ingredient(cereal, 0.5, 0));
    original.items[0].exchange_contribution.push({ group_code: "FATS_NO_PROTEIN", portions: 1 });
    expect(suggestRecipeAdjustment(createDietMenu(target), target, mealId, original)).toBeNull();
  });
});
