// Opt-in loopback-only test. Never accepts a remote Supabase URL.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {strict as assert} from 'node:assert';
const mode=process.argv[2];
assert.ok(['setup','preflight','real','approve'].includes(mode));
const local=JSON.parse(execFileSync('npx',['--yes','supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.equal(local.API_URL,'http://127.0.0.1:54321');
const owner='99999999-1111-4111-8111-111111111111',patient='99999999-2222-4222-8222-222222222222',consultation='99999999-3333-4333-8333-333333333333';
const key='99999999-4444-4444-8444-444444444444';
const reportPath='output/pes-http-real-20260922.json';
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
function sql(s){return execFileSync('docker',['exec','-i','supabase_db_Nuthrick','psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8'}).trim();}
async function api(path,body,token=local.SERVICE_ROLE_KEY,method='POST'){
  const response=await fetch(local.API_URL+path,{method,headers:{apikey:local.ANON_KEY,authorization:`Bearer ${token}`,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await response.text(); let data;try{data=JSON.parse(text);}catch{data={error:'non_json'};}
  return {status:response.status,data};
}
const email='pes-http-synthetic@example.test',password=randomUUID()+randomUUID();
if(mode==='setup') {
  if(sql(`select count(*) from auth.users where id='${owner}' and email=${q(email)}`)==='0') {
    const created=await api('/auth/v1/admin/users',{id:owner,email,password,email_confirm:true,user_metadata:{full_name:'PRUEBA LOCAL PES HTTP'}});
    assert.equal(created.status,200,JSON.stringify({status:created.status,error:created.data?.msg}));
  }
  const source=JSON.parse(readFileSync('supabase/functions/ai/fixtures/pes-real-calibration-20260922.json','utf8')).A;
  const keys=['main_reason','usual_pattern','access_barriers','pes_problem','pes_etiology','pes_evidence','pes_statement','treatment_objective'];
  const structure={sections:[{section_key:'clinical',questions:keys.map(question_key=>({question_key,response_area:'professional_assessment',type:'long_text'}))}]};
  sql(`begin;
    insert into public.professional_profiles(id,full_name) values('${owner}','PRUEBA LOCAL PES HTTP') on conflict(id) do nothing;
    insert into public.patients(id,professional_id,full_name) values('${patient}','${owner}','CASO A SINTÉTICO HTTP');
    insert into public.consultations(id,professional_id,patient_id) values('${consultation}','${owner}','${patient}');
    insert into public.consultation_snapshots(professional_id,consultation_id,patient_id,template_name,template_version,structure) values('${owner}','${consultation}','${patient}','Fixture HTTP',1,${q(JSON.stringify(structure))}::jsonb);
    ${source.exactInput.context.facts.filter(f=>f.source.startsWith('Entrevista')).map(f=>`insert into public.consultation_answers(professional_id,consultation_id,patient_id,question_key,section_key,response_area,value) values('${owner}','${consultation}','${patient}',${q(f.source.replace('Entrevista · ','').replaceAll(' ','_'))},'clinical','professional_assessment',${q(JSON.stringify(f.finding))}::jsonb);`).join('\n')}
    insert into public.nutrition_plans(professional_id,patient_id,consultation_id,title,target_calories,macro_distribution) values('${owner}','${patient}','${consultation}','FIXTURE HTTP NO PUBLICAR',2100,'{"macros":{"PROTEIN":{"grams":100}}}');
    insert into public.consultation_measurements(professional_id,consultation_id,patient_id,measurement_type_id,value,unit,data_type,measured_at) values('${owner}','${consultation}','${patient}','weight','70','kg','number','2026-09-21T12:00:00Z'),('${owner}','${consultation}','${patient}','height','170','cm','number','2026-09-21T12:00:00Z');
    insert into private.ai_accounts(professional_id,purchased_credits) values('${owner}',10);
    insert into private.ai_pilot_limits(professional_id,enabled) values('${owner}',true);
    insert into private.ai_feature_access(feature,professional_id,enabled) values('pes_diagnosis','${owner}',true);
    update private.ai_feature_config set enabled=true,model='gpt-5.6-terra',max_input_tokens=8192,max_output_tokens=1024,reasoning_level='low',temperature=null,timeout_ms=30000,input_usd_per_million=2,cached_usd_per_million=.2,output_usd_per_million=12 where feature='pes_diagnosis';
    commit;notify pgrst,'reload schema';`);
  console.log('Local synthetic A fixture created; no provider call.');process.exit(0);
}
assert.equal((await api(`/auth/v1/admin/users/${owner}`,{password},local.SERVICE_ROLE_KEY,'PUT')).status,200);
const login=await api('/auth/v1/token?grant_type=password',{email,password});
assert.equal(login.status,200);const token=login.data.access_token;
async function rpc(name,body){const r=await api('/rest/v1/rpc/'+name,body,token);assert.equal(r.status,name==='save_consultation_responses'?204:200,JSON.stringify(r.data));return r.data;}
const request={feature:'pes_diagnosis',idempotencyKey:key,patientId:patient,consultationId:consultation,revision:1};
if(mode==='preflight'){
  for(const [body,auth,status] of [[{},token,400],[null,token,400],[{...request,revision:null},token,400],[request,'invalid',401],[{...request,patientId:owner},token,409]]){
    const r=await api('/functions/v1/ai',body,auth);assert.equal(r.status,status,JSON.stringify(r.data));console.log({status:r.status,error:r.data.error??r.data.msg});
  }
  const context=await api('/rest/v1/rpc/ai_clinical_source',{p_owner:owner,p_patient:patient,p_consultation:consultation,p_revision:1});assert.equal(context.status,200,JSON.stringify(context.data));
  assert.ok(context.data.facts.some(f=>f.finding.includes('70 kg')));assert.ok(context.data.facts.some(f=>f.finding.includes('170 cm')));
  assert.equal(sql(`select count(*) from private.ai_generations where professional_id='${owner}'`),'0');
  console.log({auth:'real local session',facts:context.data.facts.length,providerCalls:0});
}
if(mode==='real'){
  assert.ok(!existsSync(reportPath),'Real call already attempted: STOP, never repeat automatically.');
  assert.equal(sql(`select count(*) from private.ai_generations where professional_id='${owner}'`),'0');
  writeFileSync(reportPath,JSON.stringify({attempted:true,request}),{flag:'wx'});
  const start=performance.now();const response=await api('/functions/v1/ai',request,token);const latency_ms=Math.round(performance.now()-start);
  const ledger=JSON.parse(sql(`select row_to_json(t) from (select id,status,model,input_tokens,output_tokens,cached_tokens,actual_cost,provider_response_id from private.ai_generations where professional_id='${owner}' and idempotency_key='${key}') t`));
  writeFileSync(reportPath,JSON.stringify({request,response,latency_ms,ledger},null,2));
  console.log({status:response.status,generationStatus:response.data.status,latency_ms,ledger});
  assert.equal(response.status,200);assert.equal(response.data.status,'succeeded');
}
if(mode==='approve'){
  const report=JSON.parse(readFileSync(reportPath,'utf8'));assert.equal(report.response.status,200);
  let goal=await rpc('clinical_objective',{p_consultation:consultation,p_revision:1});
  const before=sql(`select coalesce(jsonb_agg(to_jsonb(n)),'[]') from public.nutrition_plans n where professional_id='${owner}'`);
  if(!goal.pes){
    assert.equal(goal.pes,null);
    const workspace=await rpc('clinical_workspace',{p_consultation:consultation,p_revision:1});
    await rpc('clinical_workspace',{p_consultation:consultation,p_revision:1,p_kind:'pes',p_payload:{...report.response.data.output,stamp:workspace.stamp},p_generation:report.response.data.generationId});
  }else assert.equal(goal.pes.pesStatement,report.response.data.output.pesStatement,'Resume only same already-approved real response');
  goal=await rpc('clinical_objective',{p_consultation:consultation,p_revision:1});assert.ok(goal.pes);assert.equal(goal.objective,null);
  await rpc('save_consultation_responses',{target_consultation:consultation,expected_revision:1,responses:{treatment_objective:'Acordar un desayuno sencillo y revisar adherencia.'}});
  goal=await rpc('clinical_objective',{p_consultation:consultation,p_revision:1});
  await rpc('clinical_objective',{p_consultation:consultation,p_revision:1,p_action:'approve',p_stamp:goal.stamp,p_question_key:'treatment_objective'});
  goal=await rpc('clinical_objective',{p_consultation:consultation,p_revision:1});assert.ok(goal.objective.approved_at);assert.equal(goal.objective.revision,1);
  assert.equal(sql(`select coalesce(jsonb_agg(to_jsonb(n)),'[]') from public.nutrition_plans n where professional_id='${owner}'`),before);
  await rpc('save_consultation_responses',{target_consultation:consultation,expected_revision:1,responses:{usual_pattern:'Contexto modificado para prueba de invalidación.'}});
  goal=await rpc('clinical_objective',{p_consultation:consultation,p_revision:1});assert.equal(goal.pes,null);assert.equal(goal.objective,null);
  console.log('Full-schema HTTP persistence: independent approvals, provenance and invalidation pass; plans unchanged.');
}
