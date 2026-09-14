import {
  activeMenu,
  addFoodToMenu,
  addRecipeToMenu,
  adjustRecipeIngredients,
  calculateMenuStatus,
  MENU_COMPARISON_TOLERANCE,
  recipeExchangeContributions,
  recipeIngredientsChanged,
  removeMenuEntry,
  roundMenuNumber,
  scoreRecipeCompatibility,
  type RecipeCompatibilityRestriction,
} from "@/src/features/menu/model";
import type {
  DietMenu,
  DietMenuEntry,
  ExchangeGroupCode,
  FoodItem,
  FoodUnitCode,
  MealDistribution,
  Recipe,
} from "@/src/types/domain";

export type MenuPlanningMode = "complete" | "replace";
export type MenuPlanningRestrictions = RecipeCompatibilityRestriction;

export type MenuProposalMeal = {
  mealTimeId: string;
  mealName: string;
  addedEntries: DietMenuEntry[];
  pending: Array<{ group_code: ExchangeGroupCode; portions: number }>;
  excess: Array<{ group_code: ExchangeGroupCode; portions: number }>;
  complete: boolean;
};

export type MenuProposal = {
  menu: DietMenu;
  mode: MenuPlanningMode;
  mealTimeId: string | null;
  meals: MenuProposalMeal[];
  exact: boolean;
  algorithm: "deterministic-menu-planner-v1";
};

const practicalSteps: Record<FoodUnitCode, number> = {
  g: 10,
  ml: 10,
  piece: 0.5,
  cup: 0.25,
  tablespoon: 0.5,
  teaspoon: 0.5,
  slice: 0.5,
  tortilla: 0.5,
  glass: 0.5,
  serving: 0.5,
  unit: 0.5,
};

export function practicalQuantity(value: number, unit: FoodUnitCode, minimum = practicalSteps[unit]) {
  const step = practicalSteps[unit];
  const quantized = Math.round(value / step) * step;
  return roundMenuNumber(Math.max(minimum, quantized));
}

function isFoodRestricted(food: Pick<FoodItem, "id" | "group_code" | "attributes">, restrictions: MenuPlanningRestrictions) {
  if (restrictions.excludedFoodIds?.includes(food.id)) return true;
  if (restrictions.excludedGroupCodes?.includes(food.group_code)) return true;
  const excludedAttributes = new Set(restrictions.excludedAttributes ?? []);
  return Object.entries(food.attributes ?? {}).some(([attribute, value]) => value === "contains" && excludedAttributes.has(attribute));
}

export function adjustRecipeToPending(recipe: Recipe, pending: Array<{ group_code: ExchangeGroupCode; portions: number }>) {
  const recipeGroups = new Map(recipeExchangeContributions(recipe).map((item) => [item.group_code, item.portions]));
  const pendingGroups = new Map(pending.map((item) => [item.group_code, item.portions]));
  const amounts: Record<string, number> = {};

  for (const item of recipe.items) {
    const groupCode = item.food_snapshot.group_code;
    const available = pendingGroups.get(groupCode) ?? 0;
    const supplied = recipeGroups.get(groupCode) ?? 0;
    const desiredFactor = supplied > MENU_COMPARISON_TOLERANCE && available > MENU_COMPARISON_TOLERANCE
      ? available / supplied
      : 1;
    const boundedFactor = Math.min(2, Math.max(0.5, desiredFactor));
    amounts[item.id] = practicalQuantity(Number(item.amount) * boundedFactor, item.unit);
  }

  return adjustRecipeIngredients(recipe, amounts);
}

function entriesForMeal(menu: DietMenu, mealTimeId: string) {
  return activeMenu(menu).meal_menus.find((meal) => meal.meal_time_id === mealTimeId)?.entries ?? [];
}

function clearMeal(menu: DietMenu, distribution: MealDistribution, mealTimeId: string) {
  return entriesForMeal(menu, mealTimeId).reduce(
    (next, entry) => removeMenuEntry(next, distribution, entry.id),
    menu,
  );
}

function pendingForMeal(menu: DietMenu, distribution: MealDistribution, mealTimeId: string) {
  return calculateMenuStatus(menu, distribution).rows
    .filter((row) => row.meal_time_id === mealTimeId && row.remaining > MENU_COMPARISON_TOLERANCE)
    .map((row) => ({ group_code: row.group_code, portions: row.remaining }));
}

function rankRecipes(
  recipes: Recipe[],
  pending: Array<{ group_code: ExchangeGroupCode; portions: number }>,
  mealType: MealDistribution["meal_times"][number]["meal_type"],
  restrictions: MenuPlanningRestrictions,
  usedRecipeIds: Set<string>,
) {
  return recipes
    .filter((recipe) => recipe.active)
    .map((original) => {
      const recipe = adjustRecipeToPending(original, pending);
      const match = scoreRecipeCompatibility({ pendingExchanges: pending, recipe, mealType, restrictions });
      const repetitionPenalty = usedRecipeIds.has(original.id) ? 8 : 0;
      const adjustmentPenalty = recipeIngredientsChanged(original, recipe) ? 0.75 : 0;
      return { original, recipe, match, score: match.score - repetitionPenalty - adjustmentPenalty };
    })
    .filter((candidate) => !candidate.match.blocked)
    .sort((a, b) => b.score - a.score || a.original.name.localeCompare(b.original.name, "es-MX"));
}

function chooseFood(
  foods: FoodItem[],
  groupCode: ExchangeGroupCode,
  neededPortions: number,
  restrictions: MenuPlanningRestrictions,
  usedFoodIds: Set<string>,
) {
  return foods
    .filter((food) => food.active && food.group_code === groupCode && !isFoodRestricted(food, restrictions))
    .map((food) => {
      const quantity = practicalQuantity(neededPortions * Number(food.portion_amount), food.portion_unit);
      const supplied = quantity / Number(food.portion_amount);
      return { food, quantity, excess: Math.max(0, supplied - neededPortions), mismatch: Math.abs(supplied - neededPortions) };
    })
    .sort((a, b) => a.excess - b.excess
      || a.mismatch - b.mismatch
      || Number(usedFoodIds.has(a.food.id)) - Number(usedFoodIds.has(b.food.id))
      || Number(b.food.is_custom) - Number(a.food.is_custom)
      || b.food.use_count - a.food.use_count
      || a.food.name.localeCompare(b.food.name, "es-MX"))[0];
}

function proposeMeal(
  menu: DietMenu,
  distribution: MealDistribution,
  mealTimeId: string,
  foods: FoodItem[],
  recipes: Recipe[],
  restrictions: MenuPlanningRestrictions,
  usedRecipeIds: Set<string>,
  usedFoodIds: Set<string>,
) {
  const meal = distribution.meal_times.find((item) => item.id === mealTimeId);
  if (!meal) return menu;
  let next = menu;
  let pending = pendingForMeal(next, distribution, mealTimeId);
  if (!pending.length) return next;

  const ranked = rankRecipes(recipes, pending, meal.meal_type, restrictions, usedRecipeIds);
  const best = ranked.find((candidate) => candidate.match.covered >= 1
    && candidate.match.excess <= 0.25
    && candidate.score > 0
    && candidate.match.label !== "Poco compatible");

  if (best) {
    next = addRecipeToMenu(next, distribution, mealTimeId, best.recipe, 1, `proposal-recipe-${mealTimeId}`);
    usedRecipeIds.add(best.original.id);
    for (const item of best.recipe.items) usedFoodIds.add(item.food_item_id ?? item.food_snapshot.id);
    pending = pendingForMeal(next, distribution, mealTimeId);
  }

  for (const missing of pending) {
    const selection = chooseFood(foods, missing.group_code, missing.portions, restrictions, usedFoodIds);
    if (!selection) continue;
    next = addFoodToMenu(next, distribution, mealTimeId, selection.food, selection.quantity, `proposal-food-${mealTimeId}-${missing.group_code}`);
    usedFoodIds.add(selection.food.id);
  }

  return next;
}

export function proposeDietMenu({
  menu,
  distribution,
  foods,
  recipes,
  mealTimeId = null,
  mode = "complete",
  restrictions = {},
}: {
  menu: DietMenu;
  distribution: MealDistribution;
  foods: FoodItem[];
  recipes: Recipe[];
  mealTimeId?: string | null;
  mode?: MenuPlanningMode;
  restrictions?: MenuPlanningRestrictions;
}): MenuProposal {
  const targets = distribution.meal_times
    .filter((meal) => !mealTimeId || meal.id === mealTimeId)
    .sort((a, b) => a.display_order - b.display_order);
  let next = menu;
  if (mode === "replace") for (const meal of targets) next = clearMeal(next, distribution, meal.id);

  const usedRecipeIds = new Set(activeMenu(next).meal_menus.flatMap((meal) => meal.entries.filter((entry) => entry.type === "recipe").map((entry) => entry.source_id)));
  const usedFoodIds = new Set(activeMenu(next).meal_menus.flatMap((meal) => meal.entries.flatMap((entry) => entry.type === "food" ? [entry.source_id] : entry.recipe_snapshot?.items.map((item) => item.food_snapshot.id) ?? [])));
  const beforeIds = new Set(activeMenu(next).meal_menus.flatMap((meal) => meal.entries.map((entry) => entry.id)));

  for (const meal of targets) next = proposeMeal(next, distribution, meal.id, foods, recipes, restrictions, usedRecipeIds, usedFoodIds);

  const status = calculateMenuStatus(next, distribution);
  const meals = targets.map((meal) => {
    const rows = status.rows.filter((row) => row.meal_time_id === meal.id);
    return {
      mealTimeId: meal.id,
      mealName: meal.display_name,
      addedEntries: entriesForMeal(next, meal.id).filter((entry) => !beforeIds.has(entry.id)),
      pending: rows.filter((row) => row.remaining > MENU_COMPARISON_TOLERANCE).map((row) => ({ group_code: row.group_code, portions: row.remaining })),
      excess: rows.filter((row) => row.remaining < -MENU_COMPARISON_TOLERANCE).map((row) => ({ group_code: row.group_code, portions: -row.remaining })),
      complete: rows.length > 0 && rows.every((row) => row.state === "complete"),
    };
  });

  return {
    menu: next,
    mode,
    mealTimeId,
    meals,
    exact: meals.every((meal) => meal.complete),
    algorithm: "deterministic-menu-planner-v1",
  };
}
