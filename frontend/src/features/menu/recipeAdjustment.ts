import type { DietMenu, MealDistribution, Recipe } from "@/src/types/domain";
import { addRecipeToMenu, adjustRecipeIngredients, calculateMenuStatus, MENU_COMPARISON_TOLERANCE, practicalFoodQuantity, roundMenuNumber } from "./model";

type MealRows = ReturnType<typeof calculateMenuStatus>["rows"];

export type RecipeAdjustment = {
  recipe: Recipe;
  changes: Array<{ itemId: string; name: string; from: number; to: number; unit: Recipe["items"][number]["unit"] }>;
  outcomeRows: MealRows;
};

const EPSILON = 1e-6;

function mealRows(menu: DietMenu, distribution: MealDistribution, mealId: string, recipe: Recipe): MealRows | null {
  const projected = addRecipeToMenu(menu, distribution, mealId, recipe, 1, "recipe-adjustment-preview");
  if (projected === menu) return null;
  return calculateMenuStatus(projected, distribution).rows.filter(row => row.meal_time_id === mealId);
}

function missing(rows: MealRows) {
  return roundMenuNumber(rows.reduce((sum, row) => sum + Math.max(0, row.remaining), 0));
}

function worsensExcess(before: MealRows, after: MealRows) {
  return after.some(row => {
    const previous = before.find(candidate => candidate.group_code === row.group_code);
    const oldExcess = Math.max(0, -(previous?.remaining ?? 0));
    const newExcess = Math.max(0, -row.remaining);
    return newExcess > Math.max(MENU_COMPARISON_TOLERANCE, oldExcess) + EPSILON;
  });
}

/** Pure menu-local suggestion. Unsupported or inconsistent ingredient snapshots are never guessed. */
export function suggestRecipeAdjustment(menu: DietMenu, distribution: MealDistribution, mealId: string, recipe: Recipe): RecipeAdjustment | null {
  if (!Number.isFinite(recipe.servings) || recipe.servings <= 0 || !recipe.items.length) return null;
  const ids = new Set(recipe.items.map(item => item.id));
  if (ids.size !== recipe.items.length || recipe.items.some(item => {
    const portion = Number(item.food_snapshot.portion_amount);
    const contribution = item.exchange_contribution;
    return !Number.isFinite(item.amount) || item.amount <= 0 || !Number.isFinite(portion) || portion <= 0
      || item.unit !== item.food_snapshot.portion_unit || contribution.length !== 1
      || contribution[0].group_code !== item.food_snapshot.group_code
      || Math.abs(contribution[0].portions - item.amount / portion) > 0.0001;
  })) return null;

  const initialRows = mealRows(menu, distribution, mealId, recipe);
  if (!initialRows || missing(initialRows) <= MENU_COMPARISON_TOLERANCE) return null;
  let current = recipe;
  let currentRows = initialRows;
  const changes = new Map<string, RecipeAdjustment["changes"][number]>();

  // Each iteration must improve the full meal vector. At most one change per existing ingredient.
  for (let iteration = 0; iteration < recipe.items.length; iteration++) {
    let best: { recipe: Recipe; rows: MealRows; itemId: string; amount: number; improvement: number; delta: number } | null = null;
    for (const item of current.items) {
      if (changes.has(item.id)) continue;
      const row = currentRows.find(candidate => candidate.group_code === item.food_snapshot.group_code);
      if (!row || row.remaining <= MENU_COMPARISON_TOLERANCE) continue;
      const portion = Number(item.food_snapshot.portion_amount);
      const outstandingBatchEquivalents = row.remaining * recipe.servings;
      // Half-equivalents and the exact shortfall are already representable by the menu model.
      const deltas = new Set<number>([outstandingBatchEquivalents]);
      for (let half = 0.5; half < outstandingBatchEquivalents; half += 0.5) deltas.add(half);
      for (const deltaEquivalents of deltas) {
        const amount = practicalFoodQuantity(item.amount + deltaEquivalents * portion, item.unit);
        if (!Number.isFinite(amount) || amount <= item.amount + EPSILON) continue;
        const candidate = adjustRecipeIngredients(current, { [item.id]: amount });
        const rows = mealRows(menu, distribution, mealId, candidate);
        if (!rows || worsensExcess(initialRows, rows)) continue;
        const improvement = roundMenuNumber(missing(currentRows) - missing(rows));
        if (improvement <= MENU_COMPARISON_TOLERANCE) continue;
        const normalizedDelta = roundMenuNumber((amount - item.amount) / portion);
        if (!best || improvement > best.improvement + EPSILON
          || (Math.abs(improvement - best.improvement) <= EPSILON && normalizedDelta < best.delta - EPSILON)
          || (Math.abs(improvement - best.improvement) <= EPSILON && Math.abs(normalizedDelta - best.delta) <= EPSILON && item.id < best.itemId)) {
          best = { recipe: candidate, rows, itemId: item.id, amount, improvement, delta: normalizedDelta };
        }
      }
    }
    if (!best) break;
    const original = recipe.items.find(item => item.id === best.itemId)!;
    changes.set(best.itemId, { itemId: best.itemId, name: original.food_snapshot.name, from: original.amount, to: best.amount, unit: original.unit });
    current = best.recipe;
    currentRows = best.rows;
  }

  return changes.size ? {
    recipe: current,
    changes: recipe.items.flatMap(item => changes.get(item.id) ? [changes.get(item.id)!] : []),
    outcomeRows: currentRows,
  } : null;
}
