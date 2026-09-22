import {strict as assert} from 'node:assert';
import {localDietTestMode,SimulatedDietProvider} from './diet-provider-test.ts';
import {featureAdapter,parseRequest,type FeatureConfig} from './core.ts';
import {prepareDietSnapshot,prepareDietAlternative,validateSnapshot,verifyDietSnapshot} from './diet.ts';
import fixtures from './fixtures/diet-phase3.json' with {type:'json'};

Deno.test('test adapter requires explicit loopback; never activates hosted production',()=>{
 for(const url of ['https://qlsqhvyrslclmlstlemn.supabase.co','https://evil.invalid','https://127.0.0.1.evil.invalid'])assert.equal(localDietTestMode(url,'true'),false);
 assert.equal(localDietTestMode('http://127.0.0.1:54321','true'),true);
 assert.equal(localDietTestMode('http://127.0.0.1:54321',undefined),false);
 assert.throws(()=>featureAdapter('diet_workshop','diet_workshop@1'));
});
Deno.test('simulated structured response uses actual validators and zero usage, no fetch',async()=>{
 const snapshot=await prepareDietSnapshot(fixtures.A),provider=new SimulatedDietProvider();
 const config={feature:'diet_draft',model:'simulated-valid',execution_mode:'simulated'} as FeatureConfig;
 const input={config,...featureAdapter('diet_draft','diet_draft@1'),context:snapshot.prepared.payload,generationId:crypto.randomUUID()};
 const result=await provider.run(input);
 assert.deepEqual(result.usage,{input_tokens:0,output_tokens:0,cached_tokens:0});
 assert.equal(validateSnapshot(result.output,snapshot).status,'valid');
 assert.equal(validateSnapshot((await provider.run({...input,config:{...config,model:'simulated-invalid'}})).output,snapshot).status,'invalid');
 assert.equal(validateSnapshot((await provider.run({...input,config:{...config,model:'simulated-adjustment'}})).output,snapshot).status,'needs_adjustment');
 await assert.rejects(()=>provider.run({...input,config:{...config,execution_mode:'real'}}));
 const alternative=await prepareDietAlternative(fixtures.A,snapshot,validateSnapshot(result.output,snapshot).draft!);
 await verifyDietSnapshot(alternative);
 const second=await provider.run({...input,context:alternative.prepared.payload});
 assert.notDeepEqual(validateSnapshot(second.output,alternative).draft,validateSnapshot(result.output,snapshot).draft);
 await assert.rejects(()=>prepareDietAlternative(fixtures.A,snapshot,validateSnapshot(result.output,snapshot).draft!,['c9999']));
});
Deno.test('alternative request accepts only previous opaque ID and bounded candidate refs',()=>{
 const request={feature:'diet_draft',idempotencyKey:crypto.randomUUID(),planId:crypto.randomUUID(),revision:1,previousProposalId:crypto.randomUUID(),rejectedItems:['c1']};
 assert.deepEqual(parseRequest(request),request);
 for(const patch of [{previousProposalId:'bad'},{rejectedItems:['secret food']},{rejectedItems:Array(31).fill('c1')},{professionalId:crypto.randomUUID()},{model:'simulated-valid'},{execution_mode:'simulated'}])assert.throws(()=>parseRequest({...request,...patch}));
});
