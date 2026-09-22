/** Phase 1 specification/prototype only. Not imported by any screen or AI handler.
 * The future server adapter must authenticate, load one owned revision, redact
 * text and re-read its fingerprint before applying. This is NOT an auth boundary.
 */
import { isPlanEnergyTargetValid } from '../diet-energy/model';
import { calculateMacroDistribution } from '../macros/model';
import { macroCatalog } from '../macros/catalog';
import { calculateDerivedMealTotals } from '../meal-distribution/model';
import { exchangeCatalog } from '../exchanges/catalog';
import { foodUnitLabels } from '../menu/units';
import type { FoodItem, FoodUnitCode, MacroCode, MealDistributionEntry, MealTime, NutritionPlan, Recipe } from '../../types/domain';
import { summarizeConfirmedRecall, summarizeAnthropometry } from './clinicalSummary';

export type Fact<T> =
  | { state: 'known'; value: T }
  | { state: 'unknown'; reason: 'not_recalled' | 'declined' }
  | { state: 'unavailable'; reason: 'missing' | 'null' | 'blank' | 'empty_array' | 'invalid' }
  | { state: 'not_applicable'; reason: 'explicit' };

/** Missing is not a negative response. Zero is retained if the field accepts it. */
export function contextFact<T>(raw: unknown, valid: (value: unknown) => value is T): Fact<T> {
  if (raw === undefined) return { state: 'unavailable', reason: 'missing' };
  if (raw === null) return { state: 'unavailable', reason: 'null' };
  if (typeof raw === 'string' && !raw.trim()) return { state: 'unavailable', reason: 'blank' };
  if (raw === 'No sabe / no recuerda') return { state: 'unknown', reason: 'not_recalled' };
  if (raw === 'Prefiere no responder') return { state: 'unknown', reason: 'declined' };
  if (raw === 'No aplica') return { state: 'not_applicable', reason: 'explicit' };
  if (Array.isArray(raw) && raw.length === 0) return { state: 'unavailable', reason: 'empty_array' };
  if (Array.isArray(raw) && raw.length === 1 && ['No sabe / no recuerda', 'Prefiere no responder', 'No aplica'].includes(raw[0]))
    return contextFact(raw[0], valid);
  return valid(raw) ? { state: 'known', value: raw } : { state: 'unavailable', reason: 'invalid' };
}

export type DietContextSource = {
  plan: NutritionPlan;
  /** Internal only; never included in DietGenerationContext. */
  stamp: string;
  consultation: {
    id: string;
    patient_id: string;
    professional_id: string;
    revision: number;
    pes: { approved_at: string; statement: string } | null;
    objective: {
      approved_at: string; content: string; revision: number;
      pes_approved_at: string; pes_statement: string;
    } | null;
  } | null;
  /** Already scoped to that consultation/revision by the future server loader. */
  answers: Record<string, { value: unknown; response_area: 'patient_reported' | 'professional_assessment' }>;
  additionalInstructions?: string | null;
  /** Service-only RPC: confirmed record and current consultation measurements. */
  confirmedRecall?: unknown;
  anthropometry?: unknown;
  /** Bounded, owned active catalog selected by the future server, not the client. */
  catalog?: { foods: FoodItem[]; recipes: Recipe[] };
};

type Origin = {
  source: 'nutrition_plans' | 'consultation_answers' | 'consultation_snapshots' | 'catalog' | 'request';
  path: string;
  kind: 'professional_captured' | 'patient_declared' | 'system_calculated' | 'approved_pes' | 'approved_objective' | 'catalog_record';
};
type Sourced<T> = { fact: Fact<T>; origin: Origin };
type Reaction = { food: string; classification: string; management?: string };
type Preference = { category: string; food: string };
type Schedule = { day?: string; start?: string; end?: string; meal_window?: string; minutes?: string };
type ContextCatalog = {
  foods: Array<Pick<FoodItem, 'id' | 'name' | 'group_code' | 'portion_amount' | 'portion_unit' | 'exchange_system_code' | 'exchange_catalog_version' | 'attributes'>>;
  recipes: Array<{ id: string; name: string; servings: number; instructions: string | null; items: Array<{ food_item_id: string; amount: number; unit: FoodUnitCode }> }>;
};

export type DietGenerationContext = {
  schema_version: 1;
  clinical: { pes: Sourced<string>; objective: Sourced<string>;
    recall24h?: NonNullable<ReturnType<typeof summarizeConfirmedRecall>>;
    anthropometry?: NonNullable<ReturnType<typeof summarizeAnthropometry>> };
  prescription: {
    energy_kcal: Sourced<number>;
    macros: Sourced<Record<MacroCode, { grams: number; percentage: number; kcal: number }>>;
  };
  meals: Sourced<Array<{
    id: string; meal_type: MealTime['meal_type']; display_name: string;
    time: Fact<string>; display_order: number;
  }>>;
  /** Derived from existing exchange cells, NOT a newly prescribed meal target. */
  meal_distribution: Sourced<{ exchanges: MealDistributionEntry[]; totals: ReturnType<typeof calculateDerivedMealTotals> }>;
  restrictions: {
    reaction_status: Sourced<'Sí' | 'No'>;
    reactions: Sourced<Reaction[]>;
    excluded_food_ids: string[];
  };
  preferences: {
    eating_pattern: Sourced<string[]>;
    foods: Sourced<Preference[]>;
    catalog: Array<{ food_id: string; preference: 'like' | 'avoid' }>;
  };
  routine: {
    usual_pattern: Sourced<string[]>;
    daily_schedule: Sourced<Schedule[]>;
    cooking_time: Sourced<string>;
    food_equipment: Sourced<string[]>;
  };
  professional_instructions: Sourced<string>;
  catalog: Sourced<ContextCatalog>;
};

export type ContextBlocker =
  | 'draft_required' | 'consultation_required' | 'context_mismatch'
  | 'energy_required' | 'macros_required' | 'prescription_inconsistent'
  | 'pes_approval_required' | 'objective_approval_required'
  | 'meal_structure_required' | 'meal_structure_invalid' | 'distribution_invalid'
  | 'restrictions_need_review' | 'instructions_too_long' | 'catalog_required';

export type DietContextResult = {
  context: DietGenerationContext;
  ready: boolean;
  blockers: ContextBlocker[];
  /** Keep outside model payload. The future adapter additionally binds catalog
   * revision, normalized instructions and context schema into the fingerprint. */
  audit: { plan_id: string; draft_revision: number | undefined; consultation_id: string | null; stamp: string };
};

const stringValue = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim());
const stringList = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(stringValue);
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const list = <T>(guard: (v: unknown) => v is T) => (v: unknown): v is T[] => Array.isArray(v) && v.length > 0 && v.every(guard);
const reaction = (v: unknown): v is Reaction => record(v) && stringValue(v.food) && stringValue(v.classification);
const preference = (v: unknown): v is Preference => record(v) && stringValue(v.food) && stringValue(v.category);
const scheduleKeys = ['day', 'start', 'end', 'meal_window', 'minutes'] as const;
const schedule = (v: unknown): v is Schedule => record(v)
  && scheduleKeys.some(k => stringValue(v[k]))
  && scheduleKeys.every(k => v[k] === undefined || v[k] === null || typeof v[k] === 'string');
const time = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const unavailable = <T>(): Fact<T> => ({ state: 'unavailable', reason: 'missing' });
function mapFact<A, B>(fact: Fact<A>, fn: (a: A) => B): Fact<B> {
  return fact.state === 'known' ? { state: 'known', value: fn(fact.value) } : fact;
}

/** Pure prototype. sanitizeText is mandatory: use the existing server clinical
 * redactor with patient identifiers at integration time; never pass identity.
 * It is applied to each explicitly selected text field, not whole DB objects.
 */
export function buildDietGenerationContext(source: DietContextSource, sanitizeText: (text: string) => string): DietContextResult {
  const { plan, consultation: c } = source;
  const blockers: ContextBlocker[] = [];
  const clean = (s: string) => sanitizeText(s.trim());
  const fromPlan = <T>(path: string, fact: Fact<T>, calculated = false): Sourced<T> => ({
    fact, origin: { source: 'nutrition_plans', path, kind: calculated ? 'system_calculated' : 'professional_captured' },
  });
  const answer = <A, B>(key: string, guard: (v: unknown) => v is A, project: (a: A) => B): Sourced<B> => ({
    fact: mapFact(contextFact(source.answers[key]?.value, guard), project),
    origin: { source: 'consultation_answers', path: key,
      kind: source.answers[key]?.response_area === 'professional_assessment' ? 'professional_captured' : 'patient_declared' },
  });
  const multiple = (key: string) => answer(key, stringList, v => v.map(clean));
  if (plan.status !== 'draft') blockers.push('draft_required');
  if (!plan.patient_id || !plan.consultation_id || !c) blockers.push('consultation_required');
  const sameContext = Boolean(c && c.id === plan.consultation_id && c.patient_id === plan.patient_id && c.professional_id === plan.professional_id && Number.isInteger(c.revision) && c.revision > 0);
  if (c && !sameContext) blockers.push('context_mismatch');

  const energy = contextFact(plan.target_calories, positive);
  if (!isPlanEnergyTargetValid(plan.target_calories)) blockers.push('energy_required');
  let macros: Fact<Record<MacroCode, { grams: number; percentage: number; kcal: number }>> = unavailable();
  const m = plan.macro_distribution;
  if (!m) blockers.push('macros_required');
  else {
    // Recalculate authoritative inputs: never trust persisted `complete`, grams
    // or totals. Reject stale energy snapshots instead of silently reconciling.
    const validInputs = macroCatalog.every(({ code }) => {
      const item = m.macros?.[code];
      return item && item.code === code && ['grams', 'percentage', 'grams_per_kg'].includes(item.input_mode)
        && typeof item.input_value === 'number' && Number.isFinite(item.input_value) && item.input_value >= 0;
    });
    const calculated = validInputs ? calculateMacroDistribution(m) : null;
    if (!calculated?.complete || m.target_energy_kcal !== plan.target_calories) blockers.push('prescription_inconsistent');
    else macros = { state: 'known', value: Object.fromEntries(macroCatalog.map(({ code }) => {
      const item = calculated.macros[code];
      return [code, { grams: item.grams!, percentage: item.percentage!, kcal: item.kcal! }];
    })) as Record<MacroCode, { grams: number; percentage: number; kcal: number }> };
  }
  if (plan.energy_calculation?.prescribed_target_kcal != null && plan.energy_calculation.prescribed_target_kcal !== plan.target_calories)
    blockers.push('prescription_inconsistent');

  const pesApproved = sameContext && c?.pes && date(c.pes.approved_at) && stringValue(c.pes.statement);
  const goalApproved = pesApproved && c?.objective && date(c.objective.approved_at) && stringValue(c.objective.content)
    && c.objective.revision === c.revision && c.objective.pes_approved_at === c.pes?.approved_at && c.objective.pes_statement === c.pes?.statement;
  if (!pesApproved) blockers.push('pes_approval_required');
  if (!goalApproved) blockers.push('objective_approval_required');

  const distribution = plan.meal_distribution;
  const meals = distribution?.meal_times;
  if (!meals?.length) blockers.push('meal_structure_required');
  const validMeals = Boolean(meals?.length && new Set(meals.map(v => v.id)).size === meals.length
    && meals.every(v => stringValue(v.id) && stringValue(v.display_name) && ['BREAKFAST', 'SNACK', 'MAIN_MEAL', 'DINNER', 'CUSTOM'].includes(v.meal_type)
      && Number.isInteger(v.display_order) && v.display_order >= 0 && (v.time === null || time(v.time))));
  if (meals?.length && !validMeals) blockers.push('meal_structure_invalid');
  const groups = new Set<string>(exchangeCatalog.map(g => g.groupCode));
  const cells = distribution?.distribution ?? [];
  const validCells = validMeals && cells.every(v => meals!.some(t => t.id === v.meal_time_id) && groups.has(v.group_code) && Number.isFinite(v.portions) && v.portions >= 0)
    && new Set(cells.map(v => `${v.meal_time_id}:${v.group_code}`)).size === cells.length;
  if (cells.length && !validCells) blockers.push('distribution_invalid');
  const reactionStatus = answer('food_reactions_status', (v): v is 'Sí' | 'No' => v === 'Sí' || v === 'No', v => v);
  const reactions = answer('food_reactions_v2', list(reaction), rows => rows.map(r => ({ food: clean(r.food), classification: clean(r.classification), ...(stringValue(r.management) ? { management: clean(r.management) } : {}) })));
  const preferences = answer('food_preferences', list(preference), rows => rows.map(r => ({ category: clean(r.category), food: clean(r.food) })));
  const patterns = multiple('eating_preferences');
  // Conservative proposed Phase 1 policy. Unknown is NOT absence of allergies.
  // No free-text->allergen mapping exists yet. Keep restrictions visible but
  // block future generation until a separately tested resolver is approved.
  const unresolvedReactions = reactions.fact.state === 'known'
    || (reactions.fact.state === 'unavailable' && reactions.fact.reason === 'invalid');
  const unresolvedPreferences = (preferences.fact.state === 'known' && preferences.fact.value.some(v => ['No consume', 'Preferencia cultural / religiosa'].includes(v.category)))
    || (preferences.fact.state === 'unavailable' && preferences.fact.reason === 'invalid');
  const unresolvedPattern = patterns.fact.state === 'known' && patterns.fact.value.some(v => ['Vegetariano', 'Vegano', 'Pescetariano', 'Restricción religiosa'].includes(v));
  if (reactionStatus.fact.state !== 'known' || reactionStatus.fact.value !== 'No' || unresolvedReactions || unresolvedPreferences || unresolvedPattern)
    blockers.push('restrictions_need_review');
  if ((source.additionalInstructions?.length ?? 0) > 1200) blockers.push('instructions_too_long');
  const catalogPreferences = Object.entries(plan.diet_menu?.food_preferences ?? {});
  const excludedIds = new Set(catalogPreferences.filter(([, v]) => v === 'exclude').map(([id]) => id));
  let catalog: Fact<ContextCatalog> = unavailable();
  if (source.catalog && source.catalog.foods.length <= 200 && source.catalog.recipes.length <= 24) {
    const foods = source.catalog.foods.filter(f => f.active && (f.owner_id === null || f.owner_id === plan.professional_id)
      && !excludedIds.has(f.id) && positive(f.portion_amount) && Object.hasOwn(foodUnitLabels, f.portion_unit) && groups.has(f.group_code));
    const recipes = source.catalog.recipes.filter(r => r.active && (r.owner_id === null || r.owner_id === plan.professional_id) && positive(r.servings)
      && r.items.length > 0 && r.items.every(i => positive(i.amount) && foods.some(f => f.id === i.food_item_id && f.portion_unit === i.unit)));
    const attributeKeys = ['gluten', 'lactose', 'milk', 'egg', 'peanut', 'tree_nuts', 'soy', 'fish', 'crustaceans', 'other'];
    if (foods.length) catalog = { state: 'known', value: {
      foods: foods.map(f => ({ id: f.id, name: clean(f.name), group_code: f.group_code, portion_amount: f.portion_amount, portion_unit: f.portion_unit,
        exchange_system_code: f.exchange_system_code, exchange_catalog_version: f.exchange_catalog_version,
        attributes: Object.fromEntries(Object.entries(f.attributes ?? {}).filter(([k, v]) => attributeKeys.includes(k) && ['contains', 'free', 'unknown'].includes(v))) })),
      recipes: recipes.map(r => ({ id: r.id, name: clean(r.name), servings: r.servings, instructions: r.instructions === null ? null : clean(r.instructions),
        items: r.items.map(i => ({ food_item_id: i.food_item_id!, amount: i.amount, unit: i.unit })) })),
    } };
  }
  if (catalog.state !== 'known') blockers.push('catalog_required');
  const recall24h = summarizeConfirmedRecall(source.confirmedRecall, clean);
  const anthropometry = summarizeAnthropometry(source.anthropometry);
  const context: DietGenerationContext = {
    schema_version: 1,
    clinical: {
      ...(recall24h ? { recall24h } : {}),
      ...(anthropometry ? { anthropometry } : {}),
      pes: { fact: pesApproved ? { state: 'known', value: clean(c!.pes!.statement) } : unavailable(), origin: { source: 'consultation_snapshots', path: 'clinical_records.pes + pes_statement', kind: 'approved_pes' } },
      objective: { fact: goalApproved ? { state: 'known', value: clean(c!.objective!.content) } : unavailable(), origin: { source: 'consultation_snapshots', path: 'clinical_records.objective', kind: 'approved_objective' } },
    },
    prescription: { energy_kcal: fromPlan('target_calories', energy), macros: fromPlan('macro_distribution.macros.input_value + input_mode', macros, true) },
    meals: fromPlan('meal_distribution.meal_times', validMeals ? { state: 'known', value: [...meals!].sort((a,b) => a.display_order - b.display_order).map(v => ({ id: v.id, meal_type: v.meal_type, display_name: clean(v.display_name), time: contextFact(v.time, time), display_order: v.display_order })) } : unavailable()),
    meal_distribution: fromPlan('meal_distribution.distribution', validCells && cells.length ? { state: 'known', value: {
      exchanges: cells.map(v => ({ meal_time_id: v.meal_time_id, group_code: v.group_code, portions: v.portions })),
      totals: calculateDerivedMealTotals(cells, meals!),
    } } : unavailable(), true),
    restrictions: { reaction_status: reactionStatus, reactions, excluded_food_ids: catalogPreferences.filter(([, v]) => v === 'exclude').map(([id]) => id) },
    preferences: { eating_pattern: patterns, foods: preferences, catalog: catalogPreferences.flatMap(([food_id, v]) => v === 'like' || v === 'avoid' ? [{ food_id, preference: v }] : []) },
    routine: {
      usual_pattern: multiple('usual_pattern'),
      daily_schedule: answer('daily_schedule', list(schedule), rows => rows.map(v => Object.fromEntries(scheduleKeys.flatMap(k => stringValue(v[k]) ? [[k, clean(v[k]!)]] : [])))),
      cooking_time: answer('cooking_time', stringValue, clean), food_equipment: multiple('food_equipment'),
    },
    professional_instructions: { fact: mapFact(contextFact(source.additionalInstructions, stringValue), clean), origin: { source: 'request', path: 'additionalInstructions', kind: 'professional_captured' } },
    catalog: { fact: catalog, origin: { source: 'catalog', path: 'food_items + recipes + recipe_items', kind: 'catalog_record' } },
  };
  return { context, ready: blockers.length === 0, blockers: [...new Set(blockers)], audit: { plan_id: plan.id, draft_revision: plan.draft_revision, consultation_id: plan.consultation_id, stamp: source.stamp } };
}

/** Design contract, not a model schema/runtime validator yet. The future server
 * resolves these catalog references into existing MealOption/DietMenuEntry
 * snapshots. No model-supplied nutrients, approvals or patient/owner IDs. */
export type DietGenerationDraft = {
  schema_version: 1;
  meal_options: Array<{
    meal_time_id: string;
    name: string;
    entries: Array<
      | { type: 'food'; source_id: string; quantity: number; unit: FoodUnitCode }
      | { type: 'recipe'; source_id: string; quantity: number; unit: 'recipe_serving' }
    >;
  }>;
  warnings: string[];
};
