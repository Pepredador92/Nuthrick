/** Synthetic fixtures for offline tests only. Never imported by production UI. */
import type { FoodItem, NutritionPlan, Recipe } from '../../types/domain';
import type { GenerationInput, DietGenerationPayload } from './generationBoundary';
import type { DietModelOutput } from './generationSchema';
import { EXCHANGE_CATALOG_VERSION, EXCHANGE_SYSTEM_CODE } from '../exchanges/catalog';
import { createMacroDistribution, patchMacroInput } from '../macros/model';
import { createExchangePrescription, confirmExchangePrescription, setExchangePortions } from '../exchanges/model';
import { createMealDistribution, createMealTime, confirmMealDistribution, setDistributedPortions } from '../meal-distribution/model';
import { createFoodSnapshot, createDietMenu } from '../menu/model';

export function fixtureFood(id = 'food-1'): FoodItem {
  return { id, owner_id: null, stable_code: id, catalog_code: 'TEST', name: id, normalized_name: id, aliases: [], brand: null, category: null,
    exchange_system_code: EXCHANGE_SYSTEM_CODE, exchange_catalog_version: EXCHANGE_CATALOG_VERSION, group_code: 'CEREALS_NO_FAT',
    portion_amount: 1, portion_unit: 'tortilla', portion_description: '1 tortilla', alternate_portions: [], edible_grams: null,
    energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null,
    attributes: { peanut: 'free' }, source: 'TEST', source_version: '1', source_reference: null, is_custom: false, use_count: 0,
    active: true, created_at: '', updated_at: '' };
}
export function fixtureRecipe(food: FoodItem, id = 'recipe-1'): Recipe {
  return { id, owner_id: null, stable_code: id, name: id, normalized_name: id, description: null, meal_types: ['MAIN_MEAL'],
    servings: 1, instructions: 'Preparación sintética.', image_path: null, tags: [], substitution_notes: null, source: 'TEST', source_version: '1',
    source_reference: null, is_custom: false, active: true, created_at: '', updated_at: '', items: [{ id: 'item-1', owner_id: null, recipe_id: id,
      food_item_id: food.id, amount: 1, unit: food.portion_unit, display_order: 0, food_snapshot: createFoodSnapshot(food),
      exchange_contribution: [{ group_code: food.group_code, portions: 999 }], created_at: '' }] };
}
export function generationFixture(): GenerationInput {
  let macros = createMacroDistribution(2000, null);
  for (const [code, value] of [['CARBOHYDRATE',50], ['PROTEIN',20], ['FAT',30]] as const) macros = patchMacroInput(macros, code, 'percentage', value);
  const targets = { energy_kcal: 2000, carbohydrate_g: 250, protein_g: 100, fat_g: macros.macros.FAT.grams! };
  let exchange = createExchangePrescription(targets);
  exchange = confirmExchangePrescription(setExchangePortions(exchange, targets, 'CEREALS_NO_FAT', 1), targets);
  let meals = { ...createMealDistribution(), meal_times: [createMealTime('Comida', 0, null, 'meal-id')] };
  meals = confirmMealDistribution(setDistributedPortions(meals, 'CEREALS_NO_FAT', 'meal-id', 1), exchange);
  const food = fixtureFood();
  const plan: NutritionPlan = { id: 'plan-private', professional_id: 'owner-private', patient_id: 'patient-private', consultation_id: 'consultation-private',
    title: 'PRIVATE', assigned_at: '', review_date: null, plan_type: null, category: null, target_calories: 2000,
    energy_calculation: null, macro_distribution: macros, exchange_prescription: exchange, meal_distribution: meals, diet_menu: createDietMenu(meals),
    status: 'draft', draft_revision: 1, current_version_id: null, created_at: '', updated_at: '' };
  return { source: { plan, stamp: 'private-stamp', consultation: { id: plan.consultation_id!, professional_id: plan.professional_id, patient_id: plan.patient_id!, revision: 1,
    pes: { statement: 'PES aprobado sintético', approved_at: '2026-09-21T10:00:00Z' },
    objective: { content: 'Objetivo sintético', approved_at: '2026-09-21T10:01:00Z', revision: 1, pes_approved_at: '2026-09-21T10:00:00Z', pes_statement: 'PES aprobado sintético' } },
    answers: { food_reactions_status: { value: 'No', response_area: 'patient_reported' } }, catalog: { foods: [food,fixtureFood('food-2')], recipes: [fixtureRecipe(food)] } },
    policy: { restrictions: {}, unresolved: [] }, sanitizeText: s => s.replace(/PRIVATE|\S+@\S+/g, '[omitido]') };
}
export function validFakeOutput(payload: DietGenerationPayload): DietModelOutput {
  return { schema_version: 1, meal_options: payload.meals.map(m => ({ meal_ref: m.meal_ref, entries: m.distribution.map(g => {
    const candidate = m.candidates.find(c => c.type === 'food' && c.exchanges.some(e => e.group_code === g.group_code))!;
    return { candidate_ref: candidate.candidate_ref, portion_ref: 'base', multiplier: g.portions };
  }) })) };
}
export const fakeFaults = {
  food_id: (out: DietModelOutput) => { out.meal_options[0].entries[0].candidate_ref = 'food:not-authorized'; },
  recipe_id: (out: DietModelOutput) => { out.meal_options[0].entries[0].candidate_ref = 'recipe:not-authorized'; },
  unit: (out: DietModelOutput) => { Object.assign(out.meal_options[0].entries[0], { unit: 'kg' }); },
  hard_restriction: (out: DietModelOutput) => { out.meal_options[0].entries[0].candidate_ref = 'excluded-allergen'; },
  excess: (out: DietModelOutput) => { out.meal_options[0].entries[0].multiplier = 2; },
  schema: (out: DietModelOutput) => { Object.assign(out, { kcal: 0 }); },
  meal: (out: DietModelOutput) => { out.meal_options[0].meal_ref = 'not-authorized'; },
};
