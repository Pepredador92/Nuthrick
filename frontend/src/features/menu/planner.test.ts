import { describe, expect, it } from "vitest";
import { activeMenu, addFoodToMenu, calculateMenuStatus, createDietMenu, createFoodSnapshot, exchangeContributionForFood } from "@/src/features/menu/model";
import { practicalQuantity, proposeDietMenu } from "@/src/features/menu/planner";
import type { ExchangeGroupCode, FoodItem, FoodUnitCode, MealDistribution, MealType, Recipe } from "@/src/types/domain";

const food = (id: string, name: string, group_code: ExchangeGroupCode, portion_amount = 1, portion_unit: FoodUnitCode = "piece", attributes: FoodItem["attributes"] = {}): FoodItem => ({
  id, owner_id: null, stable_code: id, catalog_code: "TEST", name, normalized_name: name.toLowerCase(), aliases: [], brand: null, category: null,
  exchange_system_code: "SMAE_NOM037_2012", exchange_catalog_version: "1.0.0", group_code, portion_amount, portion_unit,
  portion_description: `${portion_amount} ${portion_unit}`, alternate_portions: [], edible_grams: null, energy_kcal: null, carbohydrate_g: null,
  protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null, attributes, source: "TEST", source_version: "1", source_reference: "fixture",
  is_custom: false, use_count: 0, active: true, created_at: "", updated_at: "",
});

const recipe = (id: string, name: string, meal_types: MealType[], items: Array<{ food: FoodItem; amount: number }>): Recipe => ({
  id, owner_id: null, stable_code: id, name, normalized_name: name.toLowerCase(), description: null, meal_types, servings: 1, instructions: null,
  image_path: null, tags: [], substitution_notes: null, source: "TEST", source_version: "1", source_reference: "fixture", is_custom: false,
  active: true, created_at: "", updated_at: "", items: items.map((item, index) => ({
    id: `${id}-${index}`, owner_id: null, recipe_id: id, food_item_id: item.food.id, amount: item.amount, unit: item.food.portion_unit,
    display_order: index, food_snapshot: createFoodSnapshot(item.food), exchange_contribution: exchangeContributionForFood(item.food, item.amount), created_at: "",
  })),
});

const cereal = food("cereal", "Tortilla", "CEREALS_NO_FAT", 1, "tortilla");
const fruit = food("fruit", "Papaya", "FRUITS", 1, "cup");
const chicken = food("chicken", "Pollo", "AOA_VERY_LOW_FAT", 30, "g");
const oil = food("oil", "Aceite", "FATS_NO_PROTEIN", 1, "teaspoon");
const breakfastRecipe = recipe("breakfast-recipe", "Tortillas para desayuno", ["BREAKFAST"], [{ food: cereal, amount: 1 }]);
const lunchRecipe = recipe("lunch-recipe", "Pollo con tortilla", ["MAIN_MEAL"], [{ food: chicken, amount: 60 }, { food: cereal, amount: 1 }]);

const distribution: MealDistribution = {
  schema_version: 1,
  source_exchange_snapshot: null,
  meal_times: [
    { id: "breakfast", meal_type: "BREAKFAST", display_name: "Desayuno", time: "08:00", display_order: 0 },
    { id: "lunch", meal_type: "MAIN_MEAL", display_name: "Comida", time: "14:00", display_order: 1 },
    { id: "dinner", meal_type: "DINNER", display_name: "Cena", time: "20:00", display_order: 2 },
  ],
  distribution: [
    { meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT", portions: 2 },
    { meal_time_id: "breakfast", group_code: "FRUITS", portions: 1 },
    { meal_time_id: "lunch", group_code: "CEREALS_NO_FAT", portions: 1 },
    { meal_time_id: "lunch", group_code: "AOA_VERY_LOW_FAT", portions: 2 },
    { meal_time_id: "dinner", group_code: "FATS_NO_PROTEIN", portions: 1 },
  ],
  derived_meal_totals: [], status: "ready", confirmed_at: "", updated_at: "",
};

const entrySignature = (proposal: ReturnType<typeof proposeDietMenu>) => activeMenu(proposal.menu).meal_menus.map((meal) => ({
  meal: meal.meal_time_id,
  entries: meal.entries.map((entry) => ({ name: entry.name_snapshot, quantity: entry.quantity, exchanges: entry.exchange_contributions })),
}));

describe("deterministic menu planner", () => {
  it("uses practical increments for household and gram units", () => {
    expect(practicalQuantity(47, "g")).toBe(50);
    expect(practicalQuantity(0.63, "cup")).toBe(0.75);
    expect(practicalQuantity(0.13, "tortilla")).toBe(0.5);
  });

  it("builds breakfast, lunch and dinner with recipes first and foods as completion", () => {
    const proposal = proposeDietMenu({ menu: createDietMenu(distribution), distribution, foods: [cereal, fruit, chicken, oil], recipes: [breakfastRecipe, lunchRecipe] });
    expect(proposal.meals).toHaveLength(3);
    expect(proposal.exact).toBe(true);
    expect(activeMenu(proposal.menu).meal_menus.find((meal) => meal.meal_time_id === "breakfast")?.entries.map((entry) => entry.type)).toEqual(["recipe", "food"]);
    expect(calculateMenuStatus(proposal.menu, distribution).canConfirm).toBe(true);
  });

  it("returns the same practical menu for the same input", () => {
    const input = { menu: createDietMenu(distribution, () => "menu"), distribution, foods: [cereal, fruit, chicken, oil], recipes: [breakfastRecipe, lunchRecipe] };
    expect(entrySignature(proposeDietMenu(input))).toEqual(entrySignature(proposeDietMenu(input)));
  });

  it("can propose only one time", () => {
    const proposal = proposeDietMenu({ menu: createDietMenu(distribution), distribution, foods: [cereal, fruit], recipes: [breakfastRecipe], mealTimeId: "breakfast" });
    expect(proposal.meals.map((meal) => meal.mealTimeId)).toEqual(["breakfast"]);
    expect(activeMenu(proposal.menu).meal_menus.find((meal) => meal.meal_time_id === "lunch")?.entries).toEqual([]);
  });

  it("completes pending exchanges without deleting manual work", () => {
    const base = addFoodToMenu(createDietMenu(distribution), distribution, "breakfast", cereal, 1, "manual");
    const proposal = proposeDietMenu({ menu: base, distribution, foods: [cereal, fruit], recipes: [], mealTimeId: "breakfast" });
    expect(activeMenu(proposal.menu).meal_menus[0].entries.some((entry) => entry.id === "manual")).toBe(true);
    expect(proposal.meals[0].complete).toBe(true);
  });

  it("rebuilds only the selected time when explicitly requested", () => {
    const base = addFoodToMenu(createDietMenu(distribution), distribution, "breakfast", cereal, 1, "manual");
    const proposal = proposeDietMenu({ menu: base, distribution, foods: [cereal, fruit], recipes: [], mealTimeId: "breakfast", mode: "replace" });
    expect(activeMenu(proposal.menu).meal_menus[0].entries.some((entry) => entry.id === "manual")).toBe(false);
  });

  it("respects structured food and attribute exclusions", () => {
    const peanut = food("peanut", "Crema de cacahuate", "FATS_NO_PROTEIN", 1, "teaspoon", { peanut: "contains" });
    const proposal = proposeDietMenu({
      menu: createDietMenu(distribution), distribution, foods: [cereal, fruit, chicken, peanut], recipes: [breakfastRecipe, lunchRecipe], mealTimeId: "dinner",
      restrictions: { excludedAttributes: ["peanut"] },
    });
    expect(proposal.meals[0].pending).toEqual([{ group_code: "FATS_NO_PROTEIN", portions: 1 }]);
  });

  it("uses an exact practical food instead of an alternative that would exceed", () => {
    const awkwardFruit = food("awkward-fruit", "Fruta de porción incómoda", "FRUITS", 0.67, "cup");
    const proposal = proposeDietMenu({
      menu: createDietMenu(distribution), distribution, foods: [awkwardFruit, fruit], recipes: [], mealTimeId: "breakfast",
    });
    const fruitEntry = activeMenu(proposal.menu).meal_menus[0].entries.find((entry) => entry.exchange_contributions.some((item) => item.group_code === "FRUITS"));
    expect(fruitEntry?.source_id).toBe("fruit");
    expect(proposal.meals[0].excess).toEqual([]);
  });

  it("does not force a poorly compatible recipe when foods cover the time", () => {
    const incompatible = recipe("oil-recipe", "Aceite solo", ["BREAKFAST"], [{ food: oil, amount: 2 }]);
    const proposal = proposeDietMenu({
      menu: createDietMenu(distribution), distribution, foods: [cereal, fruit], recipes: [incompatible], mealTimeId: "breakfast",
    });
    expect(activeMenu(proposal.menu).meal_menus[0].entries.every((entry) => entry.type === "food")).toBe(true);
    expect(proposal.meals[0].complete).toBe(true);
  });

  it("reports a partial proposal when the catalog cannot cover a group", () => {
    const proposal = proposeDietMenu({ menu: createDietMenu(distribution), distribution, foods: [cereal], recipes: [], mealTimeId: "dinner" });
    expect(proposal.exact).toBe(false);
    expect(proposal.meals[0]).toMatchObject({ complete: false, pending: [{ group_code: "FATS_NO_PROTEIN", portions: 1 }] });
  });

  it("penalizes recipe repetition when an equally useful alternative exists", () => {
    const alternative = recipe("alternative", "Otra tortilla", ["BREAKFAST", "MAIN_MEAL"], [{ food: cereal, amount: 1 }]);
    const repeatedDistribution = { ...distribution, distribution: [
      { meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT" as const, portions: 1 },
      { meal_time_id: "lunch", group_code: "CEREALS_NO_FAT" as const, portions: 1 },
    ] };
    const proposal = proposeDietMenu({ menu: createDietMenu(repeatedDistribution), distribution: repeatedDistribution, foods: [cereal], recipes: [breakfastRecipe, alternative] });
    const usedRecipes = activeMenu(proposal.menu).meal_menus.flatMap((meal) => meal.entries.filter((entry) => entry.type === "recipe").map((entry) => entry.source_id));
    expect(new Set(usedRecipes).size).toBe(2);
  });

  it("does not mutate global recipe definitions while adjusting a proposal", () => {
    const originalAmount = breakfastRecipe.items[0].amount;
    proposeDietMenu({ menu: createDietMenu(distribution), distribution, foods: [cereal, fruit], recipes: [breakfastRecipe], mealTimeId: "breakfast" });
    expect(breakfastRecipe.items[0].amount).toBe(originalAmount);
  });
});
