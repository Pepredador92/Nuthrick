/** Shared deterministic boundary. Bundled for Edge Functions by the checked-in
 * build script; do not implement separate clinical arithmetic in the AI service. */
import { exchangeCatalog } from '../exchanges/catalog';
import { applyExchangeSuggestion, createExchangePrescription } from '../exchanges/model';
import { applyMealDistributionSuggestion, calculateDistributionStatus, createMealDistribution } from '../meal-distribution/model';
import { activeMenu, calculateMenuStatus, createDietMenu, createFoodSnapshot, exchangeContributionForFood } from '../menu/model';
import { isFoodRestricted, proposeDietMenu } from '../menu/planner';
import { menuRestrictions, menuSignature } from '../menu/mesa';
import { exchangeAlternatives, mealAlternatives } from './proposals';
import type { FoodItem, NutritionPlan, Recipe } from '../../types/domain';

export function workshopTargets(plan: NutritionPlan) {
  const m = plan.macro_distribution?.macros;
  const t = { energy_kcal: plan.target_calories ?? 0, carbohydrate_g: m?.CARBOHYDRATE?.grams ?? -1, protein_g: m?.PROTEIN?.grams ?? -1, fat_g: m?.FAT?.grams ?? -1 };
  if (!Object.values(t).every(n => Number.isFinite(n) && n > 0)) throw new Error('targets_required');
  return t;
}
export function buildWorkshopOptions(plan: NutritionPlan, rawFoods: FoodItem[], rawRecipes: Recipe[], rejectedFoodIds: string[] = [], rejectedSignatures: string[] = []) {
  const targets = workshopTargets(plan);
  const distribution = plan.meal_distribution ?? createMealDistribution();
  const restrictions = plan.diet_menu ? menuRestrictions(plan.diet_menu) : {};
  const validCodes = new Set(exchangeCatalog.map(g => g.groupCode));
  const foods = rawFoods.filter(f => f.active && validCodes.has(f.group_code) && f.portion_amount > 0 && !rejectedFoodIds.includes(f.id) && !isFoodRestricted(f, restrictions));
  // Rehydrate recipe ingredients against current real food rows. Never trust an
  // old embedded nutrient contribution or a model-invented food entity.
  const recipes = rawRecipes.filter(r => r.active && r.items?.length && r.items.every(i => foods.some(f => f.id === i.food_item_id && f.portion_unit === i.unit) && i.amount > 0)).map(r => ({ ...r, items: r.items.map(i => {
    const f = foods.find(f => f.id === i.food_item_id)!;
    return { ...i, food_snapshot: createFoodSnapshot(f), exchange_contribution: exchangeContributionForFood(f, i.amount) };
  }) }));
  const groupPreferences = Object.fromEntries(exchangeCatalog.filter(g => !foods.some(f => f.group_code === g.groupCode)).map(g => [g.groupCode, 'exclude' as const]));
  const inventory = exchangeAlternatives({ targets, options: { groupPreferences } }, { foods, recipes }, distribution);
  const options: Array<{ exchange_prescription: NonNullable<NutritionPlan['exchange_prescription']>; meal_distribution: NonNullable<NutritionPlan['meal_distribution']>; diet_menu: NonNullable<NutritionPlan['diet_menu']>; signature: string }> = [];
  for (const exchange of inventory.slice(0, 3)) {
    const prescription = applyExchangeSuggestion(createExchangePrescription(targets), targets, exchange);
    for (const meal of mealAlternatives(distribution, prescription, [], false, { foods, recipes }).slice(0, 3)) {
      const meals = applyMealDistributionSuggestion(distribution, meal);
      if (!calculateDistributionStatus(meals.distribution, prescription).canConfirm) continue;
      const proposal = proposeDietMenu({ menu: createDietMenu(meals), distribution: meals, foods, recipes, restrictions, mode: 'replace', rejectedFoodIds, alternative: rejectedSignatures.length });
      if (!proposal.exact || !calculateMenuStatus(proposal.menu, meals).canConfirm) continue;
      const signature = menuSignature(proposal.menu);
      if (rejectedSignatures.includes(signature) || options.some(o => o.signature === signature)) continue;
      options.push({ exchange_prescription: prescription, meal_distribution: meals, diet_menu: { ...proposal.menu, food_preferences: plan.diet_menu?.food_preferences }, signature });
      if (options.length === 3) return options;
    }
  }
  return options;
}
export function compactWorkshopOption(option: ReturnType<typeof buildWorkshopOptions>[number], index: number) {
  return { option: index, exchanges: option.exchange_prescription.groups.filter(g => g.portions > 0),
    totals: option.exchange_prescription.derived_totals,
    meals: activeMenu(option.diet_menu).meal_menus.map(m => ({ name: option.meal_distribution.meal_times.find(t => t.id === m.meal_time_id)?.display_name,
      foods: m.entries.map(e => ({ name: e.name_snapshot, quantity: e.quantity, unit: e.unit })) })) };
}
