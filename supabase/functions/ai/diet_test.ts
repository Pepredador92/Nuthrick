import {strict as assert} from 'node:assert';
import fixtures from './fixtures/diet-phase3.json' with {type:'json'};
import {prepareDietSnapshot,verifyDietSnapshot,validateSnapshot,DietRoutingProvider} from './diet.ts';
import {FakeDietGenerator} from './diet-generation-domain.js';
import {dietDraftAdapter} from './diet-contract.ts';
import {AIError,OpenAIResponsesProvider,runAIRequest,parseRequest,type AIStore,type Usage,type FeatureConfig,type ProviderInput} from './core.ts';

const config:FeatureConfig={feature:'diet_draft',enabled:true,provider:'openai',model:'gpt-5.6-terra',prompt_version:'diet_draft@1',max_input_tokens:24000,max_output_tokens:4096,timeout_ms:1000,reasoning_level:'low',temperature:null};
const usage={input_tokens:100,output_tokens:50,cached_tokens:0};
export function fakeOutput(payload: {meals:Array<{meal_ref:string;distribution:Array<{group_code:string;portions:number}>;candidates:Array<{candidate_ref:string;type:string;exchanges:Array<{group_code:string;portions:number}>}>}>}) {
  return {schema_version:1,meal_options:payload.meals.map(m=>({meal_ref:m.meal_ref,entries:m.distribution.map(g=>({candidate_ref:m.candidates.find(c=>c.type==='food'&&c.exchanges.some(e=>e.group_code===g.group_code))!.candidate_ref,portion_ref:'base',multiplier:g.portions}))}))};
}
async function harness(mode='ok') {
  const loaded=structuredClone(fixtures.A);
  loaded.source.consultation.pes.statement+=' SENTINELA IDENTIDAD private@example.test 5512345678';
  loaded.source.consultation.objective.pes_statement=loaded.source.consultation.pes.statement;
  const snapshot=await prepareDietSnapshot(loaded), out=fakeOutput(snapshot.prepared.payload);
  let calls=0,reserves=0,recorded=false,settled: {status:string;usage:Usage}|null=null,uncertain=false;
  const r={feature:'diet_draft',idempotencyKey:crypto.randomUUID(),planId:loaded.source.plan.id,patientId:loaded.source.plan.patient_id,consultationId:loaded.source.plan.consultation_id,revision:1};
  const store:AIStore={config:async()=>config,context:async()=>{if(mode==='foreign')throw new AIError('context_unavailable');return{stamp:snapshot.sourceStamp,context:snapshot.prepared.payload};},
    reserve:async()=>{if(mode==='budget')throw new AIError('insufficient_credits');return{created:++reserves===1,generation:{id:'generation',status:reserves>1?'succeeded':'reserved',charged_credits:0}};},
    bindContext:async()=>{if(mode==='stale')throw new AIError('context_changed');},claim:async()=>true,
    settle:async(_id,status,u)=>{settled={status,usage:u};return{id:'generation',status,charged_credits:1};},uncertain:async()=>{uncertain=true;},
    validateOutput:o=>validateSnapshot(o,snapshot).status!=='invalid',recordResult:async()=>{if(mode==='post')throw Error('storage unavailable');recorded=true;}};
  const fake=new FakeDietGenerator(()=>out);
  const provider=new DietRoutingProvider({run:async(input:ProviderInput)=>{calls++;
    if(mode==='timeout') throw new AIError('provider_outcome_unknown',true);
    if(mode==='provider') throw new AIError('provider_rejected');
    const serialized=JSON.stringify(input);
    for(const secret of loaded.identifiers) assert.ok(!serialized.includes(secret),'PII in final provider input');
    assert.ok(!serialized.includes(loaded.source.plan.patient_id));
    return {status:'completed',usage,responseId:'fake',model:'recorded-model',output:await fake.generate({feature:'diet_draft',generationId:'generation',idempotencyKey:r.idempotencyKey,payload:input.context})};}});
  return {snapshot,out,run:()=>runAIRequest(r,store,provider),state:()=>({calls,reserves,recorded,settled,uncertain})};
}
for(const kind of ['A','B','C'] as const) Deno.test(`snapshot fixture ${kind}: valid, deterministic, private, immutable`,async()=>{
  const s=await prepareDietSnapshot(fixtures[kind]); await verifyDietSnapshot(JSON.parse(JSON.stringify(s)));
  assert.equal(validateSnapshot(fakeOutput(s.prepared.payload),s).status,'valid');
  assert.throws(()=>{s.prepared.payload.meals[0].name='tamper';});
  const bad=structuredClone(s); bad.prepared.manifest.meals[0].candidates[0].candidate.baseQuantity=999;
  await assert.rejects(()=>verifyDietSnapshot(bad),/snapshot_invalid/);
  if(kind==='B') assert.ok(!s.prepared.manifest.meals.flatMap(m=>m.candidates).some(c=>Object.keys(fixtures.B.source.plan.diet_menu!.food_preferences).includes(c.candidate.sourceId)));
  if(kind==='C') assert.equal(s.prepared.payload.preferences.eating_pattern.fact.state,'unknown');
});
Deno.test('A/G fake generation, nutrition recalculation and no publication',async()=>{
  const h=await harness();await h.run();assert.equal(h.state().calls,1);assert.equal(h.state().settled!.status,'succeeded');
  const v=validateSnapshot(h.out,h.snapshot);assert.equal(v.draft!.status,'editing');assert.equal(v.draft!.confirmed_at,null);
  assert.equal(Reflect.get(v.draft!,'week_plan'),null);assert.ok(v.totals!.energy_kcal>0);assert.equal(v.requiresTargetReview,true);
  h.out.meal_options[0].entries[0].multiplier=8;assert.equal(validateSnapshot(h.out,h.snapshot).status,'needs_adjustment');
});
for(const mode of ['candidate','unit','meal','hard','schema'] as const) Deno.test(`B–F ${mode}: rejected but confirmed usage billed`,async()=>{
  const h=await harness();
  if(mode==='candidate'||mode==='hard')h.out.meal_options[0].entries[0].candidate_ref='excluded-invented';
  if(mode==='unit')Object.assign(h.out.meal_options[0].entries[0],{unit:'kg'});
  if(mode==='meal')h.out.meal_options[0].meal_ref='invented';
  if(mode==='schema')Object.assign(h.out,{energy_kcal:0});
  await assert.rejects(h.run,/invalid_output/);assert.deepEqual(h.state().settled,{status:'invalid_output',usage});
});
for(const mode of ['timeout','provider','post','stale','budget','foreign'])Deno.test(`H–O ${mode}: controlled accounting`,async()=>{
  const h=await harness(mode);await assert.rejects(h.run);
  if(['budget','foreign','stale'].includes(mode))assert.equal(h.state().calls,0);
  if(mode==='post')assert.deepEqual(h.state().settled,{status:'failed',usage});
  if(mode==='provider'||mode==='stale')assert.deepEqual(h.state().settled?.usage,{input_tokens:0,output_tokens:0,cached_tokens:0});
  if(mode==='timeout')assert.equal(h.state().uncertain,true);
});
Deno.test('K concurrent and sequential replay dispatch only once',async()=>{
  const h=await harness();await Promise.all([h.run(),h.run()]);await h.run();assert.equal(h.state().calls,1);
});
Deno.test('L response is validated against A, not mutated source B',async()=>{
  const loaded=structuredClone(fixtures.A),s=await prepareDietSnapshot(loaded),out=fakeOutput(s.prepared.payload);
  loaded.source.catalog.foods[0].portion_amount=999;
  const v=validateSnapshot(out,s);assert.equal(v.status,'valid');assert.notEqual((await prepareDietSnapshot(loaded)).hash,s.hash);
});
Deno.test('M detects existing manual menu without persisting its entries or identity',async()=>{
  const loaded=structuredClone(fixtures.A);Object.assign(loaded.source.plan.diet_menu!,{meal_options:[{entries:[{text:'PRIVATE MANUAL NOTE'}]}]});
  const s=await prepareDietSnapshot(loaded);assert.equal(s.hasManualMenu,true);assert.ok(!JSON.stringify(s).includes('PRIVATE MANUAL NOTE'));
});
Deno.test('client cannot supply model, candidates, prescriptions or rules',()=>{
  const r={feature:'diet_draft',idempotencyKey:crypto.randomUUID(),planId:fixtures.A.source.plan.id,revision:1};
  for(const key of ['model','owner','payload','policy','rejectedFoodIds','target_calories'])assert.throws(()=>parseRequest({...r,[key]:'injected'}));
  // Phase 4B allows only the existing fingerprinted narrative as bounded instructions.
  assert.throws(()=>parseRequest({...r,narrative:{prompt:'injected'}}));
  assert.throws(()=>parseRequest({...r,narrative:'x'.repeat(1201)}));
});
Deno.test('provider schema regression: every node has explicit supported type, literals use typed enums',()=>{
  function check(s:Record<string,unknown>){
    assert.ok(['object','array','string','number','boolean','null','integer'].includes(String(s.type)),'Provider requires explicit type even for literals');
    if(s.type==='object') {
      assert.equal(s.additionalProperties,false);
      assert.deepEqual([...(s.required as string[])].sort(),Object.keys(s.properties as object).sort());
      for(const v of Object.values(s.properties as object))check(v);
    }
    if(s.type==='array')check(s.items as Record<string,unknown>);
  }
  assert.throws(()=>check({const:1}));assert.throws(()=>check({const:'base'}));
  check(dietDraftAdapter.schema);
});
Deno.test('real adapter transport uses strict schema, captures model/latency, never retries diet calls',async()=>{
  const h=await harness();let count=0;
  const provider=new OpenAIResponsesProvider('test',async(_url,init)=>{count++;const b=JSON.parse(String(init?.body));
    assert.equal(b.store,false);assert.equal(b.text.format.strict,true);
    assert.deepEqual(b.text.format.schema,dietDraftAdapter.schema);
    return new Response(JSON.stringify({model:'returned-model',id:'resp_fake',status:'completed',usage:{input_tokens:100,output_tokens:50,total_tokens:150},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(h.out)}]}]}));});
  const result=await new DietRoutingProvider(provider).run({config,context:h.snapshot.prepared.payload,instructions:'ignored',schema:{},generationId:'test'});
  assert.equal(result.model,'returned-model');assert.equal(count,1);assert.ok(result.latencyMs!>=0);
  const reject=new OpenAIResponsesProvider('test',async()=>{count++;return new Response('{}',{status:429});});
  await assert.rejects(()=>new DietRoutingProvider(reject).run({config,context:h.snapshot.prepared.payload,instructions:'',schema:{},generationId:'test'}));assert.equal(count,2);
});
