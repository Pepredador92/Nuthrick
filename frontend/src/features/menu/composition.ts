import type { DietMenuEntry, Recipe } from "@/src/types/domain";

type Ingredients = NonNullable<DietMenuEntry["recipe_snapshot"]>["items"];
// Effective ingredient amounts, not recipe/row IDs or presentation names.
function ingredientsKey(items: Ingredients, factor: number, ratios = false) {
  const amounts = new Map<string, number>();
  for (const item of items) {
    const key = `${item.food_snapshot.id}:${item.unit}`;
    amounts.set(key, (amounts.get(key) ?? 0) + Number(item.amount) * factor / Number(item.food_snapshot.portion_amount));
  }
  const total = ratios ? [...amounts.values()].reduce((a, b) => a + b, 0) || 1 : 1;
  // 0.05 equivalent resolution avoids calling minute quantity changes a new meal.
  return [...amounts].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, Math.round(value / total * (ratios ? 1000 : 20))]);
}
export function preparationKey(recipe: Pick<Recipe, "items"> | NonNullable<DietMenuEntry["recipe_snapshot"]>) {
  return JSON.stringify(ingredientsKey(recipe.items, 1, true));
}
export function entryComposition(entry: DietMenuEntry) {
  if (entry.recipe_snapshot) return ["recipe", ingredientsKey(entry.recipe_snapshot.items, entry.quantity / entry.recipe_snapshot.servings)];
  return ["food", entry.food_snapshot?.id ?? entry.source_id, entry.unit, Math.round(entry.quantity / (Number(entry.food_snapshot?.portion_amount) || 1) * 20)];
}
