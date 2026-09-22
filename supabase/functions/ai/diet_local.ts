/** Opt-in loopback integration/calibration. Runs the exact production index.ts
 * over HTTP, real local Auth/Postgres/ledger, fake or strictly capped provider.
 * Usage: deno run -A --config supabase/functions/ai/deno.json .../diet_local.ts fake|real
 */
import {strict as assert} from 'node:assert';
import fixtures from './fixtures/diet-phase3.json' with {type:'json'};

const mode=Deno.args[0];assert.ok(['fake','real'].includes(mode));
// Explicit corrective opt-in only after diagnosis + offline regression. Never
// automatically retry failed cases; retain the initial A/B/C evidence.
const corrective=mode==='real'&&Deno.args[1]==='--corrective';
// Separate, durable two-call authorization. Never reuse/reset Phase 3 evidence.
const closure=mode==='real'&&Deno.args[1]==='--phase31';
const directory=closure?'output/diet-phase31':'output/diet-phase3';
const attemptFile=directory+'/real-attempts.json';
async function readAttempts():Promise<Array<Record<string,unknown>>>{try{return JSON.parse(await Deno.readTextFile(attemptFile));}catch(e){if(e instanceof Deno.errors.NotFound)return[];throw e;}}
if(closure)assert.equal((await readAttempts()).length,0,'STOP: Phase 3.1 already started; no reruns authorized');
const owner=fixtures.A.source.plan.professional_id;
async function command(args:string[],input?:string) {
  const c=new Deno.Command(args[0],{args:args.slice(1),stdin:input===undefined?'null':'piped',stdout:'piped',stderr:'piped'}).spawn();
  if(input!==undefined){const w=c.stdin.getWriter();await w.write(new TextEncoder().encode(input));await w.close();}
  const o=await c.output();if(!o.success)throw Error(new TextDecoder().decode(o.stderr));return new TextDecoder().decode(o.stdout).trim();
}
const local=JSON.parse(await command(['npx','--yes','supabase','status','-o','json']));
assert.equal(local.API_URL,'http://127.0.0.1:54321');
const q=(s:unknown)=>"'"+String(s).replaceAll("'","''")+"'";
const sql=(s:string)=>command(['docker','exec','-i','supabase_db_Nuthrick','psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],s);
const nativeFetch=globalThis.fetch,nativeServe=Deno.serve;
async function api(path:string,body:unknown,token=local.SERVICE_ROLE_KEY,method='POST') {
  const response=await nativeFetch(local.API_URL+path,{method,headers:{apikey:local.ANON_KEY,authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return{status:response.status,data:await response.json()};
}
const email='diet-phase3-synthetic@example.test',password=crypto.randomUUID()+crypto.randomUUID();
const existing=await sql(`select email from auth.users where id=${q(owner)}`);
if(!existing)assert.equal((await api('/auth/v1/admin/users',{id:owner,email,password,email_confirm:true})).status,200);
else {assert.equal(existing,email);assert.equal((await api('/auth/v1/admin/users/'+owner,{password},local.SERVICE_ROLE_KEY,'PUT')).status,200);}
await sql(`insert into public.professional_profiles(id,full_name) values(${q(owner)},'PRUEBA LOCAL DIET PHASE3') on conflict(id) do nothing;
 insert into private.ai_accounts(professional_id,purchased_credits) values(${q(owner)},100) on conflict(professional_id) do nothing;
 insert into private.ai_pilot_limits(professional_id,enabled,max_total_generations,max_daily_generations,max_daily_credits) values(${q(owner)},true,100,20,100) on conflict(professional_id) do update set enabled=true;
 insert into private.ai_feature_access(feature,professional_id,enabled) values('diet_draft',${q(owner)},true) on conflict(feature,professional_id) do update set enabled=true;
 update private.ai_feature_config set enabled=true where feature='diet_draft';`);
// Only exact synthetic-owned catalog IDs can be reused. No updates to catalog.
for(const f of fixtures.A.source.catalog.foods) {
  const found=await sql(`select owner_id from public.food_items where id=${q(f.id)}`);if(found){assert.equal(found,owner);continue;}
  await sql(`insert into public.food_items(id,owner_id,name,normalized_name,exchange_system_code,exchange_catalog_version,group_code,portion_amount,portion_unit,portion_description,attributes,source,source_version,is_custom)
    values(${q(f.id)},${q(owner)},${q(f.name)},${q(f.normalized_name)},${q(f.exchange_system_code)},${q(f.exchange_catalog_version)},${q(f.group_code)},${f.portion_amount},${q(f.portion_unit)},${q(f.portion_description)},'{}','LOCAL_PHASE3','1',true);`);
}
for(const item of Object.values(fixtures)) {
  const p=item.source.plan,c=item.source.consultation;
  const found=await sql(`select professional_id from public.patients where id=${q(p.patient_id)}`);
  if(found){assert.equal(found,owner);continue;}
  await sql(`begin;
    insert into public.patients(id,professional_id,full_name,email,phone,country_code) values(${q(p.patient_id)},${q(owner)},'SENTINELA IDENTIDAD','private@example.test','+525512345678','+52');
    insert into public.consultations(id,professional_id,patient_id) values(${q(p.consultation_id)},${q(owner)},${q(p.patient_id)});
    insert into public.consultation_snapshots(professional_id,consultation_id,patient_id,template_name,template_version,structure)
     values(${q(owner)},${q(p.consultation_id)},${q(p.patient_id)},'LOCAL PHASE3',1,'{"sections":[]}');
    ${Object.entries({...item.source.answers,pes_statement:{value:c.pes.statement,response_area:'professional_assessment'}}).map(([key,a])=>`insert into public.consultation_answers(professional_id,consultation_id,patient_id,question_key,section_key,response_area,value) values(${q(owner)},${q(p.consultation_id)},${q(p.patient_id)},${q(key)},'synthetic',${q(a.response_area)},${q(JSON.stringify(a.value))}::jsonb);`).join('\n')}
    update public.consultation_snapshots set clinical_records=${q(JSON.stringify({pes:c.pes,objective:c.objective}))}::jsonb where consultation_id=${q(c.id)} and professional_id=${q(owner)};
    commit;`);
}
const login=await api('/auth/v1/token?grant_type=password',{email,password});assert.equal(login.status,200);const token=login.data.access_token;
const envKeys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','OPENAI_API_KEY','NUTHRICK_AI_ENABLED'];
const previous=Object.fromEntries(envKeys.map(k=>[k,Deno.env.get(k)]));
let apiKey='fake-provider';
if(mode==='real') {
  const env=await Deno.readTextFile('supabase/functions/.env');apiKey=env.match(/^OPENAI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'')??'';
  assert.ok(apiKey,'Missing local provider key');
}
Deno.env.set('SUPABASE_URL',local.API_URL);Deno.env.set('SUPABASE_SERVICE_ROLE_KEY',local.SERVICE_ROLE_KEY);Deno.env.set('OPENAI_API_KEY',apiKey);Deno.env.set('NUTHRICK_AI_ENABLED','true');
let port=0,server:Deno.HttpServer,providerCalls=0,currentCase='',providerRecord:Record<string,unknown>={};
await Deno.mkdir(directory,{recursive:true});
const lockFile=directory+'/real-calibration.lock';
if(mode==='real') {const lock=await Deno.open(lockFile,{write:true,createNew:true});lock.close();}
globalThis.fetch=async(input,init)=>{
  if(String(input)!=='https://api.openai.com/v1/responses')return nativeFetch(input,init);
  providerCalls++;const body=JSON.parse(String(init?.body)),payload=JSON.parse(body.input);
  for(const excluded of ['SENTINELA IDENTIDAD','private@example.test','5512345678',owner])assert.ok(!body.input.includes(excluded),'Privacy regression');
  providerRecord={case:currentCase,requestedModel:body.model,payload,inputEstimate:Math.ceil(body.input.length/4),payloadBytes:new TextEncoder().encode(body.input).length,
    candidatesPerMeal:payload.meals.map((m:{meal_ref:string;candidates:unknown[]})=>({meal:m.meal_ref,count:m.candidates.length})),generationId:new Headers(init?.headers).get('X-Client-Request-Id')};
  if(mode==='fake') {
    const output={schema_version:1,meal_options:payload.meals.map((m:{meal_ref:string;distribution:Array<{group_code:string;portions:number}>;candidates:Array<{type:string;candidate_ref:string;exchanges:Array<{group_code:string}>}>})=>({meal_ref:m.meal_ref,entries:m.distribution.map(g=>({candidate_ref:m.candidates.find(c=>c.type==='food'&&c.exchanges.some(e=>e.group_code===g.group_code))!.candidate_ref,portion_ref:'base',multiplier:g.portions}))}))};
    return Response.json({id:'resp_fake_'+crypto.randomUUID(),model:body.model,status:'completed',usage:{input_tokens:100,output_tokens:100,total_tokens:200},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(output)}]}]});
  }
  const attempts=await readAttempts();assert.ok(attempts.length<(closure?2:corrective?4:3),'Absolute real-call budget exhausted');
  if(closure) {
    assert.equal(currentCase,attempts.length===0?'A':'C','Only A then C authorized');
    if(currentCase==='C') {
      const a=JSON.parse(await Deno.readTextFile(directory+'/real-A.json'));
      assert.equal(a.response.status,200);assert.equal(a.applied.status,200);
      assert.ok(['valid','needs_adjustment'].includes(a.response.data.output.validation.status));
    }
  }
  if(corrective)assert.equal(attempts.length,3,'Corrective request must be exactly the fourth');
  assert.ok(!attempts.some(a=>a.case===currentCase),'Case already attempted; no automatic retries');
  attempts.push({case:currentCase,generationId:providerRecord.generationId,at:new Date().toISOString()});await Deno.writeTextFile(attemptFile,JSON.stringify(attempts,null,2));
  const started=performance.now();const response=await nativeFetch(input,init);
  const copy=await response.clone().json();providerRecord={...providerRecord,httpStatus:response.status,returnedModel:copy.model??null,usage:copy.usage??null,providerStatus:copy.status??null,latencyMs:Math.round(performance.now()-started),response:copy.output??null,
    errorCode:copy.error?.code??null,errorType:copy.error?.type??null};
  await Deno.writeTextFile(directory+`/provider-${currentCase}.json`,JSON.stringify(providerRecord,null,2));
  return response;
};
Deno.serve=((handler:Deno.ServeHandler)=>{server=nativeServe({hostname:'127.0.0.1',port:0,onListen:a=>{port=a.port;}},handler);return server;}) as typeof Deno.serve;
try {
  await import('./index.ts');
  async function request(body:unknown,auth=token){const r=await nativeFetch(`http://127.0.0.1:${port}/functions/v1/ai`,{method:'POST',headers:{authorization:`Bearer ${auth}`,'content-type':'application/json'},body:JSON.stringify(body)});return{status:r.status,data:await r.json()};}
  for(const kind of (closure?['A','C']:corrective?['B']:['A','B','C']) as Array<'A'|'B'|'C'>) {
    currentCase=corrective?'B-corrective':kind;
    if(mode==='real')assert.ok(!(await readAttempts()).some(a=>a.case===currentCase),'STOP: real case already attempted');
    const fixture=structuredClone(fixtures[kind]),p=fixture.source.plan,planId=crypto.randomUUID();
    const prefs=kind==='B'?structuredClone(fixtures.B.source.plan.diet_menu.food_preferences):{};
    // Make hard exclusions meaningful even with the existing system catalog:
    // exclude every other owned/system cereal whose name begins with tortilla.
    if(kind==='B') {
      const ids=JSON.parse(await sql("select coalesce(jsonb_agg(id),'[]') from public.food_items where active and owner_id is null and normalized_name ilike '%tortilla%'"));
      for(const id of ids)Object.assign(prefs,{[id]:'exclude'});Object.assign(p.diet_menu!,{food_preferences:prefs});
    }
    if(mode==='fake'&&kind==='B')Object.assign(p.diet_menu!,{meal_options:[{id:'manual',entries:[],status:'draft'}]});
    await sql(`insert into public.nutrition_plans(id,professional_id,patient_id,consultation_id,title,target_calories,macro_distribution,exchange_prescription,meal_distribution,diet_menu)
      values(${q(planId)},${q(owner)},${q(p.patient_id)},${q(p.consultation_id)},${q(p.title+' '+mode)},${p.target_calories},${q(JSON.stringify(p.macro_distribution))}::jsonb,${q(JSON.stringify(p.exchange_prescription))}::jsonb,${q(JSON.stringify(p.meal_distribution))}::jsonb,${q(JSON.stringify(p.diet_menu))}::jsonb);`);
    const req={feature:'diet_draft',idempotencyKey:crypto.randomUUID(),planId,patientId:p.patient_id,consultationId:p.consultation_id,revision:1};
    if(mode==='fake'&&kind==='A') {
      assert.equal((await request(req,'invalid')).status,401);
      assert.equal((await request({...req,patientId:owner})).status,409);
      assert.equal((await request({...req,model:'override'})).status,400);
      await sql(`update private.ai_accounts set enabled=false where professional_id=${q(owner)}`);assert.equal((await request(req)).data.error,'account_disabled');await sql(`update private.ai_accounts set enabled=true where professional_id=${q(owner)}`);
      assert.equal(providerCalls,0);
    }
    const responses=mode==='fake'&&kind==='A'?await Promise.all([request(req),request(req)]):[await request(req)];
    const response=responses.find(r=>r.data.output)??responses[0];
    if(mode==='fake'&&kind==='A'){assert.equal(providerCalls,1);assert.ok(responses.some(r=>r.data.replay));}
    if(response.status!==200) {console.log({case:kind,response});if(mode==='fake')throw Error('Fake HTTP failed');}
    const id=response.data.generationId??await sql(`select id from private.ai_generations where professional_id=${q(owner)} and idempotency_key=${q(req.idempotencyKey)}`);
    const ledger=id?JSON.parse(await sql(`select to_jsonb(g) from (select id,status,model,input_tokens,output_tokens,cached_tokens,actual_cost,charged_credits,estimated_cost,provider_response_id from private.ai_generations where id=${q(id)}) g`)):null;
    let applied:unknown=null;
    if(response.status===200) {
      const replay=await request(req);assert.equal(replay.data.replay,true);assert.equal(replay.data.generationId,id);
      const blocked=await request({action:'apply_diet_draft',generationId:id});
      assert.equal(blocked.status,409);
      if(mode==='fake'&&kind==='B')assert.equal(blocked.data.error,'replacement_confirmation_required');
      if(mode==='fake'&&kind==='C') {
        await sql(`update public.nutrition_plans set title=title||' stale' where id=${q(planId)}`);
        assert.equal((await request({action:'apply_diet_draft',generationId:id,replaceExisting:true,acceptDifferences:true})).data.error,'context_changed');
      } else {
        applied=await request({action:'apply_diet_draft',generationId:id,replaceExisting:true,acceptDifferences:true});
        assert.equal((applied as {status:number}).status,200,JSON.stringify(applied));
        assert.equal((await request({action:'apply_diet_draft',generationId:id,replaceExisting:true,acceptDifferences:true})).data.replay,true);
      }
      assert.equal(await sql(`select count(*) from public.nutrition_plan_versions where plan_id=${q(planId)}`),'0');
      assert.equal(await sql(`select status from public.nutrition_plans where id=${q(planId)}`),'draft');
      assert.equal(await sql(`select count(*) from private.ai_credit_ledger where generation_id=${q(id)} and type='USAGE'`),'1');
      await assert.rejects(()=>sql(`update private.ai_diet_snapshots set snapshot='{}' where generation_id=${q(id)}`),/immutable_snapshot/);
    }
    const evidence=closure&&id?JSON.parse(await sql(`select jsonb_build_object('snapshot',s.snapshot,'result',s.result,'planStatus',p.status,'menu',p.diet_menu,'publishedVersions',(select count(*) from public.nutrition_plan_versions v where v.plan_id=p.id),'credits',(select jsonb_agg(to_jsonb(l)) from private.ai_credit_ledger l where l.generation_id=s.generation_id)) from private.ai_diet_snapshots s join public.nutrition_plans p on p.id=s.plan_id where s.generation_id=${q(id)} and p.professional_id=${q(owner)}`)):null;
    const report={...providerRecord,request:req,response,ledger,applied,...(closure?{evidence}:{})};
    await Deno.writeTextFile(directory+`/${mode}-${currentCase}.json`,JSON.stringify(report,null,2));
    console.log({case:currentCase,status:response.status,validation:response.data.output?.validation?.status,ledger,calls:providerCalls});
    if(closure)assert.equal(response.status,200,'STOP: failed case; no further calls authorized');
  }
  console.log({mode,providerCalls,paidCalls:mode==='real'?providerCalls:0});
} finally {
  await server!?.shutdown();globalThis.fetch=nativeFetch;Deno.serve=nativeServe;
  for(const [k,v] of Object.entries(previous))if(v===undefined)Deno.env.delete(k);else Deno.env.set(k,v);
  await sql("update private.ai_feature_config set enabled=false where feature='diet_draft'");
  if(mode==='real') await Deno.remove(lockFile);
}
