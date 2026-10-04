import {strict as assert} from 'node:assert';
import fixtures from './fixtures/diet-phase3.json' with {type:'json'};
import {prepareDietSnapshot} from './diet.ts';

Deno.test('preflight HTTP is authenticated, read-only, scoped and never calls a provider',async()=>{
  const nativeFetch=fetch,nativeServe=Deno.serve;
  const env={SUPABASE_URL:'http://mock.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake-service',OPENAI_API_KEY:'fake-key',NUTHRICK_AI_ENABLED:'true',NUTHRICK_DIET_REAL_PROVIDER_ENABLED:'true'};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,Deno.env.get(k)]));
  for(const [k,v]of Object.entries(env))Deno.env.set(k,v);
  let server:Deno.HttpServer|undefined,port=0,mode='ok';
  const owner=fixtures.A.source.plan.professional_id,calls:string[]=[];
  const savedSnapshot=await prepareDietSnapshot(fixtures.A);
  const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
  globalThis.fetch=async(input,init)=>{
    const url=String(input);if(url.startsWith('http://127.0.0.1:'))return nativeFetch(input,init);
    calls.push(url);
    if(url.endsWith('/auth/v1/user'))return new Headers(init?.headers).get('authorization')==='Bearer valid'?json({id:owner,is_anonymous:false}):json({message:'unauthorized'},401);
    const body=JSON.parse(String(init?.body));
    if(url.endsWith('ai_diet_draft')){
      assert.equal(body.p_owner,owner);
      if(body.p_action==='get')return json({snapshot:savedSnapshot,status:'succeeded',result:{validation:{status:'valid',issues:[]}}});
      assert.equal(body.p_action,'apply');
      if(mode==='apply-permission')return json({code:'42501',message:'permission denied for function valid_diet_supplements'},403);
      if(mode==='apply-stale')return json({code:'P0001',message:'context_changed'},400);
      return json({ok:true,plan:fixtures.A.source.plan});
    }
    if(url.endsWith('ai_diet_source')){assert.equal(body.p_owner,owner);const source=structuredClone(fixtures.A);if(mode==='guided'){source.source.plan.updated_at='2026-10-03T12:00:00Z';source.source.plan.exchange_prescription=null as never;source.source.plan.meal_distribution=null as never;source.source.consultation.pes=null as never;source.source.consultation.objective=null as never;}return mode==='foreign'?json({message:'context_unavailable'},403):json(source);}
    if(url.endsWith('ai_server')){assert.equal(body.p_action,'config');assert.equal(body.p_data.feature,'diet_draft');return json({enabled:mode!=='disabled'});}
    if(url.endsWith('ai_balance')){assert.equal(new Headers(init?.headers).get('authorization'),'Bearer valid');return json({available_credits:mode==='budget'?0:100});}
    throw Error('Unexpected external request '+url);
  };
  Deno.serve=((handler:Deno.ServeHandler)=>{server=nativeServe({hostname:'127.0.0.1',port:0,onListen:a=>{port=a.port;}},handler);return server;}) as typeof Deno.serve;
  try {
    await import('./index.ts');
    const plan=fixtures.A.source.plan;
    const request={action:'diet_preflight',feature:'diet_draft',idempotencyKey:crypto.randomUUID(),planId:plan.id,revision:1,patientId:plan.patient_id,consultationId:plan.consultation_id,narrative:'Desayuno para llevar'};
    const send=async(body:unknown,auth='valid')=>{const r=await nativeFetch(`http://127.0.0.1:${port}/functions/v1/ai`,{method:'POST',headers:{authorization:`Bearer ${auth}`,'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
    assert.equal((await send(request,'wrong')).status,401);
    assert.equal((await send({...request,owner:'other'})).status,400);
    const ok=await send(request);assert.equal(ok.status,200);assert.equal(ok.data.eligible,true);assert.equal(ok.data.context.professional_instructions.fact.value,'Desayuno para llevar');
    for(const hidden of [plan.id,plan.patient_id,'candidate_ref','manifest','fake-key','fake-service'])assert.ok(!JSON.stringify(ok.data).includes(hidden));
    mode='guided';const guided=await send({...request,guidance:{version:1,objective:'Organizar las comidas',contextReviewed:true,reactionReview:'recorded',meals:[{name:'Desayuno',type:'BREAKFAST',time:'08:00',options:1},{name:'Comida',type:'MAIN_MEAL',time:null,options:1},{name:'Cena',type:'DINNER',time:'20:00',options:1}]}});assert.equal(guided.data.eligible,true);assert.equal(guided.data.context.clinical.objective.fact.value,'Organizar las comidas');
    mode='budget';assert.ok((await send(request)).data.reasons.some((r:{code:string})=>r.code==='insufficient_credits'));
    mode='disabled';assert.ok((await send(request)).data.reasons.some((r:{code:string})=>r.code==='feature_disabled'));
    mode='foreign';assert.equal((await send(request)).status,409);
    const apply={action:'apply_diet_draft',generationId:crypto.randomUUID(),acceptDifferences:true};
    mode='apply-permission';const failed=await send(apply);assert.equal(failed.status,503);assert.deepEqual(failed.data,{error:'draft_save_failed'});
    mode='apply-stale';const stale=await send(apply);assert.equal(stale.status,409);assert.deepEqual(stale.data,{error:'context_changed'});
    const beforeRetry=calls.length;mode='apply-ok';const retry=await send(apply);assert.equal(retry.status,200);assert.equal(retry.data.ok,true);
    assert.deepEqual(calls.slice(beforeRetry).map(u=>u.split('/').pop()),['user','ai_diet_draft','ai_diet_draft'],'retry only retrieves/applies the saved proposal, with no reservation or generation');
    assert.ok(calls.every(url=>url.startsWith('http://mock.invalid/')));
  } finally {await server?.shutdown();globalThis.fetch=nativeFetch;Deno.serve=nativeServe;for(const [k,v]of Object.entries(previous))if(v===undefined)Deno.env.delete(k);else Deno.env.set(k,v);}
});
