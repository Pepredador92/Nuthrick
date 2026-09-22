import { strict as assert } from 'node:assert';
import fixtures from './fixtures/diet-phase3.json' with {type:'json'};
import { prepareDietSnapshot, validateSnapshot } from './diet.ts';
import { SimulatedDietProvider } from './diet-provider-test.ts';
import { featureAdapter, type FeatureConfig } from './core.ts';

function source() {
  const loaded = structuredClone(fixtures.B);
  const excluded = loaded.source.catalog.foods.find(f => Object.keys(loaded.source.plan.diet_menu.food_preferences).includes(f.id))!;
  assert.ok(excluded);
  return { ...loaded, source: { ...loaded.source,
    confirmedRecall: { approved_at: '2026-09-22T12:00:00Z', narrative: 'PRIVATE narrative', items: [
      { mealLabel: 'Desayuno private@example.test', rawText: 'PRIVATE raw', quantity: 1000, unit: excluded.portion_unit, food: { ...excluded, name: excluded.name + ' private@example.test ' + loaded.source.plan.patient_id } },
    ] },
    anthropometry: { weightKg: 70, heightCm: 170, bmi: 24.2, waistCm: 80, bodyFatPct: 20, leanMassKg: 56, patient_id: loaded.source.plan.patient_id, history: Array(500).fill('PRIVATE history') },
  } };
}
Deno.test('4E provider payload: privacy, bounded context, confirmed data, no histories', async () => {
  const loaded = source(), before = await prepareDietSnapshot(fixtures.B), after = await prepareDietSnapshot(loaded);
  const p = after.prepared.payload, text = JSON.stringify(p);
  assert.ok(p.clinical.recall24h); assert.equal(p.clinical.anthropometry?.weightKg,70);
  for (const forbidden of ['PRIVATE', 'private@example.test', loaded.source.plan.patient_id, loaded.source.plan.professional_id, loaded.source.plan.consultation_id]) assert.ok(!text.includes(forbidden));
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text));
  assert.ok(after.prepared.size.bytes - before.prepared.size.bytes < 1500);
  assert.deepEqual(after.prepared.payload.prescription,before.prepared.payload.prescription);
  assert.deepEqual(after.prepared.payload.meals,before.prepared.payload.meals);
  assert.notEqual(after.hash,before.hash);
});
Deno.test('4E simulated provider obeys excluded candidates and prescription despite conflicting recall', async () => {
  const loaded = source(), snapshot = await prepareDietSnapshot(loaded), baseline = await prepareDietSnapshot(fixtures.B);
  const config = { feature:'diet_draft',model:'simulated-valid',execution_mode:'simulated' } as FeatureConfig;
  const provider = new SimulatedDietProvider();
  const input = { config,...featureAdapter('diet_draft','diet_draft@2'),generationId:crypto.randomUUID(),context:snapshot.prepared.payload };
  const result = await provider.run(input), validated = validateSnapshot(result.output,snapshot);
  const old = validateSnapshot((await provider.run({...input,context:baseline.prepared.payload})).output,baseline);
  assert.equal(validated.status,'valid'); assert.deepEqual(validated.totals,old.totals);
  assert.notEqual(validated.totals!.energy_kcal,snapshot.prepared.payload.clinical.recall24h!.nutrition.energy_kcal);
  assert.deepEqual(result.usage,{input_tokens:0,output_tokens:0,cached_tokens:0});
  const excluded = Object.keys(loaded.source.plan.diet_menu.food_preferences);
  for (const meal of snapshot.prepared.manifest.meals) for (const entry of meal.candidates) {
    assert.ok(!excluded.includes(entry.candidate.sourceId));
    for (const item of entry.candidate.recipe?.items ?? []) assert.ok(!excluded.includes(item.food_item_id!));
  }
});
Deno.test('4E optional data absent or unconfirmed cannot affect readiness', async () => {
  const loaded = source();
  loaded.source.confirmedRecall.approved_at = '';
  loaded.source.anthropometry = {} as typeof loaded.source.anthropometry;
  const p = (await prepareDietSnapshot(loaded)).prepared.payload;
  assert.equal(p.clinical.recall24h,undefined); assert.equal(p.clinical.anthropometry,undefined);
});
