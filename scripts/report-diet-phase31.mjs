// Offline artifact extraction. No network, provider, database or plan mutations.
import {readFileSync,writeFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const attempts=read('output/diet-phase31/real-attempts.json');
assert.deepEqual(attempts.map(a=>a.case),['A','C']);
assert.equal(read('output/diet-phase3/real-attempts.json').length,4);
const fixtures=[],summaries=[];
let microTotal=0n;
for(const kind of ['A','C']) {
  const r=read(`output/diet-phase31/real-${kind}.json`);
  const provider=read(`output/diet-phase31/provider-${kind}.json`);
  assert.equal(r.response.status,200);assert.equal(r.applied.status,200);
  assert.equal(r.request.patientId,`88888888-2222-4222-8222-00000000000${kind==='A'?1:3}`);
  assert.equal(r.ledger.id,attempts.find(a=>a.case===kind).generationId);
  const output=JSON.parse(provider.response.find(x=>x.type==='message').content.find(x=>x.type==='output_text').text);
  const v=r.response.data.output.validation;
  const micros=BigInt(r.usage.input_tokens-r.usage.input_tokens_details.cached_tokens)*2n+BigInt(r.usage.output_tokens)*12n;
  // This calibration had no cached tokens; do not silently apply this shortcut otherwise.
  assert.equal(r.usage.input_tokens_details.cached_tokens,0);
  assert.equal(Number(micros)/1e6,r.ledger.actual_cost);microTotal+=micros;
  assert.deepEqual(r.payload,r.evidence.snapshot.prepared.payload);
  const credits=r.evidence.credits;
  assert.deepEqual(credits.map(c=>c.type).sort(),['RELEASE','RESERVE','USAGE']);
  const reserved=credits.find(c=>c.type==='RESERVE').reserved_purchased_delta;
  assert.equal(credits.find(c=>c.type==='RELEASE').reserved_purchased_delta,-reserved);
  assert.equal(credits.find(c=>c.type==='USAGE').purchased_delta,-r.ledger.charged_credits);
  fixtures.push({case:kind,generationId:r.ledger.id,requestedModel:r.requestedModel,returnedModel:r.returnedModel,
    usage:r.usage,cost:r.ledger.actual_cost,snapshot:r.evidence.snapshot,output,validation:v,
    appliedMenu:r.evidence.menu,planStatus:r.evidence.planStatus,publishedVersions:r.evidence.publishedVersions,credits});
  summaries.push({case:kind,generationId:r.ledger.id,requestedModel:r.requestedModel,returnedModel:r.returnedModel,
    usage:r.usage,latencyMs:r.latencyMs,cost:r.ledger.actual_cost,payloadBytes:r.payloadBytes,inputEstimate:r.inputEstimate,
    pools:r.payload.meals.map(m=>({meal:m.meal_ref,total:m.candidates.length,foods:m.candidates.filter(c=>c.type==='food').length,recipes:m.candidates.filter(c=>c.type==='recipe').length})),
    status:v.status,totals:v.totals,differences:v.differences,requiresTargetReview:v.requiresTargetReview,
    snapshotHash:r.evidence.snapshot.hash,reservedCredits:reserved,chargedCredits:r.ledger.charged_credits,
    unusedCredits:Number((reserved-r.ledger.charged_credits).toFixed(3))});
}
const json=JSON.stringify(fixtures,null,2);
for(const marker of ['SENTINELA IDENTIDAD','private@example.test','+525512345678','sk-proj-','GOCSPX-'])assert.ok(!json.includes(marker));
writeFileSync('supabase/functions/ai/fixtures/diet-real-phase31.json',json+'\n');
const summary={newCalls:2,historicalPhase3Calls:6,cases:summaries,baseline:0.035996,phase31Cost:Number(microTotal)/1e6,accumulated:Number(35996n+microTotal)/1e6};
writeFileSync('output/diet-phase31/summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
