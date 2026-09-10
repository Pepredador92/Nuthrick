import { describe, expect, it } from "vitest";
import { createExchangePrescription } from "@/src/features/exchanges/model";
import { createDefaultMealTimes } from "@/src/features/meal-distribution/model";
import {
  addFoodToMenu,
  addRecipeToMenu,
  calculateMenuStatus,
  confirmDietMenu,
  createDietMenu,
  createFoodSnapshot,
  exchangeContributionForFood,
  recipeCompatibilityScore,
  reconcileDietMenu,
  removeMenuEntry,
  updateMenuEntryQuantity,
} from "@/src/features/menu/model";
import type { FoodItem, MealDistribution, Recipe } from "@/src/types/domain";

const mealTimes = createDefaultMealTimes(() => `meal-${Math.random()}`);
const breakfast = mealTimes[0].id;
const distribution: MealDistribution = {
  schema_version: 1,
  source_exchange_snapshot: null,
  meal_times: mealTimes,
  distribution: [
    { meal_time_id: breakfast, group_code: "FRUITS", portions: 1 },
    { meal_time_id: breakfast, group_code: "CEREALS_NO_FAT", portions: 2 },
  ],
  derived_meal_totals: [], status: "ready", confirmed_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
};

const food = (id: string, name: string, group_code: FoodItem["group_code"], portion_amount = 1): FoodItem => ({
  id, owner_id: "owner", name, normalized_name: name.toLowerCase(), brand: null, category: null,
  exchange_system_code: "SMAE_NOM037_2012", exchange_catalog_version: "1.0.0", group_code,
  portion_amount, portion_unit: "piece", portion_description: `${portion_amount} pieza`, edible_grams: null,
  energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null,
  attributes: { gluten: "unknown" }, source: "PROFESSIONAL_CUSTOM", source_version: "1", is_custom: true,
  use_count: 0, active: true, created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
});

const fruit = food("fruit", "Papaya", "FRUITS");
const cereal = food("cereal", "Tortilla", "CEREALS_NO_FAT");
const recipe = (): Recipe => ({
  id: "recipe", owner_id: "owner", name: "Papaya con tortillas", normalized_name: "papaya con tortillas",
  description: null, meal_types: ["BREAKFAST"], servings: 1, instructions: null, image_path: null,
  source: "PROFESSIONAL_CUSTOM", source_version: "1", is_custom: true, active: true,
  created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
  items: [
    { id: "ri1", owner_id: "owner", recipe_id: "recipe", food_item_id: fruit.id, amount: 1, unit: "piece", display_order: 0, food_snapshot: createFoodSnapshot(fruit), exchange_contribution: exchangeContributionForFood(fruit, 1), created_at: "" },
    { id: "ri2", owner_id: "owner", recipe_id: "recipe", food_item_id: cereal.id, amount: 2, unit: "piece", display_order: 1, food_snapshot: createFoodSnapshot(cereal), exchange_contribution: exchangeContributionForFood(cereal, 2), created_at: "" },
  ],
});

describe("diet menu model", () => {
  it("creates a versioned main menu with every meal time", () => {
    const menu = createDietMenu(distribution, () => "menu-main");
    expect(menu.active_menu_id).toBe("menu-main");
    expect(menu.menus[0].meal_menus).toHaveLength(5);
    expect(menu.status).toBe("not_started");
  });

  it("separates numeric quantity and patient-facing unit", () => {
    expect(exchangeContributionForFood(food("rice", "Arroz", "CEREALS_NO_FAT", 0.5), 1.5)).toEqual([{ group_code: "CEREALS_NO_FAT", portions: 3 }]);
  });

  it("adds foods as materialization, not extra prescribed exchanges", () => {
    const menu = addFoodToMenu(createDietMenu(distribution), distribution, breakfast, fruit, 1, "entry");
    const row = calculateMenuStatus(menu, distribution).rows.find((item) => item.group_code === "FRUITS");
    expect(row).toMatchObject({ portions: 1, used: 1, remaining: 0, state: "complete" });
  });

  it("supports fractional food quantities", () => {
    const menu = addFoodToMenu(createDietMenu(distribution), distribution, breakfast, cereal, 1.5);
    expect(calculateMenuStatus(menu, distribution).rows.find((item) => item.group_code === "CEREALS_NO_FAT")?.remaining).toBe(0.5);
  });

  it("reports exact pending and excess instead of mutating the prescription", () => {
    const pending = addFoodToMenu(createDietMenu(distribution), distribution, breakfast, cereal, 1);
    expect(calculateMenuStatus(pending, distribution).pending).toBe(2);
    const excess = addFoodToMenu(pending, distribution, breakfast, cereal, 2);
    expect(calculateMenuStatus(excess, distribution).rows.find((item) => item.group_code === "CEREALS_NO_FAT")?.remaining).toBe(-1);
  });

  it("updates and removes an entry while recomputing usage", () => {
    const added = addFoodToMenu(createDietMenu(distribution), distribution, breakfast, fruit, 1, "entry");
    const updated = updateMenuEntryQuantity(added, distribution, "entry", 2);
    expect(calculateMenuStatus(updated, distribution).excess).toBe(1);
    expect(calculateMenuStatus(removeMenuEntry(updated, distribution, "entry"), distribution).pending).toBe(2);
  });

  it("adds a recipe snapshot and consumes all of its group contributions", () => {
    const menu = addRecipeToMenu(createDietMenu(distribution), distribution, breakfast, recipe(), 1, "recipe-entry");
    expect(calculateMenuStatus(menu, distribution)).toMatchObject({ complete: 2, pending: 0, excess: 0, canConfirm: true });
    const snapshot = menu.menus[0].meal_menus[0].entries[0].recipe_snapshot;
    expect(snapshot?.items).toHaveLength(2);
  });

  it("scores exact, partial and excessive recipe compatibility deterministically", () => {
    const required = distribution.distribution.map(({ group_code, portions }) => ({ group_code, portions }));
    expect(recipeCompatibilityScore(required, recipe()).label).toBe("Cubre las porciones asignadas");
    const partial = { ...recipe(), items: recipe().items.slice(0, 1) };
    expect(recipeCompatibilityScore(required, partial)).toMatchObject({ excess: 0, label: "Alta compatibilidad" });
    const excessive = { ...recipe(), items: [{ ...recipe().items[1], amount: 3, exchange_contribution: [{ group_code: "CEREALS_NO_FAT" as const, portions: 3 }] }] };
    expect(recipeCompatibilityScore(required, excessive).excess).toBe(1);
  });

  it("only confirms an exactly represented menu and stores a historical snapshot", () => {
    const incomplete = addFoodToMenu(createDietMenu(distribution), distribution, breakfast, fruit, 1);
    expect(confirmDietMenu(incomplete, distribution)).toBe(incomplete);
    const complete = addRecipeToMenu(createDietMenu(distribution), distribution, breakfast, recipe());
    const confirmed = confirmDietMenu(complete, distribution);
    expect(confirmed.status).toBe("ready");
    expect(confirmed.source_meal_distribution_snapshot).not.toBe(distribution);
    expect(confirmed.source_meal_distribution_snapshot?.distribution).toEqual(distribution.distribution);
  });

  it("returns to editing when an entry changes after confirmation", () => {
    const confirmed = confirmDietMenu(addRecipeToMenu(createDietMenu(distribution), distribution, breakfast, recipe()), distribution);
    expect(updateMenuEntryQuantity(confirmed, distribution, confirmed.menus[0].meal_menus[0].entries[0].id, 0.5).status).toBe("editing");
  });

  it("preserves menu entries and marks editing after meal_distribution changes", () => {
    const confirmed = confirmDietMenu(addRecipeToMenu(createDietMenu(distribution), distribution, breakfast, recipe()), distribution);
    const changed = { ...distribution, distribution: distribution.distribution.map((item) => item.group_code === "FRUITS" ? { ...item, portions: 1.5 } : item) };
    const reconciled = reconcileDietMenu(confirmed, changed);
    expect(reconciled.status).toBe("editing");
    expect(reconciled.menus[0].meal_menus[0].entries).toHaveLength(1);
    expect(calculateMenuStatus(reconciled, changed).pending).toBe(1);
  });

  it("does not interpret free-text restrictions or entire exchange groups", () => {
    const snapshot = createFoodSnapshot(fruit);
    expect(snapshot.attributes.gluten).toBe("unknown");
    expect(snapshot.group_code).toBe("FRUITS");
  });

  it("keeps upstream exchange prescription independent", () => {
    const prescription = createExchangePrescription({ energy_kcal: 1800, carbohydrate_g: 200, protein_g: 90, fat_g: 60 });
    const before = structuredClone(prescription);
    addRecipeToMenu(createDietMenu(distribution), distribution, breakfast, recipe());
    expect(prescription).toEqual(before);
  });
});
