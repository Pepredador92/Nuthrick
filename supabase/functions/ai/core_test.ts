import { strict as assert } from 'node:assert';
import { AIError, type AIStore, type FeatureConfig, type Generation, OpenAIResponsesProvider, parseRequest, readUsage, runAIRequest, validOutput } from './core.ts';

const config: FeatureConfig = { feature:'core_check',enabled:true,provider:'openai',model:'test-model',prompt_version:'core_check@1',max_input_tokens:8000,max_output_tokens:1000,timeout_ms:1000,reasoning_level:null,temperature:null };
const request = { feature:'core_check',idempotencyKey:'00000000-0000-0000-0000-000000000001' };
class Store implements AIStore {
  generation: Generation | null = null; settlements: unknown[] = []; claims=0; enough=true;
  config() { return Promise.resolve(config); }
  reserve() { if (!this.enough) throw new AIError('insufficient_credits'); const created=!this.generation; this.generation ??= { id:'generation',status:'reserved',charged_credits:0 }; return Promise.resolve({ generation:this.generation,created }); }
  claim() { this.claims++; this.generation!.status='running'; return Promise.resolve(true); }
  settle(_id:string,status:string,usage:unknown) { this.settlements.push(usage); this.generation!.status=status; return Promise.resolve(this.generation!); }
  uncertain() { this.generation!.status='uncertain'; return Promise.resolve(); }
}
const ok = { status:'completed',output:{ok:true},usage:{input_tokens:20,output_tokens:10,cached_tokens:0},responseId:'resp_test' };
const response = (overrides:Record<string,unknown>={}) => new Response(JSON.stringify({ id:'resp_test',status:'completed',usage:{input_tokens:20,output_tokens:10,total_tokens:30,input_tokens_details:{cached_tokens:3}},output:[{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}],...overrides }),{status:200});
const providerInput = {config,instructions:'Return ok',context:{check:'test'},schema:{type:'object'},generationId:'gen'};

Deno.test('PES uses server context and the same reserve/settle pipeline',async()=>{
  const store:AIStore & Store=new Store();store.config=()=>Promise.resolve({...config,feature:'pes_diagnosis',prompt_version:'pes_diagnosis@1'});
  const facts=[{source:'Entrevista',finding:'Dato real'}];let bound=false;
  store.context=()=>Promise.resolve({context:{facts},stamp:'v1'});store.bindContext=()=>{bound=true;return Promise.resolve();};
  const output={problem:'Borrador',etiology:'Por revisar',signsSymptoms:['Dato real'],pesStatement:'Borrador',evidence:facts,missingContext:[],uncertainties:[]};
  const result=await runAIRequest({...request,feature:'pes_diagnosis',revision:1},store,{run:i=>{assert.equal(bound,true);assert.deepEqual(i.context,{facts});return Promise.resolve({...ok,output});}});
  assert.deepEqual(result.output,output);assert.equal(store.settlements.length,1);
});
Deno.test('foreign clinical context rejects before reservation and provider',async()=>{
  const store:AIStore & Store=new Store();store.config=()=>Promise.resolve({...config,feature:'pes_diagnosis',prompt_version:'pes_diagnosis@1'});
  store.context=()=>Promise.reject(new AIError('context_unavailable'));store.bindContext=()=>Promise.resolve();
  await assert.rejects(()=>runAIRequest({...request,feature:'pes_diagnosis'},store,{run:()=>{throw new Error('must never dispatch');}}),/context_unavailable/);assert.equal(store.generation,null);
});

Deno.test('insufficient credits means zero provider calls',async () => {
  const store=new Store();store.enough=false;let calls=0;
  await assert.rejects(()=>runAIRequest(request,store,{run:()=>{calls++;return Promise.resolve(ok);}}),/insufficient_credits/);assert.equal(calls,0);
});
Deno.test('concurrent same-key requests only dispatch once',async () => {
  const store=new Store();let calls=0;
  await Promise.all(Array.from({length:8},()=>runAIRequest(request,store,{run:()=>{calls++;return Promise.resolve(ok);}})));
  assert.equal(calls,1);assert.equal(store.settlements.length,1);
});
Deno.test('valid result settles actual usage',async () => {
  const store=new Store();const result=await runAIRequest(request,store,{run:()=>Promise.resolve(ok)});
  assert.deepEqual(result.output,{ok:true});assert.deepEqual(store.settlements,[ok.usage]);
});
Deno.test('invalid structured result is charged but never returned',async () => {
  const store=new Store();await assert.rejects(()=>runAIRequest(request,store,{run:()=>Promise.resolve({...ok,output:{diagnosis:'unexpected'}})}),/invalid_output/);
  assert.equal(store.generation?.status,'invalid_output');assert.deepEqual(store.settlements,[ok.usage]);
});
Deno.test('incomplete result never returns clinical data',async () => {
  const store=new Store();await assert.rejects(()=>runAIRequest(request,store,{run:()=>Promise.resolve({...ok,status:'incomplete'})}),/invalid_output/);
});
Deno.test('pre-consumption rejection releases credits',async () => {
  const store=new Store();await assert.rejects(()=>runAIRequest(request,store,{run:()=>Promise.reject(new AIError('provider_rejected'))}),/provider_rejected/);
  assert.deepEqual(store.settlements,[{input_tokens:0,output_tokens:0,cached_tokens:0}]);
});
Deno.test('network uncertainty retains reservation; replay never calls provider',async () => {
  const store=new Store();let calls=0;const provider={run:()=>{calls++;return Promise.reject(new AIError('unknown',true));}};
  await assert.rejects(()=>runAIRequest(request,store,provider),/provider_outcome_unknown/);
  await runAIRequest(request,store,provider);assert.equal(calls,1);assert.equal(store.generation?.status,'uncertain');assert.equal(store.settlements.length,0);
});
Deno.test('clinical adapters cannot run without server-owned context',async () => {
  const store=new Store();store.config=()=>Promise.resolve({...config,feature:'pes_diagnosis',prompt_version:'pes_diagnosis@1'});
  await assert.rejects(()=>runAIRequest({...request,feature:'pes_diagnosis'},store,{run:()=>Promise.resolve(ok)}),/context_unavailable/);assert.equal(store.generation,null);
});
Deno.test('request cannot override professional, key, prompt, model or clinical payload',() => {
  for (const k of ['professionalId','prompt','model','apiKey','context','name','email']) assert.throws(()=>parseRequest({...request,[k]:'injected'}),/invalid_request/);
  assert.throws(()=>parseRequest({...request,consultationId:request.idempotencyKey}),/invalid_request/);
  assert.deepEqual(parseRequest(request),request);
});
Deno.test('Responses uses structured outputs, no storage, no identifiers in body',async () => {
  let sent:Record<string,unknown>={};
  const provider=new OpenAIResponsesProvider('test-only',(_url,init)=>{sent=JSON.parse(String(init?.body));return Promise.resolve(response());});
  const result=await provider.run(providerInput);assert.equal(sent.store,false);assert.equal(sent.background,false);assert.equal(sent.model,'test-model');
  assert.equal(JSON.stringify(sent).includes('gen'),false);assert.equal(JSON.stringify(sent).includes('test-only'),false);
  assert.equal((sent.text as {format:{type:string}}).format.type,'json_schema');assert.equal(result.usage.cached_tokens,3);
});
Deno.test('429 retries once with same correlation identifier',async () => {
  const ids:string[]=[];let calls=0;const provider=new OpenAIResponsesProvider('test',(_u,init)=>{calls++;ids.push((init?.headers as Record<string,string>)['X-Client-Request-Id']);return Promise.resolve(calls===1?new Response('',{status:429}):response());},()=>Promise.resolve());
  await provider.run(providerInput);assert.equal(calls,2);assert.deepEqual(ids,['gen','gen']);
});
Deno.test('5xx and transport errors never retried',async () => {
  for (const transportError of [false,true]) { let calls=0;const provider=new OpenAIResponsesProvider('test',()=>{calls++;return transportError?Promise.reject(new Error('secret body')):Promise.resolve(new Response('secret body',{status:500}));});
    await assert.rejects(()=>provider.run(providerInput),error=>error instanceof AIError && error.uncertain && !error.message.includes('secret'));assert.equal(calls,1); }
});
Deno.test('input upper bound prevents oversized context dispatch',async () => {
  let calls=0;const provider=new OpenAIResponsesProvider('test',()=>{calls++;return Promise.resolve(response());});
  await assert.rejects(()=>provider.run({...providerInput,context:'a'.repeat(9000)}),/input_too_large/);assert.equal(calls,0);
});
Deno.test('malformed or absent usage is uncertain, never assumed free',() => {
  for(const value of [null,{}, {input_tokens:2,output_tokens:3,total_tokens:4}, {input_tokens:2,output_tokens:3,total_tokens:5,input_tokens_details:{cached_tokens:4}}]) assert.throws(()=>readUsage(value),/usage_unknown/);
});
Deno.test('JSON schema validation rejects unknown fields and wrong types',() => {
  const schema={type:'object',properties:{n:{type:'number'}},required:['n'],additionalProperties:false};
  assert.equal(validOutput(schema,{n:1}),true);assert.equal(validOutput(schema,{n:'1'}),false);assert.equal(validOutput(schema,{n:1,extra:true}),false);
});
