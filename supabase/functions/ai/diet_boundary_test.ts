import { strict as assert } from 'node:assert';
import { Ajv } from 'ajv';
import { dietGenerationOutputSchema, parseDietModelOutput, FakeDietGenerator } from './diet-generation-domain.js';

const valid = { schema_version: 1, meal_options: [{ meal_ref: 'm1', entries: [{ candidate_ref: 'c1', portion_ref: 'base', multiplier: 1 }] }] };
const check = new Ajv({ strict: true }).compile(dietGenerationOutputSchema);
Deno.test('offline Edge runtime accepts the same schema as the shared runtime parser', () => {
  assert.equal(check(valid), true);
  assert.deepEqual(parseDietModelOutput(valid).data, valid);
});
for (const [label, patch] of [
  ['invented unit', { unit: 'kg' }], ['negative', { multiplier: -1 }],
  ['absurd', { multiplier: 1e12 }], ['non permitted fraction', { multiplier: 0.3 }],
  ['invented portion', { portion_ref: 'invented' }],
] as const) Deno.test(`offline Edge rejects ${label} in both validators`, () => {
  const value = structuredClone(valid);
  Object.assign(value.meal_options[0].entries[0], patch);
  assert.equal(check(value), false);
  assert.equal(parseDietModelOutput(value).data, undefined);
});
Deno.test('fake provider runs in Deno without network/env permission', async () => {
  const fake = new FakeDietGenerator(valid);
  assert.deepEqual(await fake.generate({ feature: 'diet_workshop', idempotencyKey: 'test', generationId: 'test', payload: {} }), valid);
});
