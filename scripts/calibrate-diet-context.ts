/** Explicit one-shot local calibration. Never enables production or uses patients.
 * --check has zero network/key access; --real requires the existing local secret.
 * Durable attempt marker is NEVER removed or reset, even after failure. */
import { strict as assert } from 'node:assert';
import fixtures from '../supabase/functions/ai/fixtures/diet-phase3.json' with {type:'json'};
import { prepareDietSnapshot, validateSnapshot } from '../supabase/functions/ai/diet.ts';
import { OpenAIResponsesProvider, featureAdapter, type FeatureConfig } from '../supabase/functions/ai/core.ts';

assert.ok(['--check','--real'].includes(Deno.args[0]));
const loaded = structuredClone(fixtures.B);
const foods = loaded.source.catalog.foods.slice(0,3);
const enriched = { ...loaded, source: { ...loaded.source,
  confirmedRecall: { approved_at:'2026-09-22T12:00:00Z', items:foods.map(f=>({mealLabel:'Desayuno',quantity:f.portion_amount,unit:f.portion_unit,food:f})) },
  anthropometry:{weightKg:70,heightCm:170,bmi:24.2,waistCm:80},
} };
assert.ok(Object.values(loaded.source.plan.diet_menu.food_preferences).includes('exclude'));
// A compatible familiar preference, without changing any hard exclusion.
const preferred = loaded.source.catalog.foods.find(f=>!(f.id in loaded.source.plan.diet_menu.food_preferences))!;
Object.assign(enriched.source.plan.diet_menu.food_preferences,{[preferred.id]:'like'});
const before=await prepareDietSnapshot(loaded), snapshot=await prepareDietSnapshot(enriched);
const adapter=featureAdapter('diet_draft','diet_draft@2');
const upper=new TextEncoder().encode(adapter.instructions+JSON.stringify(snapshot.prepared.payload)+JSON.stringify(adapter.schema)).length+2048;
const maxInput=Math.ceil(upper/100)*100, maxOutput=1024;
const maximumUsd=(maxInput*2+maxOutput*12)/1e6;
const metadata={model:'gpt-5.6-terra',promptVersion:'diet_draft@2',before:before.prepared.size,after:snapshot.prepared.size,
  conservativeInputUpperBound:upper,maxInput,maxOutput,maximumUsd,snapshotHash:snapshot.hash};
console.log(metadata);
assert.ok(maximumUsd<=0.05,'STOP: conservative maximum exceeds authorized USD 0.05');
const payload=JSON.stringify(snapshot.prepared.payload);
assert.ok(snapshot.prepared.payload.clinical.recall24h);
assert.ok(snapshot.prepared.payload.clinical.anthropometry);
assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(payload));
if(Deno.args[0]==='--check')Deno.exit(0);
const directory='output/diet-phase4e';
await Deno.mkdir(directory,{recursive:true});
const env=await Deno.readTextFile('supabase/functions/.env');
const key=env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'')??'';
assert.ok(key,'STOP: no local provider key');
const lock=await Deno.open(directory+'/real-attempt.json',{write:true,createNew:true});
const generationId=crypto.randomUUID();
await lock.write(new TextEncoder().encode(JSON.stringify({...metadata,generationId,startedAt:new Date().toISOString()})));lock.close();
let calls=0;
const provider=new OpenAIResponsesProvider(key,async(input,init)=>{
  assert.equal(String(input),'https://api.openai.com/v1/responses');
  assert.equal(++calls,1,'No retry authorized');return fetch(input,init);
});
const config:FeatureConfig={feature:'diet_draft',enabled:true,provider:'openai',model:'gpt-5.6-terra',prompt_version:'diet_draft@2',
  max_input_tokens:maxInput,max_output_tokens:maxOutput,timeout_ms:60000,reasoning_level:'low',temperature:null,max_provider_attempts:1};
try {
  const result=await provider.run({config,...adapter,context:snapshot.prepared.payload,generationId});
  const validation=validateSnapshot(result.output,snapshot);
  const cost=((result.usage.input_tokens-result.usage.cached_tokens)*2+result.usage.cached_tokens*0.2+result.usage.output_tokens*12)/1e6;
  const evidence={...metadata,providerCalls:calls,status:result.status,usage:result.usage,latencyMs:result.latencyMs,costUsd:cost,
    accumulatedUsd:Math.round((0.127375+cost)*1e9)/1e9,validation:{status:validation.status,issues:validation.issues,totals:validation.totals,requiresTargetReview:validation.requiresTargetReview},
    output:result.output,context:snapshot.prepared.payload,responseId:result.responseId,requestId:result.requestId,
    productionEnabled:false,applied:false,persistedPatient:false,accounting:'isolated calibration; not charged to a professional credit account'};
  await Deno.writeTextFile(directory+'/result.json',JSON.stringify(evidence,null,2));
  console.log({calls,status:result.status,usage:result.usage,latencyMs:result.latencyMs,costUsd:cost,validation:evidence.validation});
  assert.ok(cost<=0.05);
}catch(e){console.error({calls,error:e instanceof Error?e.name:'unknown',retryAuthorized:false});throw e;}
// No enabled switch or server process persists: this process exits. Production
// feature access and both provider kill switches were never changed.
