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
  practicalFoodQuantity,
  scoreRecipeCompatibility,
  type RecipeCompatibilityRestriction,
} from "@/src/features/menu/model";
import { isDrink, menuSignature, recipeHasKnownContributions } from "./mesa";
import { preparationKey } from "./composition";
import type {
  DietMenu,
  DietMenuEntry,
  ExchangeGroupCode,
  FoodItem,
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
  algorithm: "deterministic-menu-planner-v4";
};

export const MENU_PLANNER_WEIGHTS = {
  repetition: 1,
  recipeAdjustment: 3,
  extraComponent: 1.25,
  duplicateGroup: 0,
  sameFamily: 0,
  impracticalQuantity: 2,
};

export const practicalQuantity = practicalFoodQuantity;

const familyByGroup: Partial<Record<ExchangeGroupCode, string>> = {
  CEREALS_NO_FAT: "cereals",
  CEREALS_WITH_FAT: "cereals",
  AOA_VERY_LOW_FAT: "aoa",
  AOA_LOW_FAT: "aoa",
  AOA_MODERATE_FAT: "aoa",
  AOA_HIGH_FAT: "aoa",
  MILK_SKIM: "milk",
  MILK_SEMI_SKIM: "milk",
  MILK_WHOLE: "milk",
  MILK_WITH_SUGAR: "milk",
  FATS_NO_PROTEIN: "fats",
  FATS_WITH_PROTEIN: "fats",
};

export function exchangeGroupFamily(groupCode: ExchangeGroupCode) {
  return familyByGroup[groupCode] ?? groupCode;
}

export function isFoodRestricted(food: Pick<FoodItem, "id" | "group_code" | "attributes">, restrictions: MenuPlanningRestrictions) {
  if (restrictions.excludedFoodIds?.includes(food.id)) return true;
  if (restrictions.excludedGroupCodes?.includes(food.group_code)) return true;
  const excludedAttributes = new Set(restrictions.excludedAttributes ?? []);
  return Object.entries(food.attributes ?? {}).some(([attribute, value]) => value === "contains" && excludedAttributes.has(attribute));
}

export function adjustRecipeToPending(recipe: Recipe, pending: Array<{ group_code: ExchangeGroupCode; portions: number }>) {
  const recipeGroups = new Map(recipeExchangeContributions(recipe).map((item) => [item.group_code, item.portions]));
  const pendingGroups = new Map(pending.map((item) => [item.group_code, item.portions]));
  const amounts: Record<string, number> = {};
  const factors = [...recipeGroups].map(([code, supplied]) => supplied > 0 ? (pendingGroups.get(code) ?? 0) / supplied : 1).sort((a,b) => a-b);
  // One bounded batch factor preserves ingredient ratios and recipe identity.
  const factor = Math.min(2, Math.max(0.5, factors[Math.floor(factors.length / 2)] ?? 1));
  for (const item of recipe.items) {
    amounts[item.id] = Number(item.amount) * factor;
  }

  return adjustRecipeIngredients(recipe, amounts);
}

export function recipeAdjustmentPenalty(original: Recipe, adjusted: Recipe) {
  return adjusted.items.reduce((penalty, item) => {
    const base = original.items.find((candidate) => candidate.id === item.id);
    if (!base || Number(base.amount) <= 0 || Number(item.amount) <= 0) return penalty;
    return penalty + Math.abs(Math.log(Number(item.amount) / Number(base.amount))) * MENU_PLANNER_WEIGHTS.recipeAdjustment;
  }, 0);
}

function duplicateGroupPenalty(recipe: Recipe) {
  const counts = new Map<ExchangeGroupCode, number>();
  for (const item of recipe.items) counts.set(item.food_snapshot.group_code, (counts.get(item.food_snapshot.group_code) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1) * MENU_PLANNER_WEIGHTS.duplicateGroup, 0);
}

function sameFamilyPenalty(recipe: Recipe) {
  const codesByFamily = new Map<string, Set<ExchangeGroupCode>>();
  for (const contribution of recipeExchangeContributions(recipe)) {
    const family = exchangeGroupFamily(contribution.group_code);
    const codes = codesByFamily.get(family) ?? new Set<ExchangeGroupCode>();
    codes.add(contribution.group_code);
    codesByFamily.set(family, codes);
  }
  return [...codesByFamily.values()].reduce((sum, codes) => sum + Math.max(0, codes.size - 1) * MENU_PLANNER_WEIGHTS.sameFamily, 0);
}

function impracticalQuantityPenalty(recipe: Recipe) {
  return recipe.items.reduce((sum, item) => {
    const practical = practicalQuantity(Number(item.amount), item.unit);
    const reference = Math.max(Number(item.amount), practical, 0.001);
    return sum + Math.abs(practical - Number(item.amount)) / reference * MENU_PLANNER_WEIGHTS.impracticalQuantity;
  }, 0);
}

function entriesForMeal(menu: DietMenu, mealTimeId: string) {
  return activeMenu(menu).meal_menus.find((meal) => meal.meal_time_id === mealTimeId)?.entries ?? [];
}

function clearMeal(menu: DietMenu, distribution: MealDistribution, mealTimeId: string, fixedEntryIds: string[]) {
  return entriesForMeal(menu, mealTimeId).filter(entry => !fixedEntryIds.includes(entry.id)).reduce(
    (next, entry) => removeMenuEntry(next, distribution, entry.id),
    menu,
  );
}

function pendingForMeal(menu: DietMenu, distribution: MealDistribution, mealTimeId: string) {
  return calculateMenuStatus(menu, distribution).rows
    .filter((row) => row.meal_time_id === mealTimeId && row.remaining > MENU_COMPARISON_TOLERANCE)
    .map((row) => ({ group_code: row.group_code, portions: row.remaining, used: row.used }))
    .sort((a, b) => Number(a.used > MENU_COMPARISON_TOLERANCE) - Number(b.used > MENU_COMPARISON_TOLERANCE));
}

function rankRecipes(
  recipes: Recipe[],
  pending: Array<{ group_code: ExchangeGroupCode; portions: number }>,
  mealType: MealDistribution["meal_times"][number]["meal_type"],
  restrictions: MenuPlanningRestrictions,
  usedRecipeIds: Set<string>,
) {
  return recipes
    .filter((recipe) => recipe.active && !isDrink(recipe) && recipeHasKnownContributions(recipe))
    .map((original) => {
      const recipe = adjustRecipeToPending(original, pending);
      const match = scoreRecipeCompatibility({ pendingExchanges: pending, recipe, mealType, restrictions });
      const repetitionPenalty = usedRecipeIds.has(original.id) ? MENU_PLANNER_WEIGHTS.repetition : 0;
      const adjustmentPenalty = recipeIngredientsChanged(original, recipe) ? recipeAdjustmentPenalty(original, recipe) : 0;
      const remainingComponents = match.missingGroups.length * MENU_PLANNER_WEIGHTS.extraComponent;
      const practicalityPenalty = duplicateGroupPenalty(recipe) + sameFamilyPenalty(recipe) + impracticalQuantityPenalty(recipe) + remainingComponents;
      const preference = recipe.items.reduce((sum,item) => sum + (restrictions.likedFoodIds?.includes(item.food_snapshot.id) ? 2 : 0) - (restrictions.avoidedFoodIds?.includes(item.food_snapshot.id) ? 3 : 0),0);
      return { original, recipe, match, score: match.score - repetitionPenalty - adjustmentPenalty - practicalityPenalty + preference };
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
  alternative: number,
) {
  const candidates = foods
    .filter((food) => food.active && food.group_code === groupCode && !isFoodRestricted(food, restrictions))
    .map((food) => {
      const quantity = practicalQuantity(neededPortions * Number(food.portion_amount), food.portion_unit);
      const supplied = quantity / Number(food.portion_amount);
      return { food, quantity, excess: Math.max(0, supplied - neededPortions), mismatch: Math.abs(supplied - neededPortions) };
    })
    .sort((a, b) => a.mismatch - b.mismatch
      || Number(restrictions.avoidedFoodIds?.includes(a.food.id) ?? false) - Number(restrictions.avoidedFoodIds?.includes(b.food.id) ?? false)
      || Number(restrictions.likedFoodIds?.includes(b.food.id) ?? false) - Number(restrictions.likedFoodIds?.includes(a.food.id) ?? false)
      || Number(usedFoodIds.has(a.food.id)) - Number(usedFoodIds.has(b.food.id))
      || Number(b.food.is_custom) - Number(a.food.is_custom)
      || b.food.use_count - a.food.use_count
      || a.food.name.localeCompare(b.food.name, "es-MX"));
  const comparable = candidates.filter(c => c.mismatch <= (candidates[0]?.mismatch ?? 0) + MENU_COMPARISON_TOLERANCE);
  return comparable[alternative % Math.max(1, comparable.length)];
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
  alternative: number,
): DietMenu {
  const meal = distribution.meal_times.find((item) => item.id === mealTimeId);
  if (!meal) return menu;
  let next = menu;
  let pending = pendingForMeal(next, distribution, mealTimeId);
  if (!pending.length) return next;

  const ranked = rankRecipes(recipes, pending, meal.meal_type, restrictions, usedRecipeIds);
  const viable = ranked.filter((candidate) => candidate.match.covered >= 1
    && candidate.match.excess <= 0.25
    && candidate.score > 0
    && candidate.match.label !== "Poco compatible");
  const comparable = viable.filter(candidate => candidate.score >= (viable[0]?.score ?? 0) - 5);
  const best = alternative % 4 === 3 ? undefined : comparable[alternative % Math.max(1, comparable.length)];

  if (best) {
    next = addRecipeToMenu(next, distribution, mealTimeId, best.recipe, 1, `proposal-recipe-${mealTimeId}-${entriesForMeal(next, mealTimeId).length}`);
    usedRecipeIds.add(best.original.id);
    for (const item of best.recipe.items) usedFoodIds.add(item.food_item_id ?? item.food_snapshot.id);
    pending = pendingForMeal(next, distribution, mealTimeId);
  }

  let remainingSeed = alternative;
  for (const missing of pending) {
    const selection = chooseFood(foods, missing.group_code, missing.portions, restrictions, usedFoodIds, remainingSeed);
    if (!selection) continue;
    const radix = Math.max(1, foods.filter(food=>food.active && food.group_code===missing.group_code && !isFoodRestricted(food,restrictions)).length);
    remainingSeed = Math.floor(remainingSeed / radix);
    next = addFoodToMenu(next, distribution, mealTimeId, selection.food, selection.quantity, `proposal-food-${mealTimeId}-${missing.group_code}-${entriesForMeal(next, mealTimeId).length}`);
    usedFoodIds.add(selection.food.id);
  }

  if (best) {
    const direct = proposeMeal(menu, distribution, mealTimeId, foods, [], restrictions, new Set(usedRecipeIds), new Set(usedFoodIds), alternative);
    const error = (value: DietMenu) => calculateMenuStatus(value, distribution).rows.filter(row => row.meal_time_id === mealTimeId).reduce((sum,row)=>sum+Math.abs(row.remaining),0);
    // Keep a recognizable preparation when the numerical difference is small.
    // Never hide an excess beyond the comparison tolerance.
    const hasExcess = calculateMenuStatus(next, distribution).rows.some(row => row.meal_time_id === mealTimeId && row.state === "excess");
    if (error(direct) + (hasExcess ? MENU_COMPARISON_TOLERANCE : 0.25) < error(next)) return direct;
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
  alternative = 0,
  fixedEntryIds = [],
  fixedMealIds = [],
  rejectedFoodIds = [],
  rejectedPreparations = [],
}: {
  menu: DietMenu;
  distribution: MealDistribution;
  foods: FoodItem[];
  recipes: Recipe[];
  mealTimeId?: string | null;
  mode?: MenuPlanningMode;
  restrictions?: MenuPlanningRestrictions;
  alternative?: number;
  fixedEntryIds?: string[];
  fixedMealIds?: string[];
  rejectedFoodIds?: string[];
  rejectedPreparations?: string[];
}): MenuProposal {
  const targets = distribution.meal_times
    .filter((meal) => !mealTimeId || meal.id === mealTimeId)
    .filter((meal) => !fixedMealIds.includes(meal.id))
    .sort((a, b) => a.display_order - b.display_order);
  let next = menu;
  if (mode === "replace") for (const meal of targets) next = clearMeal(next, distribution, meal.id, fixedEntryIds);

  const usedRecipeIds = new Set(activeMenu(next).meal_menus.flatMap((meal) => meal.entries.filter((entry) => entry.type === "recipe").map((entry) => entry.source_id)));
  const usedFoodIds = new Set(activeMenu(next).meal_menus.flatMap((meal) => meal.entries.flatMap((entry) => entry.type === "food" ? [entry.source_id] : entry.recipe_snapshot?.items.map((item) => item.food_snapshot.id) ?? [])));
  const beforeEntries = new Map(activeMenu(next).meal_menus.flatMap((meal) => meal.entries.map((entry) => [entry.id, JSON.stringify(entry)] as const)));

  const eligibleFoods = foods.filter(food => !rejectedFoodIds.includes(food.id));
  const eligibleRecipes = recipes.filter(recipe => !rejectedPreparations.includes(preparationKey(recipe)) && !recipe.items.some(item => rejectedFoodIds.includes(item.food_snapshot.id)));
  for (const meal of targets) next = proposeMeal(next, distribution, meal.id, eligibleFoods, eligibleRecipes, restrictions, usedRecipeIds, usedFoodIds, alternative);

  const status = calculateMenuStatus(next, distribution);
  const meals = targets.map((meal) => {
    const rows = status.rows.filter((row) => row.meal_time_id === meal.id);
    return {
      mealTimeId: meal.id,
      mealName: meal.display_name,
      addedEntries: entriesForMeal(next, meal.id).filter((entry) => beforeEntries.get(entry.id) !== JSON.stringify(entry)),
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
    algorithm: "deterministic-menu-planner-v4",
  };
}

export const MENU_ALTERNATIVE_EVALUATION_LIMIT = 96;
export function menuAlternatives(input: Parameters<typeof proposeDietMenu>[0]): MenuProposal[] {
  const seen = new Set([menuSignature(input.menu,input.mealTimeId)]);
  const results: MenuProposal[] = [];
  for (let alternative = 0; alternative < MENU_ALTERNATIVE_EVALUATION_LIMIT; alternative++) {
    const proposal = proposeDietMenu({ ...input, alternative });
    const key = menuSignature(proposal.menu,input.mealTimeId);
    if (!seen.has(key)) { results.push(proposal); seen.add(key); }
  }
  return results;
}
