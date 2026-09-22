import { describe, expect, it, vi } from 'vitest';
import { buildDietGenerationContext, contextFact, type DietContextSource, type DietGenerationDraft } from './generationContext';
import { createMacroDistribution, patchMacroInput } from '../macros/model';
import { createMealDistribution, createMealTime } from '../meal-distribution/model';
import { createDietMenu } from '../menu/model';
import type { FoodItem, NutritionPlan } from '../../types/domain';

/** Synthetic only. No DB, provider, real identities or generated nutrition. */
function fixture(): DietContextSource {
  let macros = createMacroDistribution(2000, null);
  macros = patchMacroInput(macros, 'CARBOHYDRATE', 'percentage', 50);
  macros = patchMacroInput(macros, 'PROTEIN', 'percentage', 20);
  macros = patchMacroInput(macros, 'FAT', 'percentage', 30);
  const distribution = { ...createMealDistribution(), meal_times: [createMealTime('Comida', 0, null, 'meal-1')] };
  const plan: NutritionPlan = {
    id: 'plan-test', professional_id: 'professional-test', patient_id: 'patient-test', consultation_id: 'consultation-test',
    title: 'Not for model', assigned_at: '2026-09-21', review_date: null, plan_type: null, category: null,
    target_calories: 2000, energy_calculation: null, macro_distribution: macros,
    exchange_prescription: null, meal_distribution: distribution, diet_menu: createDietMenu(distribution),
    draft_revision: 3, status: 'draft', created_at: '', updated_at: '',
  };
  return {
    plan, stamp: 'server-only-fingerprint',
    consultation: {
      id: 'consultation-test', patient_id: 'patient-test', professional_id: 'professional-test', revision: 2,
      pes: { approved_at: '2026-09-21T10:00:00Z', statement: 'PES sintético revisado.' },
      objective: { approved_at: '2026-09-21T10:01:00Z', content: 'Organizar la alimentación.', revision: 2,
        pes_approved_at: '2026-09-21T10:00:00Z', pes_statement: 'PES sintético revisado.' },
    },
    answers: { food_reactions_status: { value: 'No', response_area: 'patient_reported' } },
    catalog: { foods: [{ id: 'catalog-food', owner_id: null, name: 'Tortilla', group_code: 'CEREALS_NO_FAT', portion_amount: 1,
      portion_unit: 'tortilla', active: true, attributes: { gluten: 'unknown' }, exchange_system_code: 'SMAE', exchange_catalog_version: '1' } as FoodItem], recipes: [] },
  };
}
// Dependency contract test; actual integration must use existing server redactor.
const sanitize = (s: string) => s.replace(/IDENTIDAD_PRIVADA|\S+@\S+/g, '[omitido]');
const build = (s: DietContextSource) => buildDietGenerationContext(s, sanitize);
const answer = (value: unknown) => ({ value, response_area: 'patient_reported' as const });

describe('DietGenerationContext phase 1 — no network', () => {
  it('A/I projects complete context, provenance and derived distribution without mutation', () => {
    const s = fixture();
    Object.assign(s.answers, {
      usual_pattern: answer(['Prepara comida en casa']), daily_schedule: answer([{ day: 'Entre semana', meal_window: '14:00', minutes: '20–30 minutos', place: 'private workplace' }]),
      cooking_time: answer('15–30 minutos'), food_equipment: answer(['Estufa']),
      eating_preferences: answer(['Omnívoro']), food_preferences: answer([{ category: 'Favorito', food: 'Frijoles', reason: 'private reason' }]),
    });
    s.plan.meal_distribution!.distribution = [{ meal_time_id: 'meal-1', group_code: 'FRUITS', portions: 0 }];
    s.plan.meal_distribution!.derived_meal_totals = [{ meal_time_id: 'meal-1', energy_kcal: 999, protein_g: 999, fat_g: 999, carbohydrate_g: 999 }];
    const before = JSON.stringify(s), result = build(s);
    expect(result.ready).toBe(true);
    expect(result.context.meal_distribution.fact).toEqual({ state: 'known', value: {
      exchanges: [{ meal_time_id: 'meal-1', group_code: 'FRUITS', portions: 0 }],
      totals: [{ meal_time_id: 'meal-1', energy_kcal: 0, protein_g: 0, fat_g: 0, carbohydrate_g: 0 }],
    } });
    expect(result.context.routine.cooking_time.origin.kind).toBe('patient_declared');
    expect(result.context.prescription.macros.origin.kind).toBe('system_calculated');
    expect(JSON.stringify(result.context)).not.toMatch(/private workplace|private reason/);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('B accepts a minimally valid patient context without demographics, recall or five invented meals', () => {
    const r = build(fixture());
    expect(r.blockers).toEqual([]);
    expect(r.context.meals.fact.state === 'known' && r.context.meals.fact.value.length).toBe(1);
    expect(r.context.meal_distribution.fact.state).toBe('unavailable');
  });
  it('C keeps explicit reactions and blocks unmapped restrictions, including contradictory No', () => {
    for (const status of ['Sí', 'No']) {
      const s = fixture();
      s.answers.food_reactions_status = answer(status);
      s.answers.food_reactions_v2 = answer([{ food: 'Cacahuate', classification: 'Alergia confirmada', confirmed_by: 'IDENTIDAD_PRIVADA', management: 'Evita el alimento' }]);
      expect(build(s).blockers).toContain('restrictions_need_review');
      expect(JSON.stringify(build(s).context)).toContain('Cacahuate');
      expect(JSON.stringify(build(s).context)).not.toContain('confirmed_by');
    }
  });
  it.each(['No consume', 'Preferencia cultural / religiosa'])('C blocks unresolved food exclusion %s', category => {
    const s = fixture(); s.answers.food_preferences = answer([{ category, food: 'Cerdo' }]);
    expect(build(s).blockers).toContain('restrictions_need_review');
  });
  it('D preserves absent, declined and explicitly unknown preferences', () => {
    const s = fixture();
    expect(build(s).context.preferences.foods.fact).toEqual({ state: 'unavailable', reason: 'missing' });
    s.answers.eating_preferences = answer(['Prefiere no responder']);
    expect(build(s).context.preferences.eating_pattern.fact).toEqual({ state: 'unknown', reason: 'declined' });
    s.answers.eating_preferences = answer(['No sabe / no recuerda']);
    expect(build(s).context.preferences.eating_pattern.fact).toEqual({ state: 'unknown', reason: 'not_recalled' });
    expect(build(s).ready).toBe(true);
  });
  it('E blocks kcal without macros', () => {
    const s = fixture(); s.plan.macro_distribution = null;
    expect(build(s).blockers).toContain('macros_required');
  });
  it('F blocks macros without kcal and zero energy', () => {
    for (const energy of [null, 0, NaN, Infinity, 10001]) {
      const s = fixture(); s.plan.target_calories = energy;
      expect(build(s).blockers).toContain('energy_required');
    }
  });
  it('G never exports unapproved PES', () => {
    const s = fixture(); s.consultation!.pes = null;
    expect(build(s).blockers).toContain('pes_approval_required');
    expect(build(s).context.clinical.pes.fact.state).toBe('unavailable');
  });
  it('H never exports unapproved or stale objectives', () => {
    const s = fixture(); s.consultation!.objective!.pes_statement = 'Other PES';
    expect(build(s).blockers).toContain('objective_approval_required');
    s.consultation!.objective = null;
    expect(build(s).context.clinical.objective.fact.state).toBe('unavailable');
  });
  it('J optional professional instructions are additional, sanitized and cannot override prescription', () => {
    const s = fixture(); s.additionalInstructions = 'Desayuno transportable. IDENTIDAD_PRIVADA, usuario@example.test';
    expect(build(s).context.professional_instructions.fact).toEqual({ state: 'known', value: 'Desayuno transportable. [omitido], [omitido]' });
    expect(build(s).context.prescription.energy_kcal.fact).toEqual({ state: 'known', value: 2000 });
    s.additionalInstructions = 'x'.repeat(1201);
    expect(build(s).blockers).toContain('instructions_too_long');
  });
  it('K uses canonical 4/4/9 inputs, not tampered persisted grams or complete flag', () => {
    const s = fixture(); s.plan.macro_distribution!.macros.PROTEIN.grams = 999;
    const f = build(s).context.prescription.macros.fact;
    expect(f.state).toBe('known');
    if (f.state !== 'known') throw Error('Expected macros');
    expect(f.value.PROTEIN.grams).toBe(100);
    expect(f.value.CARBOHYDRATE.grams).toBe(250);
    expect(f.value.FAT.grams * 9 + f.value.PROTEIN.grams * 4 + f.value.CARBOHYDRATE.grams * 4).toBe(2000);
    s.plan.macro_distribution!.macros.PROTEIN.input_value = 5;
    expect(build(s).blockers).toContain('prescription_inconsistent');
  });
  it('K respects the existing 1 kcal tolerance and preserves a valid zero macro', () => {
    const s = fixture();
    for (const [code, grams] of [['PROTEIN', 0], ['CARBOHYDRATE', 500], ['FAT', 0]] as const)
      s.plan.macro_distribution = patchMacroInput(s.plan.macro_distribution!, code, 'grams', grams);
    expect(build(s).ready).toBe(true);
    s.plan.macro_distribution = patchMacroInput(s.plan.macro_distribution!, 'PROTEIN', 'grams', 0.25);
    expect(build(s).ready).toBe(true);
    s.plan.macro_distribution = patchMacroInput(s.plan.macro_distribution!, 'PROTEIN', 'grams', 0.5);
    expect(build(s).ready).toBe(false);
  });
  it('K rejects mismatched energy snapshots and invalid macro modes', () => {
    const s = fixture(); s.plan.macro_distribution!.target_energy_kcal = 2100;
    expect(build(s).blockers).toContain('prescription_inconsistent');
    const t = fixture(); Object.assign(t.plan.macro_distribution!.macros.PROTEIN, { input_mode: 'kg' });
    expect(build(t).blockers).toContain('prescription_inconsistent');
  });
  it('K resolves g/kg only with a valid explicit reference weight', () => {
    const s = fixture();
    s.plan.macro_distribution!.reference_weight_kg = 50;
    s.plan.macro_distribution = patchMacroInput(s.plan.macro_distribution!, 'PROTEIN', 'grams_per_kg', 2);
    expect(build(s).ready).toBe(true);
    s.plan.macro_distribution!.reference_weight_kg = null;
    expect(build(s).blockers).toContain('prescription_inconsistent');
  });
  it('H rejects approval from another snapshot revision', () => {
    const s = fixture(); s.consultation!.objective!.revision = 1;
    expect(build(s).blockers).toContain('objective_approval_required');
  });
  it('L excludes raw identity, audit IDs, arbitrary clinical records, labs and hidden nested fields', () => {
    const s = fixture();
    Object.assign(s, { patient: { name: 'IDENTIDAD_PRIVADA', email: 'usuario@example.test' }, labs: [{ value: 500 }], clinicalRecords: { note: 'SECRET' } });
    s.answers.medical_diagnoses_v2 = answer([{ diagnosis: 'IRRELEVANT' }]);
    s.answers.private_notes = answer('SECRET');
    s.answers.food_preferences = answer([{ category: 'Favorito', food: 'Frijol', nested: { note: 'SECRET' } }]);
    const encoded = JSON.stringify(build(s).context);
    expect(encoded).not.toMatch(/IDENTIDAD_PRIVADA|usuario@|SECRET|IRRELEVANT|patient-test|professional-test|consultation-test|server-only-fingerprint|Not for model/);
  });
  it.each([undefined, null, '', [], 'No sabe / no recuerda', 'No aplica', 0])('never interprets missing/unknown allergy response %j as No', value => {
    const s = fixture(); s.answers.food_reactions_status = answer(value);
    expect(build(s).blockers).toContain('restrictions_need_review');
  });
  it('distinguishes null, absent, blank, empty array, unknown, not applicable and known zero', () => {
    const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    expect([undefined, null, '', [], 'No sabe / no recuerda', 'No aplica', 0].map(v => contextFact(v, number))).toEqual([
      { state: 'unavailable', reason: 'missing' }, { state: 'unavailable', reason: 'null' },
      { state: 'unavailable', reason: 'blank' }, { state: 'unavailable', reason: 'empty_array' },
      { state: 'unknown', reason: 'not_recalled' }, { state: 'not_applicable', reason: 'explicit' }, { state: 'known', value: 0 },
    ]);
  });
  it('requires configured meals; no automatic defaults in context preparation', () => {
    const s = fixture(); s.plan.meal_distribution = null;
    expect(build(s).blockers).toContain('meal_structure_required');
    expect(build(s).context.meals.fact.state).toBe('unavailable');
  });
  it('rejects wrong times, duplicate meal ids and cells outside the current meal structure', () => {
    const s = fixture(); s.plan.meal_distribution!.meal_times[0].time = '25:00';
    expect(build(s).blockers).toContain('meal_structure_invalid');
    const t = fixture(); t.plan.meal_distribution!.meal_times.push(t.plan.meal_distribution!.meal_times[0]);
    expect(build(t).blockers).toContain('meal_structure_invalid');
    const u = fixture(); u.plan.meal_distribution!.distribution = [{ meal_time_id: 'other', group_code: 'FRUITS', portions: 1 }];
    expect(build(u).blockers).toContain('distribution_invalid');
  });
  it('rejects cross-patient consultation context and non-draft plans', () => {
    const s = fixture(); s.consultation!.patient_id = 'other'; s.plan.status = 'active';
    expect(build(s).blockers).toEqual(expect.arrayContaining(['context_mismatch', 'draft_required']));
    expect(build(s).context.clinical.pes.fact.state).toBe('unavailable');
  });
  it('keeps catalog exclusions hard and dislikes soft with no clinical inference', () => {
    const s = fixture(); s.plan.diet_menu!.food_preferences = { food1: 'exclude', food2: 'avoid', food3: 'like' };
    expect(build(s).context.restrictions.excluded_food_ids).toEqual(['food1']);
    expect(build(s).context.preferences.catalog).toEqual([{ food_id: 'food2', preference: 'avoid' }, { food_id: 'food3', preference: 'like' }]);
  });
  it('filters catalog ownership and exclusions, preserves unknown allergens and drops arbitrary catalog metadata', () => {
    const s = fixture(), f = s.catalog!.foods[0];
    s.catalog!.foods.push({ ...f, id: 'other-owner', owner_id: 'other' }, { ...f, id: 'excluded' });
    s.plan.diet_menu!.food_preferences = { excluded: 'exclude' };
    Object.assign(f, { private_notes: 'SECRET' });
    const c = build(s).context.catalog.fact;
    expect(c.state === 'known' && c.value.foods.map(f => f.id)).toEqual(['catalog-food']);
    expect(JSON.stringify(c)).toContain('unknown');
    expect(JSON.stringify(c)).not.toContain('SECRET');
    s.catalog = undefined;
    expect(build(s).blockers).toContain('catalog_required');
  });
  it('K does not invent unit conversions or accept nonpositive catalog portions', () => {
    const s = fixture();
    Object.assign(s.catalog!.foods[0], { portion_unit: 'kg' });
    expect(build(s).blockers).toContain('catalog_required');
    Object.assign(s.catalog!.foods[0], { portion_unit: 'tortilla', portion_amount: 0 });
    expect(build(s).blockers).toContain('catalog_required');
  });
  it('is network-free; future output fixture uses existing food/recipe units without model totals', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    try {
      build(fixture());
      const output: DietGenerationDraft = { schema_version: 1, meal_options: [{ meal_time_id: 'meal-1', name: 'Comida', entries: [
        { type: 'food', source_id: 'catalog-food', quantity: 2, unit: 'tortilla' },
        { type: 'recipe', source_id: 'catalog-recipe', quantity: 1, unit: 'recipe_serving' },
      ] }], warnings: [] };
      expect(output.meal_options[0].entries[0].quantity).toBe(2);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});
