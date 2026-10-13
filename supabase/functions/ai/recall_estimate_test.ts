import { strict as assert } from 'node:assert';
import { clinicalAdapter, clinicalEvidenceValid, recallEstimateSchema } from './clinical.ts';
import { runAIRequest, validOutput, type AIStore, type FeatureConfig } from './core.ts';
const estimate = { confidence: 'low', assumptions: ['Vaso de 240 ml supuesto.'], uncertainties: ['Confirmar porción.'], meals: [{ mealLabel: 'Cena', description: 'Un vaso de leche.', energy_kcal: 150, protein_g: 8, carbohydrate_g: 12, fat_g: 8 }] };
Deno.test('estimation uses structured nutrition, not catalog IDs or strict dictated quotations', () => {
  assert.ok(validOutput(recallEstimateSchema, estimate));
  assert.ok(clinicalEvidenceValid('recall_24h', estimate, { narrative: 'Un vaso de leche' }));
  assert.ok(clinicalAdapter('recall_24h', 'recall_24h@3')!.instructions.includes('SUPUESTOS'));
  assert.ok(clinicalAdapter('recall_24h', 'recall_24h@1'), 'legacy extraction still supported');
  for (const energy_kcal of [-10, NaN, 40000]) assert.equal(clinicalEvidenceValid('recall_24h', { ...estimate, meals: [{ ...estimate.meals[0], energy_kcal }] }, {}), false);
});
Deno.test('R24h estimate keeps one provider call and one usage settlement, without applying legacy quantity filters', async () => {
  const config: FeatureConfig = { feature: 'recall_24h', enabled: true, provider: 'openai', model: 'test', prompt_version: 'recall_24h@3', max_input_tokens: 8192, max_output_tokens: 4096, timeout_ms: 60000, reasoning_level: null, temperature: null };
  let calls = 0, settled = 0;
  const store: AIStore = { config: () => Promise.resolve(config), context: () => Promise.resolve({ stamp: 's', context: { narrative: 'Un vaso de leche.' } }), bindContext: () => Promise.resolve(),
    reserve: () => Promise.resolve({ created: true, generation: { id: 'g', status: 'reserved', charged_credits: 0 } }), claim: () => Promise.resolve(true),
    settle: (_id, status, usage) => { assert.equal(status, 'succeeded'); assert.equal(usage.output_tokens, 100); settled++; return Promise.resolve({ id: 'g', status, charged_credits: 1 }); }, uncertain: () => Promise.resolve(),
  };
  const result = await runAIRequest({ feature: 'recall_24h', idempotencyKey: crypto.randomUUID(), patientId: crypto.randomUUID(), consultationId: crypto.randomUUID(), revision: 1, narrative: 'Un vaso de leche.' }, store, { run: () => { calls++; return Promise.resolve({ status: 'completed', output: estimate, responseId: 'synthetic', usage: { input_tokens: 20, output_tokens: 100, cached_tokens: 0 } }); } });
  assert.deepEqual(result.output, estimate); assert.equal(calls, 1); assert.equal(settled, 1);
});
