/** Phase 2: pure boundary for a future server adapter. Nothing calls a provider,
 * saves a row, approves a meal or publishes a plan here. Trusted server manifests
 * must never be accepted from a browser as authorization. */
import { buildDietGenerationContext, type DietContextSource } from './generationContext';
import { DIET_GENERATION_LIMITS, selectDietCandidates, contextRestrictions, dietServingMultipliers, type Candidate, type CandidateLimits } from './generationCandidates';
import { parseDietModelOutput, dietGenerationOutputSchema, type GenerationIssue } from './generationSchema';
import { calculateDistributionStatus, sameExchangeInventory } from '../meal-distribution/model';
import { calculateExchangeTotals, calculateExchangeDifferences, sameExchangeTargets } from '../exchanges/model';
import { activeMenu, addFoodToMenu, addRecipeToMenu, calculateMenuStatus, createDietMenu, type RecipeCompatibilityRestriction } from '../menu/model';
import type { DietMenu, ExchangeDerivedTotals, NutritionPlan } from '../../types/domain';

export type GenerationAvailability = { enabled: boolean; budgetAvailable: boolean; pending: boolean };
export type GenerationPolicy = { restrictions: RecipeCompatibilityRestriction; unresolved: string[] };
export type GenerationInput = { source: DietContextSource; policy: GenerationPolicy; sanitizeText: (value: string) => string };
const defaultPolicy: GenerationPolicy = { restrictions: {}, unresolved: [] };
export const manualGenerationPolicy = () => structuredClone(defaultPolicy);

function baseContext(input: GenerationInput) {
  // Phase 1 only projected a small catalog for context. Phase 2 selectors inspect
  // the complete owned catalog, then send ONLY bounded, authorized candidates.
  const catalog = input.source.catalog;
  return buildDietGenerationContext({ ...input.source, catalog: catalog ? { foods: catalog.foods.slice(0,200), recipes: catalog.recipes.slice(0,24) } : undefined }, input.sanitizeText);
}
function contextEligibility(input: GenerationInput, availability: GenerationAvailability) {
  const result = baseContext(input), plan = input.source.plan;
  const reasons: GenerationIssue[] = result.blockers.filter(b => b !== 'catalog_required').map(code => ({ code, path: 'context' }));
  const distribution = plan.meal_distribution, prescription = plan.exchange_prescription;
  const macros = result.context.prescription.macros.fact;
  const targets = macros.state === 'known' ? { energy_kcal: plan.target_calories!, carbohydrate_g: macros.value.CARBOHYDRATE.grams, protein_g: macros.value.PROTEIN.grams, fat_g: macros.value.FAT.grams } : null;
  if (!prescription || prescription.status !== 'ready' || !prescription.confirmed_at || !targets
    || !sameExchangeTargets(prescription.target_snapshot, targets)
    || !prescription.confirmed_target_snapshot || !sameExchangeTargets(prescription.confirmed_target_snapshot, targets)) reasons.push({ code: 'exchanges_unconfirmed', path: 'exchange_prescription' });
  if (!distribution || distribution.status !== 'ready' || !distribution.confirmed_at || !prescription
    || !sameExchangeInventory(distribution.source_exchange_snapshot, prescription)
    || !calculateDistributionStatus(distribution.distribution, prescription).canConfirm
    || distribution.meal_times.length > DIET_GENERATION_LIMITS.maxMeals
    || distribution.meal_times.some(m => !distribution.distribution.some(c => c.meal_time_id === m.id && c.portions > 0))) reasons.push({ code: 'invalid_distribution', path: 'meal_distribution' });
  if (!input.source.stamp || !Number.isSafeInteger(plan.draft_revision) || plan.draft_revision! < 1) reasons.push({ code: 'context_mismatch', path: 'audit' });
  if (input.policy.unresolved.length) reasons.push({ code: 'restrictions_need_review', path: 'rules' });
  if (!input.source.catalog?.foods.length) reasons.push({ code: 'catalog_required', path: 'catalog' });
  if (!availability.enabled) reasons.push({ code: 'feature_disabled', path: 'availability' });
  if (!availability.budgetAvailable) reasons.push({ code: 'insufficient_credits', path: 'availability' });
  if (availability.pending) reasons.push({ code: 'provider_outcome_unknown', path: 'availability' });
  return { eligible: reasons.length === 0, reasons, context: result.context };
}

export type CandidateView = { candidate_ref: string; type: Candidate['type']; name: string; portion_ref: 'base'; unit: Candidate['unit'];
  base_quantity: number; exchanges: Candidate['exchanges']; nutrition: ExchangeDerivedTotals };
type MealView = { meal_ref: string; name: string; distribution: Candidate['exchanges']; candidates: CandidateView[] };
export type DietGenerationPayload = {
  schema_version: 2;
  portion_policy: { portion_ref: 'base'; allowed_multipliers: number[] };
  clinical: ReturnType<typeof baseContext>['context']['clinical'];
  prescription: ReturnType<typeof baseContext>['context']['prescription'];
  restrictions: Pick<ReturnType<typeof baseContext>['context']['restrictions'], 'reaction_status' | 'reactions'>;
  preferences: Pick<ReturnType<typeof baseContext>['context']['preferences'], 'eating_pattern' | 'foods'>;
  routine: ReturnType<typeof baseContext>['context']['routine'];
  professional_instructions: ReturnType<typeof baseContext>['context']['professional_instructions'];
  rules: { hard_filtered: true; excluded_groups: string[]; excluded_attributes: string[] };
  meals: MealView[];
};
export type PreparedDietGeneration = {
  payload: DietGenerationPayload;
  /** Server-private manifest; contains catalog references and original snapshots. */
  manifest: { fingerprint: string; limits: CandidateLimits; meals: Array<{ ref: string; id: string; candidates: Array<{ ref: string; candidate: Candidate }> }> };
  size: ReturnType<typeof estimateDietPayload>;
};
const fingerprint = (input: GenerationInput) => JSON.stringify({ source: input.source, policy: input.policy });
export function estimateDietPayload(payload: unknown) {
  const json = JSON.stringify(payload), schema = JSON.stringify(dietGenerationOutputSchema);
  return { characters: json.length, approximateTokens: Math.ceil(json.length / 4),
    bytes: new TextEncoder().encode(json).length,
    // Mirrors the existing provider's conservative byte bound, not billing.
    conservativeTokensWithSchema: new TextEncoder().encode(json + schema).length + 2048 };
}
export function prepareDietGeneration(input: GenerationInput, availability: GenerationAvailability,
  limits: CandidateLimits = DIET_GENERATION_LIMITS): { prepared?: PreparedDietGeneration; issues: GenerationIssue[] } {
  const eligibility = contextEligibility(input, availability);
  if (!eligibility.eligible) return { issues: eligibility.reasons };
  const context = eligibility.context, meals = input.source.plan.meal_distribution!.meal_times;
  const issues: GenerationIssue[] = [];
  let nextCandidate = 0;
  const manifestMeals = [...meals].sort((a,b) => a.display_order - b.display_order).map((meal,i) => {
    const pool = selectDietCandidates(context, meal.id, input.source.catalog!, input.source.plan.professional_id, input.policy.restrictions, limits);
    const required = input.source.plan.meal_distribution!.distribution.filter(c => c.meal_time_id === meal.id && c.portions > 0);
    if (required.some(r => !pool.candidates.some(c => c.exchanges.some(e => e.group_code === r.group_code)))) issues.push({ code: 'candidate_coverage_missing', path: `meals[${i}]` });
    return { ref: `m${i+1}`, id: meal.id, candidates: pool.candidates.map(candidate => ({ ref: `c${++nextCandidate}`, candidate })) };
  });
  if (issues.length) return { issues };
  const rules = contextRestrictions(context, input.policy.restrictions);
  const payload: DietGenerationPayload = {
    schema_version: 2, portion_policy: { portion_ref: 'base', allowed_multipliers: dietServingMultipliers() }, clinical: context.clinical, prescription: context.prescription,
    restrictions: { reaction_status: context.restrictions.reaction_status, reactions: context.restrictions.reactions },
    preferences: { eating_pattern: context.preferences.eating_pattern, foods: context.preferences.foods },
    routine: context.routine, professional_instructions: context.professional_instructions,
    rules: { hard_filtered: true, excluded_groups: rules.excludedGroupCodes ?? [], excluded_attributes: rules.excludedAttributes ?? [] },
    meals: manifestMeals.map(m => ({ meal_ref: m.ref, name: input.sanitizeText(meals.find(t => t.id === m.id)!.display_name),
      distribution: input.source.plan.meal_distribution!.distribution.filter(c => c.meal_time_id === m.id && c.portions > 0).map(c => ({ group_code: c.group_code, portions: c.portions })),
      candidates: m.candidates.map(({ ref, candidate: c }) => ({ candidate_ref: ref, type: c.type, name: input.sanitizeText(c.name), portion_ref: 'base', unit: c.unit,
        base_quantity: c.baseQuantity, exchanges: c.exchanges.map(e => ({ ...e })), nutrition: { ...c.nutrition } })) })),
  };
  const size = estimateDietPayload(payload);
  if (size.bytes > DIET_GENERATION_LIMITS.maxPayloadBytes) return { issues: [{ code: 'input_too_large', path: 'payload' }] };
  return { issues: [], prepared: { payload, size, manifest: { fingerprint: fingerprint(input), limits: { foodsPerMeal: limits.foodsPerMeal, recipesPerMeal: limits.recipesPerMeal }, meals: manifestMeals } } };
}
/** Single UI eligibility entry point, including pool coverage and payload caps. */
export function getDietGenerationEligibility(input: GenerationInput, availability: GenerationAvailability) {
  const base = contextEligibility(input, availability);
  if (!base.eligible) return base;
  const prepared = prepareDietGeneration(input, availability);
  return { ...base, eligible: prepared.issues.length === 0, reasons: prepared.issues };
}

export type DietDraftValidation = { status: 'valid' | 'needs_adjustment' | 'invalid'; issues: GenerationIssue[];
  draft?: DietMenu; totals?: ExchangeDerivedTotals; differences?: ExchangeDerivedTotals; requiresTargetReview?: boolean };
export function validateDietGenerationDraft(raw: unknown, prepared: PreparedDietGeneration, current: GenerationInput): DietDraftValidation {
  const parsed = parseDietModelOutput(raw);
  if (!parsed.data) return { status: 'invalid', issues: parsed.issues };
  if (fingerprint(current) !== prepared.manifest.fingerprint) return { status: 'invalid', issues: [{ code: 'context_changed', path: 'manifest' }] };
  // Rebuild authorization from current server data. Never trust a supplied model
  // or cached manifest's nutrients, candidates, units or flags.
  const fresh = prepareDietGeneration(current, { enabled: true, budgetAvailable: true, pending: false }, prepared.manifest.limits);
  if (!fresh.prepared) return { status: 'invalid', issues: fresh.issues };
  const manifest = fresh.prepared.manifest, issues: GenerationIssue[] = [];
  const distribution = current.source.plan.meal_distribution!;
  let draft = createDietMenu(distribution, p => `ai-${p}`);
  const seenMeals = new Set<string>();
  for (const [i, meal] of parsed.data.meal_options.entries()) {
    const path = `meal_options[${i}]`, allowed = manifest.meals.find(m => m.ref === meal.meal_ref);
    if (!allowed || seenMeals.has(meal.meal_ref)) { issues.push({ code: 'meal_not_authorized', path }); continue; }
    seenMeals.add(meal.meal_ref);
    const seenCandidates = new Set<string>();
    for (const [j, entry] of meal.entries.entries()) {
      const c = allowed.candidates.find(c => c.ref === entry.candidate_ref)?.candidate;
      if (!c || seenCandidates.has(entry.candidate_ref)) { issues.push({ code: 'candidate_not_authorized', path: `${path}.entries[${j}]` }); continue; }
      seenCandidates.add(entry.candidate_ref);
      if (!c.multipliers.includes(entry.multiplier)) { issues.push({ code: 'portion_not_authorized', path: `${path}.entries[${j}]` }); continue; }
      const id = `ai-entry-${i}-${j}`, quantity = c.baseQuantity * entry.multiplier;
      if (!Number.isFinite(quantity) || quantity <= 0) { issues.push({ code: 'portion_not_authorized', path: `${path}.entries[${j}]` }); continue; }
      if (c.type === 'food') draft = addFoodToMenu(draft, distribution, allowed.id, c.food!, quantity, id);
      else draft = addRecipeToMenu(draft, distribution, allowed.id, c.recipe!, quantity, id);
    }
  }
  if (seenMeals.size !== manifest.meals.length) issues.push({ code: 'meal_missing', path: 'meal_options' });
  if (issues.length) return { status: 'invalid', issues };
  draft.meal_options = activeMenu(draft).meal_menus.map((m,i) => ({ id: `ai-option-${i}`, meal_time_id: m.meal_time_id,
    name: distribution.meal_times.find(t => t.id === m.meal_time_id)!.display_name, entries: structuredClone(m.entries),
    status: 'draft', confirmed_at: null, prescription_key: null, revision: 1 }));
  draft.food_preferences = structuredClone(current.source.plan.diet_menu?.food_preferences ?? {});
  draft.status = 'editing'; draft.confirmed_at = null; draft.week_plan = null;
  const menuStatus = calculateMenuStatus(draft, distribution);
  const totals = calculateExchangeTotals(draft.derived_exchange_usage);
  if (Object.values(totals).some(v => !Number.isFinite(v) || v < 0)) return { status: 'invalid', issues: [{ code: 'invalid_nutrition', path: 'totals' }] };
  const differences = calculateExchangeDifferences(totals, current.source.plan.exchange_prescription!.target_snapshot);
  return { status: menuStatus.canConfirm ? 'valid' : 'needs_adjustment',
    issues: menuStatus.rows.filter(r => r.state !== 'complete').map(r => ({ code: 'portion_difference', path: `${r.meal_time_id}.${r.group_code}` })),
    draft, totals, differences,
    // No clinical kcal/macro acceptance tolerance exists. Any difference is
    // disclosed and requires acknowledgment, not labeled clinically adequate.
    requiresTargetReview: Object.values(differences).some(v => v !== 0) };
}
export function hasDietMenuContent(menu: DietMenu | null): boolean {
  return Boolean(menu && (menu.menus.some(m => m.meal_menus.some(t => t.entries.length)) || menu.meal_options?.length || menu.week_plan?.days.length));
}
export function applyDietGenerationDraft(raw: unknown, prepared: PreparedDietGeneration, current: GenerationInput,
  decision: { replaceExisting: boolean; acceptDifferences: boolean }): { plan?: NutritionPlan; issues: GenerationIssue[] } {
  const validation = validateDietGenerationDraft(raw, prepared, current);
  if (validation.status === 'invalid') return { issues: validation.issues };
  if (hasDietMenuContent(current.source.plan.diet_menu) && !decision.replaceExisting) return { issues: [{ code: 'replacement_confirmation_required', path: 'diet_menu' }] };
  if ((validation.status === 'needs_adjustment' || validation.requiresTargetReview) && !decision.acceptDifferences) return { issues: [{ code: 'difference_confirmation_required', path: 'diet_menu' }] };
  // Pure editable copy only: caller must use existing revision-checked server
  // save. A published version remains unchanged; no automatic confirmations.
  return { plan: { ...structuredClone(current.source.plan), status: 'draft', diet_menu: validation.draft! }, issues: [] };
}

/** Future adapter wraps existing AIProvider/AIStore and feature=diet_workshop.
 * Reservation/settlement remain the responsibility of the existing orchestrator. */
export type DietGenerationRequest = { feature: 'diet_workshop'; idempotencyKey: string; generationId: string; payload: DietGenerationPayload };
export interface DietGenerator { generate(request: DietGenerationRequest): Promise<unknown> }
export class FakeDietGenerator implements DietGenerator {
  constructor(response: (request: DietGenerationRequest) => unknown);
  constructor(response: unknown);
  constructor(private response: unknown | ((request: DietGenerationRequest) => unknown)) {}
  async generate(request: DietGenerationRequest): Promise<unknown> {
    return structuredClone(typeof this.response === 'function' ? this.response(request) : this.response);
  }
}
export { dietGenerationOutputSchema, parseDietModelOutput } from './generationSchema';
