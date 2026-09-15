import { describe, expect, it } from "vitest";
import { createExchangePrescription } from "@/src/features/exchanges/model";
import { createDefaultMealTimes } from "@/src/features/meal-distribution/model";
import {
  activeMenu,
  addFoodToMenu,
  addRecipeToMenu,
  adjustRecipeIngredients,
  calculateMenuUsage,
  calculateMenuStatus,
  confirmDietMenu,
  createDietMenu,
  createFoodSnapshot,
  exchangeContributionForFood,
  expandMenuEntriesToRecipeItems,
  recipeCompatibilityScore,
  reconcileDietMenu,
  recipeIngredientsChanged,
  replaceFoodEntriesWithRecipe,
  replaceFoodMenuEntry,
  replaceMenuEntriesWithRecipe,
  replaceRecipeIngredient,
  replaceRecipeMenuEntry,
  removeMenuEntry,
  scoreRecipeCompatibility,
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
  id, owner_id: "owner", stable_code: null, catalog_code: null, name, normalized_name: name.toLowerCase(), aliases: [], brand: null, category: null,
  exchange_system_code: "SMAE_NOM037_2012", exchange_catalog_version: "1.0.0", group_code,
  portion_amount, portion_unit: "piece", portion_description: `${portion_amount} pieza`, alternate_portions: [], edible_grams: null,
  energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null,
  attributes: { gluten: "unknown" }, source: "PROFESSIONAL_CUSTOM", source_version: "1", source_reference: null, is_custom: true,
  use_count: 0, active: true, created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
});

const fruit = food("fruit", "Papaya", "FRUITS");
const cereal = food("cereal", "Tortilla", "CEREALS_NO_FAT");
const recipe = (): Recipe => ({
  id: "recipe", owner_id: "owner", stable_code: null, name: "Papaya con tortillas", normalized_name: "papaya con tortillas",
  description: null, meal_types: ["BREAKFAST"], servings: 1, instructions: null, image_path: null, tags: [], substitution_notes: null,
  source: "PROFESSIONAL_CUSTOM", source_version: "1", source_reference: null, is_custom: true, active: true,
  created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
  items: [
    { id: "ri1", owner_id: "owner", recipe_id: "recipe", food_item_id: fruit.id, amount: 1, unit: "piece", display_order: 0, food_snapshot: createFoodSnapshot(fruit), exchange_contribution: exchangeContributionForFood(fruit, 1), created_at: "" },
    { id: "ri2", owner_id: "owner", recipe_id: "recipe", food_item_id: cereal.id, amount: 2, unit: "piece", display_order: 1, food_snapshot: createFoodSnapshot(cereal), exchange_contribution: exchangeContributionForFood(cereal, 2), created_at: "" },
  ],
});

describe("diet menu model", () => {
  it("retains all menu entries and requests review when upstream distribution is reopened", () => {
    const draft = addRecipeToMenu(createDietMenu(distribution), distribution, breakfast, recipe());
    const ready = confirmDietMenu(draft, distribution);
    expect(ready.status).toBe("ready");
    const next = reconcileDietMenu(ready, { ...distribution, status: "editing" });
    expect(next.status).toBe("editing");
    expect(next.confirmed_at).toBeNull();
    expect(next.menus).toEqual(ready.menus);
  });
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

  it("relinks an edited menu entry to the saved personal recipe copy", () => {
    const menu = addRecipeToMenu(createDietMenu(distribution), distribution, breakfast, recipe(), 1, "recipe-entry");
    const copy = { ...recipe(), id: "personal-copy", name: "Mi desayuno ajustado", source: "PROFESSIONAL_CUSTOM" as const };
    const replaced = replaceRecipeMenuEntry(menu, distribution, "recipe-entry", copy);
    const entry = replaced.menus[0].meal_menus[0].entries[0];
    expect(entry).toMatchObject({ id: "recipe-entry", source_id: "personal-copy", name_snapshot: "Mi desayuno ajustado" });
    expect(entry.recipe_snapshot?.recipe_id).toBe("personal-copy");
  });

  it("substitutes only the exact group and preserves the original exchange contribution", () => {
    const tortilla = { ...cereal, id: "tortilla", name: "Tortilla", portion_unit: "tortilla" as const, portion_amount: 1 };
    const rice = { ...cereal, id: "rice", name: "Arroz cocido", portion_unit: "cup" as const, portion_amount: 0.5 };
    const base = recipe();
    const riceRecipe = {
      ...base,
      items: base.items.map((item) => item.id === "ri2" ? {
        ...item,
        food_item_id: rice.id,
        amount: 1,
        unit: rice.portion_unit,
        food_snapshot: createFoodSnapshot(rice),
        exchange_contribution: exchangeContributionForFood(rice, 1),
      } : item),
    };
    const changed = replaceRecipeIngredient(riceRecipe, "ri2", tortilla);
    expect(changed.items[1]).toMatchObject({ food_item_id: "tortilla", amount: 2, unit: "tortilla" });
    expect(changed.items[1].exchange_contribution).toEqual([{ group_code: "CEREALS_NO_FAT", portions: 2 }]);
    expect(recipeIngredientsChanged(riceRecipe, changed)).toBe(true);
    expect(riceRecipe.items[1].food_item_id).toBe("rice");

    const rejected = replaceRecipeIngredient(riceRecipe, "ri2", fruit);
    expect(rejected.items[1].food_item_id).toBe("rice");
  });

  it("allows a manual amount after substitution without mutating the global recipe", () => {
    const tortilla = { ...cereal, id: "tortilla", portion_unit: "tortilla" as const, portion_amount: 1 };
    const original = recipe();
    const substituted = replaceRecipeIngredient(original, "ri2", tortilla);
    const manuallyAdjusted = adjustRecipeIngredients(substituted, { ri2: 1.5 });
    expect(manuallyAdjusted.items[1].exchange_contribution).toEqual([{ group_code: "CEREALS_NO_FAT", portions: 1.5 }]);
    expect(original.items[1]).toMatchObject({ food_item_id: "cereal", amount: 2 });
  });

  it("exchanges an individual food entry inside its exact group and preserves portions", () => {
    const guava = { ...fruit, id: "guava", name: "Guayaba", portion_amount: 0.5, portion_unit: "cup" as const };
    const original = addFoodToMenu(createDietMenu(distribution), distribution, breakfast, fruit, 1, "fruit-entry");
    const exchanged = replaceFoodMenuEntry(original, distribution, "fruit-entry", guava);
    const entry = activeMenu(exchanged).meal_menus[0].entries[0];
    expect(entry).toMatchObject({ source_id: "guava", name_snapshot: "Guayaba", quantity: 0.5, unit: "cup" });
    expect(entry.exchange_contributions).toEqual([{ group_code: "FRUITS", portions: 1 }]);
    expect(replaceFoodMenuEntry(original, distribution, "fruit-entry", cereal)).toBe(original);
  });

  it("keeps an exact residual for traceability but treats at most 0.1 exchange as covered", () => {
    const tolerantDistribution = { ...distribution, distribution: [{ meal_time_id: breakfast, group_code: "FRUITS" as const, portions: 2 }] };
    const menu = addFoodToMenu(createDietMenu(tolerantDistribution), tolerantDistribution, breakfast, fruit, 1.917);
    const status = calculateMenuStatus(menu, tolerantDistribution);
    expect(status.rows[0]).toMatchObject({ remaining: 0.083, state: "complete" });
    expect(status.canConfirm).toBe(true);
  });

  it("expands a recipe snapshot plus visible foods into one flat derived recipe", () => {
    const beans = food("beans", "Frijoles", "LEGUMES", 0.5);
    const withRecipe = addRecipeToMenu(createDietMenu(distribution), distribution, breakfast, recipe(), 1, "base-recipe");
    const proposal = addFoodToMenu(withRecipe, distribution, breakfast, beans, 0.5, "extra-beans");
    const entries = activeMenu(proposal).meal_menus[0].entries;
    const items = expandMenuEntriesToRecipeItems(entries, [fruit, cereal, beans]);
    expect(items.map((item) => ({ id: item.food.id, amount: item.amount }))).toEqual([
      { id: "fruit", amount: 1 },
      { id: "cereal", amount: 2 },
      { id: "beans", amount: 0.5 },
    ]);

    const derived = { ...recipe(), id: "derived", items: items.map((item, index) => ({
      id: `derived-${index}`,
      owner_id: "owner",
      recipe_id: "derived",
      food_item_id: item.food.id,
      amount: item.amount,
      unit: item.food.portion_unit,
      display_order: index,
      food_snapshot: createFoodSnapshot(item.food),
      exchange_contribution: exchangeContributionForFood(item.food, item.amount),
      created_at: "",
    })) };
    const replaced = replaceMenuEntriesWithRecipe(proposal, distribution, breakfast, entries.map((entry) => entry.id), derived);
    expect(activeMenu(replaced).meal_menus[0].entries).toHaveLength(1);
    expect(activeMenu(replaced).meal_menus[0].entries[0]).toMatchObject({ type: "recipe", source_id: "derived" });
  });

  it("replaces proposed foods with a recipe while preserving exact menu usage", () => {
    const withFruit = addFoodToMenu(createDietMenu(distribution), distribution, breakfast, fruit, 1, "proposal-fruit");
    const withFoods = addFoodToMenu(withFruit, distribution, breakfast, cereal, 2, "proposal-cereal");
    const before = calculateMenuUsage(withFoods);
    const replaced = replaceFoodEntriesWithRecipe(withFoods, distribution, breakfast, ["proposal-fruit", "proposal-cereal"], recipe());
    expect(calculateMenuUsage(replaced)).toEqual(before);
    expect(activeMenu(replaced).meal_menus[0].entries).toHaveLength(1);
    expect(activeMenu(replaced).meal_menus[0].entries[0].type).toBe("recipe");
  });

  it("scores exact, partial and excessive recipe compatibility deterministically", () => {
    const required = distribution.distribution.map(({ group_code, portions }) => ({ group_code, portions }));
    expect(recipeCompatibilityScore(required, recipe()).label).toBe("Dentro de tolerancia");
    const partial = { ...recipe(), items: recipe().items.slice(0, 1) };
    expect(recipeCompatibilityScore(required, partial)).toMatchObject({ excess: 0, label: "Coincidencia parcial" });
    const excessive = { ...recipe(), items: [{ ...recipe().items[1], amount: 3, exchange_contribution: [{ group_code: "CEREALS_NO_FAT" as const, portions: 3 }] }] };
    expect(recipeCompatibilityScore(required, excessive).excess).toBe(1);
  });

  it("penalizes excess more than a comparable shortfall and rewards meal affinity", () => {
    const required = [{ group_code: "FRUITS" as const, portions: 1 }];
    const exact = { ...recipe(), meal_types: ["BREAKFAST" as const], items: recipe().items.slice(0, 1) };
    const excess = { ...exact, items: [{ ...exact.items[0], exchange_contribution: [{ group_code: "FRUITS" as const, portions: 2 }] }] };
    const partial = { ...exact, items: [{ ...exact.items[0], exchange_contribution: [{ group_code: "FRUITS" as const, portions: 0.5 }] }] };
    expect(scoreRecipeCompatibility({ pendingExchanges: required, recipe: partial, mealType: "BREAKFAST" }).score)
      .toBeGreaterThan(scoreRecipeCompatibility({ pendingExchanges: required, recipe: excess, mealType: "BREAKFAST" }).score);
    expect(scoreRecipeCompatibility({ pendingExchanges: required, recipe: exact, mealType: "BREAKFAST" }).score)
      .toBeGreaterThan(scoreRecipeCompatibility({ pendingExchanges: required, recipe: exact, mealType: "DINNER" }).score);
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
