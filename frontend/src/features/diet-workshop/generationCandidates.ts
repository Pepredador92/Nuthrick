/** Pure shared domain. No provider, database or browser dependency. */
import { EXCHANGE_CATALOG_VERSION, EXCHANGE_SYSTEM_CODE, exchangeCatalog } from '../exchanges/catalog';
import { calculateExchangeTotals } from '../exchanges/model';
import { EXCHANGE_SUGGESTION_INCREMENT } from '../exchanges/suggestion';
import { createFoodSnapshot, exchangeContributionForFood, recipeExchangeContributions, type RecipeCompatibilityRestriction } from '../menu/model';
import { preparationKey } from '../menu/composition';
import { foodUnitLabels, normalizeCatalogPortion } from '../menu/units';
import type { DietGenerationContext } from './generationContext';
import type { ExchangeDerivedTotals, ExchangePrescription, FoodItem, Recipe } from '../../types/domain';

/** Technical limits, NOT clinical tolerances or portion recommendations. */
export const DIET_GENERATION_LIMITS = Object.freeze({ foodsPerMeal: 12, recipesPerMeal: 6, maxMeals: 12,
  maxEntriesPerMeal: 18, maxMultiplier: 8, multiplierIncrement: EXCHANGE_SUGGESTION_INCREMENT,
  maxResponseCharacters: 24_000, maxPayloadBytes: 20_000, textLimit: 1200 });
export type CandidateLimits = { foodsPerMeal: number; recipesPerMeal: number };
export type Catalog = { foods: FoodItem[]; recipes: Recipe[] };
export type Candidate = {
  key: string; type: 'food' | 'recipe'; sourceId: string; name: string;
  unit: FoodItem['portion_unit'] | 'recipe_serving'; baseQuantity: number;
  multipliers: number[]; exchanges: ExchangePrescription['groups']; nutrition: ExchangeDerivedTotals;
  food?: FoodItem; recipe?: Recipe; rank: number; diversityKey: string;
};
export type MealCandidates = { mealTimeId: string; candidates: Candidate[] };
export const dietServingMultipliers = () => Array.from({ length: DIET_GENERATION_LIMITS.maxMultiplier / DIET_GENERATION_LIMITS.multiplierIncrement }, (_, i) => (i + 1) * DIET_GENERATION_LIMITS.multiplierIncrement);
const groups = new Set<string>(exchangeCatalog.map(g => g.groupCode));
const nutrients = ['energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g'] as const;
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const canonicalName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function hardFoodAllowed(food: FoodItem, owner: string, rules: RecipeCompatibilityRestriction): boolean {
  return food.active === true && (food.owner_id === null || food.owner_id === owner)
    && Boolean(food.id && food.name?.trim()) && positive(food.portion_amount)
    && food.portion_unit !== ('recipe_serving' as string) && Object.hasOwn(foodUnitLabels, food.portion_unit)
    && food.exchange_system_code === EXCHANGE_SYSTEM_CODE && food.exchange_catalog_version === EXCHANGE_CATALOG_VERSION
    && groups.has(food.group_code)
    // Null direct nutrients are normal: current Workshop authority is SMAE averages.
    && nutrients.every(k => food[k] == null || (typeof food[k] === 'number' && Number.isFinite(food[k]) && food[k]! >= 0))
    && !rules.excludedFoodIds?.includes(food.id) && !rules.excludedGroupCodes?.includes(food.group_code)
    // Unknown/missing allergen attributes do NOT prove freedom from an allergen.
    && (rules.excludedAttributes ?? []).every(a => food.attributes?.[a as keyof FoodItem['attributes']] === 'free');
}
export function contextRestrictions(context: DietGenerationContext, rules: RecipeCompatibilityRestriction): RecipeCompatibilityRestriction {
  return {
    excludedFoodIds: [...new Set([...context.restrictions.excluded_food_ids, ...rules.excludedFoodIds ?? []])],
    excludedGroupCodes: [...rules.excludedGroupCodes ?? []], excludedAttributes: [...rules.excludedAttributes ?? []],
    likedFoodIds: [...new Set([...context.preferences.catalog.filter(p => p.preference === 'like').map(p => p.food_id), ...rules.likedFoodIds ?? []])],
    avoidedFoodIds: [...new Set([...context.preferences.catalog.filter(p => p.preference === 'avoid').map(p => p.food_id), ...rules.avoidedFoodIds ?? []])],
  };
}
function diverse(rows: Candidate[], maximum: number): Candidate[] {
  const unique = new Map<string, Candidate>();
  for (const row of rows.sort((a,b) => b.rank - a.rank || a.key.localeCompare(b.key))) if (!unique.has(row.diversityKey)) unique.set(row.diversityKey, row);
  const buckets = new Map<string, Candidate[]>();
  for (const row of unique.values()) {
    const key = row.exchanges.map(g => g.group_code).sort().join('|');
    buckets.set(key, [...buckets.get(key) ?? [], row]);
  }
  const result: Candidate[] = [];
  // Round-robin group composition, preserving transparent preference order within it.
  while (result.length < maximum && [...buckets.values()].some(b => b.length))
    for (const bucket of buckets.values()) if (bucket.length && result.length < maximum) result.push(bucket.shift()!);
  return result;
}
export function selectDietCandidates(context: DietGenerationContext, mealTimeId: string, catalog: Catalog, owner: string,
  explicitRules: RecipeCompatibilityRestriction = {}, limits: CandidateLimits = DIET_GENERATION_LIMITS): MealCandidates {
  if (![limits.foodsPerMeal, limits.recipesPerMeal].every(n => Number.isInteger(n) && n >= 0 && n <= 100)) throw Error('invalid_candidate_limits');
  const meal = context.meals.fact.state === 'known' ? context.meals.fact.value.find(m => m.id === mealTimeId) : undefined;
  const required = context.meal_distribution.fact.state === 'known' ? context.meal_distribution.fact.value.exchanges.filter(c => c.meal_time_id === mealTimeId && c.portions > 0) : [];
  if (context.restrictions.reaction_status.fact.state !== 'known' || context.restrictions.reaction_status.fact.value !== 'No'
    || context.restrictions.reactions.fact.state === 'known'
    || (context.restrictions.reactions.fact.state === 'unavailable' && context.restrictions.reactions.fact.reason === 'invalid')) return { mealTimeId, candidates: [] };
  if (!meal || !required.length) return { mealTimeId, candidates: [] };
  const rules = contextRestrictions(context, explicitRules);
  const preferred = (ids: string[]) => ids.some(id => rules.avoidedFoodIds?.includes(id)) ? -1 : ids.some(id => rules.likedFoodIds?.includes(id)) ? 1 : 0;
  const duplicateIds = (rows: {id: string}[]) => new Set(rows.filter((r,i) => rows.findIndex(x => x.id === r.id) !== i).map(r => r.id));
  const duplicatedFoods = duplicateIds(catalog.foods), duplicatedRecipes = duplicateIds(catalog.recipes);
  const foods = catalog.foods.filter(f => !duplicatedFoods.has(f.id)).map(normalizeCatalogPortion).filter(f => hardFoodAllowed(f, owner, rules));
  const byId = new Map(foods.map(f => [f.id, f]));
  const usable = (exchanges: Candidate['exchanges']) => exchanges.length > 0 && exchanges.every(e => positive(e.portions) && required.some(r => r.group_code === e.group_code));
  const multipliers = dietServingMultipliers();
  const foodCandidates: Candidate[] = foods.filter(f => required.some(r => r.group_code === f.group_code)).map(f => {
    const exchanges = exchangeContributionForFood(f, f.portion_amount);
    return { key: `food:${f.id}`, type: 'food', sourceId: f.id, name: f.name, unit: f.portion_unit,
      baseQuantity: f.portion_amount, multipliers, exchanges, nutrition: calculateExchangeTotals(exchanges), food: f,
      rank: preferred([f.id]), diversityKey: `food:${canonicalName(f.normalized_name || f.name)}:${f.group_code}` };
  });
  const recipeCandidates: Candidate[] = [];
  for (const row of catalog.recipes) {
    if (duplicatedRecipes.has(row.id) || !row.active || !(row.owner_id === null || row.owner_id === owner)
      || !row.id || !row.name?.trim() || !positive(row.servings) || !row.items.length
      || (row.meal_types.length > 0 && !row.meal_types.includes(meal.meal_type))
      || row.items.some(i => !positive(i.amount) || !byId.has(i.food_item_id ?? '') || byId.get(i.food_item_id!)!.portion_unit !== i.unit)) continue;
    // Rehydrate all ingredients: persisted snapshots/model totals are never authority.
    const recipe: Recipe = { ...row, items: row.items.map(i => ({ ...i, food_snapshot: createFoodSnapshot(byId.get(i.food_item_id!)!), exchange_contribution: exchangeContributionForFood(byId.get(i.food_item_id!)!, i.amount) })) };
    const exchanges = recipeExchangeContributions(recipe);
    if (!usable(exchanges) || Object.values(calculateExchangeTotals(exchanges)).some(v => !Number.isFinite(v) || v < 0)) continue;
    recipeCandidates.push({ key: `recipe:${row.id}`, type: 'recipe', sourceId: row.id, name: row.name,
      unit: 'recipe_serving', baseQuantity: 1, multipliers, exchanges, nutrition: calculateExchangeTotals(exchanges), recipe,
      rank: preferred(row.items.map(i => i.food_item_id!)), diversityKey: `recipe:${preparationKey(recipe)}` });
  }
  return { mealTimeId, candidates: [...diverse(foodCandidates, limits.foodsPerMeal), ...diverse(recipeCandidates, limits.recipesPerMeal)] };
}
