import { describe, it, expect, vi } from 'vitest';
import { generationFixture, fixtureFood, fixtureRecipe, validFakeOutput, fakeFaults } from './generationFixtures';
import { applyDietGenerationDraft, prepareDietGeneration, validateDietGenerationDraft, getDietGenerationEligibility, FakeDietGenerator } from './generationBoundary';
import { DIET_GENERATION_LIMITS, selectDietCandidates } from './generationCandidates';
import { parseDietModelOutput } from './generationSchema';
import { buildDietGenerationContext } from './generationContext';
import { activeMenu, addFoodToMenu } from '../menu/model';
import { confirmMealDistribution, createMealTime, setDistributedPortions } from '../meal-distribution/model';
import { confirmExchangePrescription, setExchangePortions } from '../exchanges/model';
const available = { enabled: true, budgetAvailable: true, pending: false };
function prepare(input = generationFixture()) {
  const result = prepareDietGeneration(input, available);
  expect(result.issues).toEqual([]);
  expect(result.prepared).toBeDefined();
  return result.prepared!;
}

describe('Taller deterministic generation boundary (offline)', () => {
  it('A/P allows a complete context, active candidates and valid distribution', () => {
    const i = generationFixture();
    expect(getDietGenerationEligibility(i, available).eligible).toBe(true);
    expect(prepare(i).payload.meals[0].candidates.length).toBe(3);
  });
  it.each(['contains', 'unknown', undefined])('B excludes a hard allergen, including unverified status %s, from foods and recipes', attribute => {
    const i = generationFixture(); i.policy.restrictions.excludedAttributes = ['peanut'];
    i.source.catalog!.foods[0].attributes.peanut = attribute as 'contains' | 'unknown' | undefined;
    const p = prepare(i);
    expect(p.manifest.meals[0].candidates.map(c => c.candidate.sourceId)).toEqual(['food-2']);
    expect(JSON.stringify(p.payload)).not.toContain('food-1');
  });
  it('B applies explicit exclusions independently of allergies', () => {
    const i = generationFixture(); i.policy.restrictions.excludedFoodIds = ['food-1'];
    expect(prepare(i).manifest.meals[0].candidates.map(c => c.candidate.sourceId)).toEqual(['food-2']);
  });
  it('C negative preference lowers priority without removing the candidate', () => {
    const i = generationFixture(); i.source.plan.diet_menu!.food_preferences = { 'food-1': 'avoid' };
    expect(prepare(i).manifest.meals[0].candidates.filter(c => c.candidate.type === 'food').map(c => c.candidate.sourceId)).toEqual(['food-2','food-1']);
  });
  it('D/Y preserves unknown semantics and blocks unresolved restrictions', () => {
    const i = generationFixture(); i.source.answers.food_reactions_status.value = 'No sabe / no recuerda';
    const e = getDietGenerationEligibility(i, available);
    expect(e.eligible).toBe(false);
    expect(e.context.restrictions.reaction_status.fact.state).toBe('unknown');
    i.source.answers.food_reactions_status.value = 'No'; i.policy.unresolved = ['Revisar indicación adicional'];
    expect(getDietGenerationEligibility(i, available).reasons.map(r => r.code)).toContain('restrictions_need_review');
  });
  it.each(['food_id','recipe_id','unit','hard_restriction','schema','meal'] as const)('E/F/G/I/L security fake %s is rejected without a draft', async fault => {
    const i = generationFixture(), p = prepare(i), before = JSON.stringify(i.source.plan);
    const fake = new FakeDietGenerator(req => { const out = validFakeOutput(req.payload); fakeFaults[fault](out); return out; });
    const raw = await fake.generate({ feature: 'diet_draft', generationId: 'fake', idempotencyKey: 'fake-key', payload: p.payload });
    expect(validateDietGenerationDraft(raw,p,i).status).toBe('invalid');
    expect(applyDietGenerationDraft(raw,p,i,{replaceExisting:true,acceptDifferences:true}).plan).toBeUndefined();
    expect(JSON.stringify(i.source.plan)).toBe(before);
  });
  it.each([-1, 0, NaN, Infinity, 1e30, 0.3, '200 gramos', null])('H rejects invalid quantity %s', multiplier => {
    const i = generationFixture(), p = prepare(i), out = validFakeOutput(p.payload);
    Object.assign(out.meal_options[0].entries[0], { multiplier });
    expect(validateDietGenerationDraft(out,p,i).status).toBe('invalid');
  });
  it('J matches the existing exchange comparison and derives nutrients from catalog', () => {
    const i = generationFixture(), p = prepare(i), v = validateDietGenerationDraft(validFakeOutput(p.payload),p,i);
    expect(v.status).toBe('valid');
    expect(v.totals).toEqual({ energy_kcal:70, carbohydrate_g:15, protein_g:2, fat_g:0 });
    expect(v.differences!.energy_kcal).toBe(-1930); // Reported, NOT silently called a clinically adequate target fit.
    expect(v.requiresTargetReview).toBe(true);
    expect(applyDietGenerationDraft(validFakeOutput(p.payload),p,i,{replaceExisting:false,acceptDifferences:false}).plan).toBeUndefined();
  });
  it('K excess is needs_adjustment, requiring a separate explicit decision', () => {
    const i = generationFixture(), p = prepare(i), out = validFakeOutput(p.payload); fakeFaults.excess(out);
    expect(validateDietGenerationDraft(out,p,i).status).toBe('needs_adjustment');
    expect(applyDietGenerationDraft(out,p,i,{replaceExisting:false,acceptDifferences:false}).issues[0].code).toBe('difference_confirmation_required');
    expect(applyDietGenerationDraft(out,p,i,{replaceExisting:false,acceptDifferences:true}).plan?.status).toBe('draft');
  });
  it('L a changed hard rule rejects even a numerically matching response', () => {
    const i = generationFixture(), p = prepare(i), out = validFakeOutput(p.payload);
    i.policy.restrictions.excludedFoodIds = ['food-1'];
    expect(validateDietGenerationDraft(out,p,i).status).toBe('invalid');
  });
  it.each(['pes','objective'] as const)('M/N missing approved %s blocks eligibility', kind => {
    const i = generationFixture(); i.source.consultation![kind] = null;
    expect(getDietGenerationEligibility(i,available).reasons.map(r => r.code)).toContain(`${kind}_approval_required`);
  });
  it('O empty times and an unconfirmed distribution are not eligible', () => {
    const i = generationFixture(); i.source.plan.meal_distribution!.meal_times = [];
    expect(getDietGenerationEligibility(i,available).eligible).toBe(false);
    const t = generationFixture(); t.source.plan.meal_distribution!.confirmed_at = null;
    expect(getDietGenerationEligibility(t,available).reasons.map(r => r.code)).toContain('invalid_distribution');
  });
  it('Q/R/S payload is an allowlist without identity, private notes, source IDs or catalog leaks', () => {
    const i = generationFixture(); Object.assign(i.source, { patient: { name:'SECRET', email:'secret@example.test' } });
    i.source.answers.private_notes = {value:'SECRET',response_area:'professional_assessment'};
    i.source.additionalInstructions = 'PRIVATE usuario@example.test desayuno transportable';
    i.source.catalog!.foods.push({...fixtureFood('inactive-secret'),active:false});
    const p = prepare(i), text = JSON.stringify(p.payload);
    expect(text).not.toMatch(/SECRET|PRIVATE|usuario@|patient-private|owner-private|consultation-private|plan-private|private-stamp|inactive-secret|sourceId/);
    expect(p.payload.meals.flatMap(m => m.candidates.map(c => c.candidate_ref))).toEqual(p.manifest.meals.flatMap(m => m.candidates.map(c => c.ref)));
  });
  it('T/W valid mock yields one editable draft option per time, never publication', async () => {
    const i = generationFixture(), p = prepare(i), fake = new FakeDietGenerator(req => validFakeOutput(req.payload));
    const raw = await fake.generate({feature:'diet_draft',idempotencyKey:'key',generationId:'id',payload:p.payload});
    const next = applyDietGenerationDraft(raw,p,i,{replaceExisting:false,acceptDifferences:true}).plan!;
    expect(next.status).toBe('draft'); expect(next.diet_menu!.status).toBe('editing');
    expect(next.diet_menu!.meal_options).toHaveLength(1);
    expect(next.diet_menu!.meal_options![0].status).toBe('draft');
    expect(next.diet_menu!.confirmed_at).toBeNull(); expect(next.current_version_id).toBeNull();
    expect(next.diet_menu!.week_plan).toBeNull();
  });
  it('U/V existing menu requires confirmation and the original object is never changed', () => {
    const i = generationFixture(); i.source.plan.diet_menu = addFoodToMenu(i.source.plan.diet_menu!,i.source.plan.meal_distribution!,'meal-id',i.source.catalog!.foods[0],2);
    const p = prepare(i), raw = validFakeOutput(p.payload), before = JSON.stringify(i.source.plan);
    expect(applyDietGenerationDraft(raw,p,i,{replaceExisting:false,acceptDifferences:true}).issues[0].code).toBe('replacement_confirmation_required');
    expect(applyDietGenerationDraft(raw,p,i,{replaceExisting:true,acceptDifferences:true}).plan?.diet_menu?.meal_options).toHaveLength(1);
    expect(JSON.stringify(i.source.plan)).toBe(before);
  });
  it('W rejects duplicate candidates, extra or missing meals', () => {
    const i = generationFixture(), p = prepare(i), raw = validFakeOutput(p.payload);
    raw.meal_options.push(structuredClone(raw.meal_options[0]));
    expect(validateDietGenerationDraft(raw,p,i).status).toBe('invalid');
    raw.meal_options.pop(); raw.meal_options[0].entries.push(structuredClone(raw.meal_options[0].entries[0]));
    expect(validateDietGenerationDraft(raw,p,i).status).toBe('invalid');
    raw.meal_options = []; expect(validateDietGenerationDraft(raw,p,i).status).toBe('invalid');
  });
  it('X rejects supplied nutrient totals and ignores stale recipe snapshots by rehydrating', () => {
    const i = generationFixture(), p = prepare(i), out = validFakeOutput(p.payload);
    const recipe = p.payload.meals[0].candidates.find(c => c.type === 'recipe')!;
    out.meal_options[0].entries[0].candidate_ref = recipe.candidate_ref;
    expect(validateDietGenerationDraft(out,p,i).totals!.energy_kcal).toBe(70); // Fixture snapshot said 999 eq.
    Object.assign(out,{totals:{energy_kcal:1}});
    expect(validateDietGenerationDraft(out,p,i).status).toBe('invalid');
  });
  it('rejects changed catalog, plan revision or stale ingredient references', () => {
    const i = generationFixture(), p = prepare(i), out = validFakeOutput(p.payload);
    i.source.catalog!.foods[0].portion_amount = 2;
    expect(validateDietGenerationDraft(out,p,i).issues[0].code).toBe('context_changed');
    const t = generationFixture(); t.source.catalog!.recipes[0].items[0].food_item_id = 'gone';
    expect(prepare(t).payload.meals[0].candidates.every(c => c.type === 'food')).toBe(true);
  });
  it('invalid nutrients, unit, ownership, inactive records and version mismatches cannot enter the pool', () => {
    for (const patch of [{energy_kcal:-1},{protein_g:Infinity},{portion_unit:'kg'},{owner_id:'other'},{active:false},{exchange_catalog_version:'old'}]) {
      const i = generationFixture(); Object.assign(i.source.catalog!.foods[0],patch);
      expect(prepare(i).manifest.meals[0].candidates.map(c => c.candidate.sourceId)).toEqual(['food-2']);
    }
  });
  it('deduplicates equivalent recipes and food aliases while applying pool limits', () => {
    const i = generationFixture();
    i.source.catalog!.foods.push({...i.source.catalog!.foods[0],id:'alias'});
    i.source.catalog!.recipes.push({...i.source.catalog!.recipes[0],id:'alias-recipe'});
    const p = prepare(i);
    expect(p.payload.meals[0].candidates).toHaveLength(3);
    const context = buildDietGenerationContext(i.source,i.sanitizeText).context;
    expect(selectDietCandidates(context,'meal-id',i.source.catalog!,i.source.plan.professional_id,{}, {foodsPerMeal:1,recipesPerMeal:1}).candidates).toHaveLength(2);
  });
  it('central availability gates preserve the existing error codes', () => {
    const e = getDietGenerationEligibility(generationFixture(),{enabled:false,budgetAvailable:false,pending:true});
    expect(e.reasons.map(r => r.code)).toEqual(expect.arrayContaining(['feature_disabled','insufficient_credits','provider_outcome_unknown']));
  });
  it('bounds response size and rejects extra fields at every level', () => {
    const p = prepare();
    for (const level of ['top','meal','entry']) {
      const raw = validFakeOutput(p.payload);
      Object.assign(level === 'top' ? raw : level === 'meal' ? raw.meal_options[0] : raw.meal_options[0].entries[0],{unexpected:true});
      expect(parseDietModelOutput(raw).data).toBeUndefined();
    }
    expect(parseDietModelOutput('x'.repeat(DIET_GENERATION_LIMITS.maxResponseCharacters+1)).data).toBeUndefined();
  });
  it('compares minimum/full/typical pool sizes offline with no network', async () => {
    const network = vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('Network forbidden'));
    try {
      const i = generationFixture(), minimum = prepare(i).size;
      i.source.additionalInstructions = 'Desayuno transportable y preparación sencilla.';
      i.source.answers.usual_pattern = {value:['Prepara comida en casa'],response_area:'patient_reported'};
      const complete = prepare(i).size;
      const food = i.source.catalog!.foods[0];
      i.source.catalog!.foods = Array.from({length:30},(_,n) => fixtureFood(`food-${n}`));
      i.source.catalog!.recipes = Array.from({length:8},(_,n) => {
        const r = fixtureRecipe(food,`recipe-${n}`); r.items[0].food_item_id = `food-${n}`; return r;
      });
      const plan = i.source.plan, target = plan.exchange_prescription!.target_snapshot;
      plan.exchange_prescription = confirmExchangePrescription(setExchangePortions(plan.exchange_prescription!,target,'CEREALS_NO_FAT',3),target);
      plan.meal_distribution!.meal_times = [0,1,2].map(n => createMealTime(`Comida ${n}`,n,null,`meal-${n}`));
      plan.meal_distribution!.distribution = [];
      for (const m of plan.meal_distribution!.meal_times) plan.meal_distribution = setDistributedPortions(plan.meal_distribution!,'CEREALS_NO_FAT',m.id,1);
      plan.meal_distribution = confirmMealDistribution(plan.meal_distribution!,plan.exchange_prescription);
      const typical = prepare(i);
      expect(typical.payload.meals).toHaveLength(3);
      expect(typical.payload.meals.every(m => m.candidates.length === 18)).toBe(true);
      expect(validateDietGenerationDraft(validFakeOutput(typical.payload),typical,i).draft!.meal_options).toHaveLength(3);
      console.info('Offline diet payload sizes', {minimum,complete,typical:typical.size});
      expect(typical.size.bytes).toBeLessThanOrEqual(DIET_GENERATION_LIMITS.maxPayloadBytes);
      await new FakeDietGenerator({}).generate({feature:'diet_draft',idempotencyKey:'x',generationId:'y',payload:typical.payload});
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
  it('revalidates even if a cached manifest nutrient value is tampered with', () => {
    const i = generationFixture(), p = prepare(i); p.manifest.meals[0].candidates[0].candidate.nutrition.energy_kcal = 1;
    expect(validateDietGenerationDraft(validFakeOutput(p.payload),p,i).totals!.energy_kcal).toBe(70);
    expect(activeMenu(i.source.plan.diet_menu!).meal_menus[0].entries).toEqual([]);
  });
});
