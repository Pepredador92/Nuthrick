// Real local Supabase Auth/Postgres + real Edge handler + networkless provider.
// All fixtures use a new synthetic professional per run; no remote URL accepted.
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const cli=process.env.SUPABASE_CLI||'supabase';
const local=JSON.parse(execFileSync(cli,['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.equal(local.API_URL,'http://127.0.0.1:54321');
const q=s=>"'"+String(s).replaceAll("'","''")+"'", j=v=>q(JSON.stringify(v))+'::jsonb';
const sql=s=>execFileSync('docker',['exec','-i','supabase_db_Nuthrick','psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8'}).trim();
const read=s=>JSON.parse(sql(s));
const fixture=JSON.parse(readFileSync('supabase/functions/ai/fixtures/diet-phase3.json','utf8')).A;
const owner=randomUUID(),other=randomUUID(),patient=randomUUID(),consultation=randomUUID(),planId=randomUUID(),free=randomUUID(),password=randomUUID()+randomUUID();
let token,otherToken,server,vite,passed=0;
const headers=auth=>({apikey:local.ANON_KEY,authorization:`Bearer ${auth}`,'content-type':'application/json'});
async function authUser(id){
 const email=`phase4c-${id}@example.test`;
 const c=await fetch(local.API_URL+'/auth/v1/admin/users',{method:'POST',headers:headers(local.SERVICE_ROLE_KEY),body:JSON.stringify({id,email,password,email_confirm:true})});assert.equal(c.status,200);
 const r=await fetch(local.API_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:headers(local.ANON_KEY),body:JSON.stringify({email,password})});assert.equal(r.status,200);return(await r.json()).access_token;
}
async function send(body,auth=token){const r=await fetch('http://127.0.0.1:54330',{method:'POST',headers:headers(auth),body:JSON.stringify(body)});return{status:r.status,data:await r.json()};}
function request(extra={}){return{feature:'diet_draft',idempotencyKey:randomUUID(),planId,patientId:patient,consultationId:consultation,revision:Number(sql(`select draft_revision from nutrition_plans where id='${planId}'`)),...extra};}
const draft=()=>read(`select to_jsonb(p) from nutrition_plans p where id='${planId}'`);
const versions=()=>sql(`select count(*) from nutrition_plan_versions where professional_id='${owner}'`);
const config=model=>sql(`update private.ai_feature_config set model=${q(model)},enabled=true,execution_mode='simulated',input_usd_per_million=0,cached_usd_per_million=0,output_usd_per_million=0,pricing_version='simulated-local-only' where feature='diet_draft';`);
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
async function start(enabled='true'){
 if(server){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
 server=spawn('deno',['run','--config','supabase/functions/ai/deno.json','--allow-read','--allow-env','--allow-net=127.0.0.1:54321,127.0.0.1:54330','scripts/serve-diet-test.ts'],{env:{...process.env,OPENAI_API_KEY:'',AI_SITE_URL:'http://127.0.0.1:4196',SUPABASE_URL:local.API_URL,SUPABASE_SERVICE_ROLE_KEY:local.SERVICE_ROLE_KEY,NUTHRICK_AI_ENABLED:enabled,NUTHRICK_DIET_TEST_MODE:'true',NUTHRICK_DIET_REAL_PROVIDER_ENABLED:'false'},stdio:['ignore','ignore','pipe']});
 await new Promise((resolve,reject)=>{server.stderr.on('data',b=>{if(String(b).includes('Listening'))resolve();});server.once('exit',()=>reject(Error('Local handler failed to start')));setTimeout(()=>reject(Error('Handler timeout')),15000).unref();});
}
const oldConfig=read("select to_jsonb(c) from private.ai_feature_config c where feature='diet_draft'");
try{
 token=await authUser(owner);otherToken=await authUser(other);
 const p=fixture.source.plan;
 const structure={sections:[{section_key:'clinical',questions:['pes_statement',...Object.keys(fixture.source.answers)].map(question_key=>({question_key,type:'long_text',response_area:'patient_reported'}))}]};
 sql(`begin;
 insert into professional_profiles(id,full_name,onboarding_completed) values('${owner}','PRUEBA LOCAL 4C',true),('${other}','PRUEBA LOCAL 4C B',true) on conflict(id) do update set onboarding_completed=true;
 insert into patients(id,professional_id,full_name) values('${patient}','${owner}','PRUEBA LOCAL FICTICIA 4C');
 insert into consultations(id,professional_id,patient_id) values('${consultation}','${owner}','${patient}');
 insert into consultation_snapshots(professional_id,consultation_id,patient_id,template_name,template_version,structure) values('${owner}','${consultation}','${patient}','Prueba local 4C',1,${j(structure)});
 ${Object.entries({...fixture.source.answers,pes_statement:{value:fixture.source.consultation.pes.statement,response_area:'professional_assessment'}}).map(([key,v])=>`insert into consultation_answers(professional_id,consultation_id,patient_id,revision,question_key,section_key,response_area,value) values('${owner}','${consultation}','${patient}',1,${q(key)},'clinical',${q(v.response_area)},${j(v.value)});`).join('\n')}
 update consultation_snapshots set clinical_records=${j({pes:fixture.source.consultation.pes,objective:fixture.source.consultation.objective})} where consultation_id='${consultation}';
 insert into nutrition_plans(id,professional_id,patient_id,consultation_id,title,target_calories,macro_distribution,exchange_prescription,meal_distribution) values('${planId}','${owner}','${patient}','${consultation}','PRUEBA LOCAL 4C',${p.target_calories},${j(p.macro_distribution)},${j(p.exchange_prescription)},${j(p.meal_distribution)});
 insert into nutrition_plans(id,professional_id,title) values('${free}','${owner}','PRUEBA LOCAL LIBRE 4C');
 insert into private.ai_accounts(professional_id,purchased_credits) values('${other}',0);
 insert into private.ai_pilot_limits(professional_id,enabled,max_total_generations,max_daily_generations) values('${owner}',true,100,20),('${other}',true,100,20);
 insert into private.ai_feature_access(feature,professional_id,enabled) values('diet_draft','${owner}',true),('diet_draft','${other}',true);
 commit;`);
 config('simulated-valid');await start();
 await test('authentication',async()=>assert.equal((await send(request(),'invalid')).status,401));
 await test('feature not authorized',async()=>{sql(`update private.ai_feature_access set enabled=false where professional_id='${other}' and feature='diet_draft'`);assert.equal((await send(request(),otherToken)).data.error,'feature_disabled');});
 await test('IA disabled kill switch',async()=>{await start('false');assert.equal((await send(request())).data.error,'feature_disabled');await start();});
 await test('canonical key / no owner injection',async()=>{assert.equal((await send(request({feature:'diet_workshop'}))).data.error,'feature_disabled');assert.equal((await send(request({professionalId:owner}))).status,400);});
 await test('missing plan',async()=>assert.equal((await send(request({planId:randomUUID()}))).data.error,'context_unavailable'));
 await test('foreign plan',async()=>{sql(`update private.ai_feature_access set enabled=true where professional_id='${other}' and feature='diet_draft'`);assert.equal((await send(request(),otherToken)).data.error,'context_unavailable');});
 await test('free plan respects IA3 boundary',async()=>{const r=request({planId:free,revision:1});delete r.patientId;delete r.consultationId;assert.equal((await send(r)).data.error,'context_unavailable');});
 await test('real server context / PES / objective / preferences / minimization',async()=>{const r=await send({...request(),action:'diet_preflight'});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.eligible,true,JSON.stringify(r.data.reasons));assert.equal(r.data.context.clinical.pes.fact.state,'known');assert.equal(r.data.context.clinical.objective.fact.state,'known');for(const x of [owner,patient,consultation,'PRUEBA LOCAL FICTICIA'])assert.ok(!JSON.stringify(r.data).includes(x));});
 await test('insufficient credits via HTTP; no account, no reservation',async()=>{assert.equal((await send(request())).data.error,'insufficient_credits');assert.equal(sql(`select count(*) from private.ai_generations where professional_id='${owner}'`),'0');sql(`insert into private.ai_accounts(professional_id,purchased_credits) values('${owner}',0);`);});
 let valid;
 await test('valid proposal; draft byte-identical; publication unchanged',async()=>{const before=draft(),v=versions();valid=await send(request());assert.equal(valid.status,200,JSON.stringify(valid.data));assert.equal(valid.data.output.validation.status,'valid');assert.deepEqual(draft(),before);assert.equal(versions(),v);});
 await test('idempotency concurrent and replay',async()=>{const req=request(),before=sql(`select count(*) from private.ai_generations where professional_id='${owner}'`);const [a,b]=await Promise.all([send(req),send(req)]);assert.equal(a.status,200,JSON.stringify(a.data));assert.equal(b.status,200,JSON.stringify(b.data));const c=await send(req);assert.equal(c.data.replay,true);assert.equal(a.data.generationId,b.data.generationId);assert.equal(Number(sql(`select count(*) from private.ai_generations where professional_id='${owner}'`)),Number(before)+1);});
 await test('B cannot read/apply A proposal',async()=>assert.equal((await send({action:'apply_diet_draft',generationId:valid.data.generationId,acceptDifferences:true},otherToken)).data.error,'context_unavailable'));
 await test('discard leaves draft intact',async()=>{const before=draft();const r=await send({action:'discard_diet_draft',generationId:valid.data.generationId});assert.equal(r.status,200);assert.deepEqual(draft(),before);});
 await test('alternative through same server with previous proposal',async()=>{const r=await send(request({previousProposalId:valid.data.generationId}));assert.equal(r.status,200,JSON.stringify(r.data));assert.notDeepEqual(r.data.output.validation.draft,valid.data.output.validation.draft);valid=r;});
 await test('apply atomic, draft only, prescription unchanged',async()=>{const before=draft(),v=versions();const r=await send({action:'apply_diet_draft',generationId:valid.data.generationId,acceptDifferences:true});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(draft().status,'draft');assert.notDeepEqual(draft().diet_menu,before.diet_menu);assert.deepEqual(draft().exchange_prescription,before.exchange_prescription);assert.deepEqual(draft().meal_distribution,before.meal_distribution);assert.equal(versions(),v);});
 // The existing 10/minute guard is intentionally not relaxed: age ONLY this
 // synthetic owner's local operational timestamps for subsequent scenarios.
 sql(`update private.ai_generations set started_at=now()-interval '2 minutes' where professional_id='${owner}'`);
 await test('replacement requires explicit confirmation',async()=>{valid=await send(request());assert.equal(valid.status,200,JSON.stringify(valid.data));const before=draft();assert.equal((await send({action:'apply_diet_draft',generationId:valid.data.generationId,acceptDifferences:true})).data.error,'replacement_confirmation_required');assert.deepEqual(draft(),before);});
 await test('forced apply failure rolls back entire transaction',async()=>{sql(`create function private.phase4c_fail() returns trigger language plpgsql as $$begin if new.professional_id='${owner}' then raise exception 'forced_test_failure'; end if; return new;end$$;create trigger phase4c_fail before update on nutrition_plans for each row execute function private.phase4c_fail();`);const before=draft();try{assert.notEqual((await send({action:'apply_diet_draft',generationId:valid.data.generationId,acceptDifferences:true,replaceExisting:true})).status,200);assert.deepEqual(draft(),before);assert.equal(sql(`select coalesce(workshop_decision,'null') from private.ai_generations where id='${valid.data.generationId}'`),'null');}finally{sql('drop trigger phase4c_fail on nutrition_plans;drop function private.phase4c_fail();');}});
 await test('stale context',async()=>{sql(`update nutrition_plans set title=title||' modificado' where id='${planId}'`);assert.equal((await send({action:'apply_diet_draft',generationId:valid.data.generationId,acceptDifferences:true,replaceExisting:true})).data.error,'context_changed');});
 await test('invalid structured output cannot apply',async()=>{config('simulated-invalid');assert.equal((await send(request())).data.error,'invalid_output');});
 await test('needs adjustment from deterministic validators',async()=>{config('simulated-adjustment');const r=await send(request());assert.equal(r.data.output.validation.status,'needs_adjustment');});
 await test('provider error settles zero',async()=>{config('simulated-error');assert.equal((await send(request())).data.error,'provider_rejected');});
 await test('zero monetary ledger, account unchanged, no versions',async()=>{assert.equal(sql(`select purchased_credits+reserved_included+reserved_purchased from private.ai_accounts where professional_id='${owner}'`),'0.000');assert.equal(Number(sql(`select coalesce(sum(charged_credits+coalesce(actual_cost,0)),0) from private.ai_generations where professional_id='${owner}'`)),0);assert.equal(versions(),'0');});
 if(process.argv.includes('--visual')){
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
  const captures=process.env.PHASE4C_CAPTURES;assert.ok(captures,'Use an external capture directory');mkdirSync(captures,{recursive:true});
  vite=spawn('./node_modules/.bin/vite',['--config','tests/visual/phase4c.vite.config.ts'],{cwd:'frontend',env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:4196/backend',VITE_SUPABASE_PUBLISHABLE_KEY:local.ANON_KEY},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{vite.stdout.on('data',b=>{if(String(b).includes('4196'))resolve();});vite.once('exit',()=>reject(Error('Vite failed')));setTimeout(()=>reject(Error('Vite timeout')),15000).unref();});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{for(const mode of ['valid','needs_adjustment','replace']){
   config(mode==='needs_adjustment'?'simulated-adjustment':'simulated-valid');
   sql(`update private.ai_generations set started_at=now()-interval '2 minutes' where professional_id='${owner}';update nutrition_plans set diet_menu=${mode==='replace'?j(draft().diet_menu):'null'} where id='${planId}';`);
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).hostname,'127.0.0.1','No external browser request allowed');return route.continue();});
   await page.addInitScript(({token,owner})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'local-unused',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:owner}})),{token,owner});
   await page.goto(`http://127.0.0.1:4196/tests/visual/taller-phase4c.html?plan=${planId}`);
   await page.getByRole('navigation',{name:'Secciones del Taller de dietas'}).getByRole('button',{name:'Menú',exact:true}).click();
   await page.getByRole('heading',{name:'Nuthrick a la Mesa'}).waitFor();
   if(mode==='valid')await page.screenshot({path:`${captures}/normal.png`,fullPage:true});
   await page.getByRole('button',{name:'Crear propuesta con IA',exact:true}).click();
   await page.getByRole('button',{name:'Revisar contexto',exact:true}).click();
   if(mode==='valid')await page.screenshot({path:`${captures}/context.png`});
   await page.getByRole('button',{name:'Generar propuesta',exact:true}).click();
   await page.getByRole('heading',{name:mode==='needs_adjustment'?'Requiere revisión':'Compatible con la prescripción',exact:true}).waitFor();
   const checkbox=page.getByRole('checkbox',{name:'Revisé las diferencias de la propuesta'});if(await checkbox.count())await checkbox.check();
   await page.screenshot({path:`${captures}/${mode}.png`});
   await page.getByRole('button',{name:'Aplicar al borrador',exact:true}).click();
   if(mode==='replace'){await page.getByRole('region',{name:'Confirmar reemplazo'}).waitFor();await page.screenshot({path:`${captures}/replace.png`});await page.getByRole('button',{name:'Reemplazar con propuesta IA',exact:true}).click();}
   await page.locator('dialog').waitFor({state:'detached'});assert.equal(await page.getByRole('heading',{name:'Nuthrick a la Mesa'}).count(),1);assert.deepEqual(errors,[]);await page.close();console.log('PASS real frontend → real local backend → preview → apply:',mode);
  }}finally{await browser.close();}
 }
 console.log(JSON.stringify({passed,openaiCalls:0,additionalCost:0,environment:'local real Auth/Postgres/handler, simulated provider'}));
}finally{
 server?.kill();
 vite?.kill();
 // Restore configuration, preserving all pre-existing local settings.
 sql(`update private.ai_feature_config set enabled=${oldConfig.enabled},execution_mode=${q(oldConfig.execution_mode)},model=${q(oldConfig.model)},input_usd_per_million=${oldConfig.input_usd_per_million},cached_usd_per_million=${oldConfig.cached_usd_per_million},output_usd_per_million=${oldConfig.output_usd_per_million},pricing_version=${q(oldConfig.pricing_version)} where feature='diet_draft';`);
 console.log('Synthetic local owner (no remote data):',owner);
}
