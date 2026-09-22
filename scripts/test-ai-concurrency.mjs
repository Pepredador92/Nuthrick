// Independent local Postgres sessions; disposable DB/roles, never the Supabase project.
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const suffix=randomUUID().replaceAll('-','').slice(0,12);
const database=`nuthrick_ai_test_${suffix}`;
const roles=['anon','authenticated','service_role'];
const remap=sql=>roles.reduce((text,role)=>text.replaceAll(new RegExp(`\\b${role}\\b`,'g'),`${role}_${suffix}`),sql);
function run(db,sql) { const result=spawnSync('psql',['-X','-h','/tmp','-d',db,'-v','ON_ERROR_STOP=1','-At'],{input:sql,encoding:'utf8'}); if(result.status!==0)throw new Error(result.stderr);return result.stdout.trim(); }
const children=[];let created=false;
try {
  run('postgres',`create database ${database};`);created=true;
  const fixture=readFileSync(new URL('./test-ai-core.sql',import.meta.url),'utf8').split('-- MIGRATION --')[0];
  const migration=readFileSync(new URL('../supabase/migrations/20260922005406_ai_core_credit_ledger.sql',import.meta.url),'utf8');
  run(database,remap(`${fixture}\n${migration}\ncommit;`));
  const owner='00000000-0000-0000-0000-000000000001';
  run(database,`insert into public.professional_profiles values('${owner}');
    update private.ai_feature_config set enabled=true,model='test',pricing_version='test',max_input_tokens=8000,max_output_tokens=2000,input_usd_per_million=1,cached_usd_per_million=0.5,output_usd_per_million=2 where feature='core_check';
    select public.ai_grant_credits('${owner}','${randomUUID()}','PURCHASE',1.2);`);
  const reserve=key=>`select public.ai_server('reserve','${owner}',jsonb_build_object('feature','core_check','idempotency_key','${key}','request_hash',repeat('a',64),'config',public.ai_server('config','${owner}','{"feature":"core_check"}')));`;
  function session(app) {
    const child=spawn('psql',['-X','-h','/tmp','-d',database,'-v','ON_ERROR_STOP=1','-At'],{env:{...process.env,PGAPPNAME:app}});children.push(child);
    let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
    const done=new Promise(resolve=>child.on('close',code=>resolve({code,output,error})));return {child,done,output:()=>output};
  }
  async function until(predicate) { const deadline=Date.now()+10000;while(!predicate()){if(Date.now()>deadline)throw new Error('Concurrency synchronization timed out');await new Promise(r=>setTimeout(r,25));} }
  const key=randomUUID();const first=session(`ai-first-${suffix}`);
  first.child.stdin.write(`begin;set local role service_role_${suffix};${reserve(key)}select 'first-held';\n`);
  await until(()=>first.output().includes('first-held'));
  const second=session(`ai-second-${suffix}`);second.child.stdin.end(`set role service_role_${suffix};${reserve(randomUUID())}`);
  await until(()=>run(database,`select count(*) from pg_stat_activity where datname='${database}' and application_name='ai-second-${suffix}' and wait_event_type='Lock';`)==='1');
  first.child.stdin.end('commit;\n');assert.equal((await first.done).code,0);
  const loser=await second.done;assert.notEqual(loser.code,0);assert.match(loser.error,/insufficient_credits/);
  assert.equal(run(database,'select count(*) from private.ai_generations;'),'1');
  assert.equal(run(database,'select reserved_purchased from private.ai_accounts;'),'1.200');
  assert.equal(JSON.parse(run(database,reserve(key))).created,false);
  const generation=run(database,'select id from private.ai_generations;');
  run(database,`select public.ai_server('claim','${owner}','{"generation_id":"${generation}"}');`);
  const settle=`select public.ai_server('settle','${owner}','{"generation_id":"${generation}","status":"succeeded","input_tokens":1000,"output_tokens":100,"cached_tokens":0}');`;
  const settlers=Array.from({length:5},()=>{const s=session(`ai-settle-${suffix}`);s.child.stdin.end(settle);return s.done;});
  for(const result of await Promise.all(settlers))assert.equal(result.code,0,result.error);
  assert.equal(run(database,"select count(*) from private.ai_credit_ledger where type='USAGE';"),'1');
  assert.equal(run(database,'select purchased_credits from private.ai_accounts;'),'1.080');
  console.log('PASS: simultaneous reservations cannot overspend; concurrent settlements charge exactly once');
} finally {
  for(const child of children)if(child.exitCode===null)child.kill();
  if(created){run('postgres',`drop database ${database} with (force);`);for(const role of roles)run('postgres',`drop role if exists ${role}_${suffix};`);}
}
