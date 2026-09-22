import {strict as assert} from 'node:assert';
import fixtures from './fixtures/diet-phase3.json' with {type:'json'};
import {dietPreflight} from './diet-ux.ts';
import {prepareDietSnapshot} from './diet.ts';
import {parseRequest} from './core.ts';

Deno.test('UX preflight reuses eligibility, redacts identifiers and omits manifests',async()=>{
  const loaded=structuredClone(fixtures.A);
  loaded.source.consultation.pes.statement+=' private@example.test';
  loaded.source.consultation.objective.pes_statement=loaded.source.consultation.pes.statement;
  const r=await dietPreflight(loaded,true,true);
  assert.equal(r.eligible,true);
  const text=JSON.stringify(r);
  for(const hidden of [loaded.source.plan.id,loaded.source.plan.patient_id,loaded.source.stamp,'candidate_ref','catalog','manifest','private@example.test'])assert.ok(!text.includes(hidden));
  const blocked=await dietPreflight(loaded,false,false);
  assert.ok(blocked.reasons.some((r:{code:string})=>r.code==='feature_disabled'));
  assert.ok(blocked.reasons.some((r:{code:string})=>r.code==='insufficient_credits'));
  loaded.source.consultation.pes=null as never;
  assert.ok((await dietPreflight(loaded,true,true)).reasons.some((r:{code:string})=>r.code==='pes_approval_required'));
});
Deno.test('UX context uses the exact projection sent to the provider, unknown stays unknown',async()=>{
  const loaded=structuredClone(fixtures.C);
  const context=(await dietPreflight(loaded,true,true)).context;
  const payload=(await prepareDietSnapshot(loaded)).prepared.payload;
  for(const key of ['clinical','prescription','preferences','restrictions','routine','professional_instructions'] as const)assert.deepEqual(context[key],payload[key]);
  assert.equal(context.preferences.eating_pattern.fact.state,'unknown');
  assert.deepEqual(context.meals,payload.meals.map((m:{name:string})=>m.name));
});
Deno.test('bounded diet instructions use existing fingerprinted narrative and reach snapshot redacted',async()=>{
  const loaded=structuredClone(fixtures.A);
  const request={feature:'diet_draft',idempotencyKey:crypto.randomUUID(),planId:loaded.source.plan.id,patientId:loaded.source.plan.patient_id,consultationId:loaded.source.plan.consultation_id,revision:1,narrative:'Desayuno para llevar private@example.test'};
  const parsed=parseRequest(request);
  const source={...loaded,source:{...loaded.source,additionalInstructions:parsed.narrative}};
  const snapshot=await prepareDietSnapshot(source);
  const fact=snapshot.prepared.payload.professional_instructions.fact;
  assert.equal(fact.state,'known');if(fact.state==='known'){assert.ok(fact.value.includes('Desayuno para llevar'));assert.ok(!fact.value.includes('private@example.test'));}
  assert.throws(()=>parseRequest({...request,narrative:'x'.repeat(1201)}));
  assert.throws(()=>parseRequest({...request,narrative:{prompt:'bad'}}));
  assert.throws(()=>parseRequest({...request,feature:'diet_workshop'}));
  assert.notEqual((await dietPreflight(source,true,true)).contextToken,(await dietPreflight(loaded,true,true)).contextToken);
});
