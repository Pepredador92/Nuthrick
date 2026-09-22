// Disposable local database; real concurrent PostgreSQL sessions; no HTTP/provider.
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const suffix=randomUUID().replaceAll('-','').slice(0,12), database=`nuthrick_budget_test_${suffix}`;
const roles=['anon','authenticated','service_role'];
const remap=s=>roles.reduce((v,r)=>v.replaceAll(new RegExp(`\\b${r}\\b`,'g'),`${r}_${suffix}`),s);
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
function run(s,db=database){const r=spawnSync('psql',['-X','-h','/tmp','-d',db,'-v','ON_ERROR_STOP=1','-At'],{input:s,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const reserve=(key=randomUUID(),who=owner)=>`public.ai_server('reserve','${who}',jsonb_build_object('feature','core_check','idempotency_key','${key}','request_hash',repeat('a',64),'config',public.ai_server('config','${who}','{"feature":"core_check"}')))`;
const act=(kind,id,extra='',who=owner)=>`public.ai_server('${kind}','${who}',jsonb_build_object('generation_id','${id}'::uuid${extra}))`;
const settle=(id,status='succeeded',tokens=1000)=>act('settle',id,`, 'status','${status}','input_tokens',${tokens},'output_tokens',0,'cached_tokens',0`);
const check=(expr,label)=>`select test_assert(${expr},'${label}');`;
const reject=(query,error)=>`select test_reject($q$${query}$q$,'${error}');`;
const active=`private.ai_daily_committed('${owner}',clock_timestamp())`;
let created=false,tests=0;const children=[];
function test(name,body){run(`begin;${body}rollback;`);console.log('PASS '+name);tests++;}
function session(app){const c=spawn('psql',['-X','-h','/tmp','-d',database,'-v','ON_ERROR_STOP=1','-At'],{env:{...process.env,PGAPPNAME:app}});children.push(c);let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);const done=new Promise(resolve=>c.on('close',code=>resolve({code,out,err})));return {c,done,out:()=>out};}
async function until(f){const end=Date.now()+10000;while(!f()){if(Date.now()>end)throw Error('Lock synchronization timeout');await new Promise(r=>setTimeout(r,20));}}
try {
  run(`create database ${database}`,'postgres');created=true;
  const fixture=read('./test-ai-core.sql').split('-- MIGRATION --')[0];
  const files=['20260922005406_ai_core_credit_ledger.sql','20260922010129_ai_cost_precision.sql','20260922030609_ai4_pilot_controls.sql','20260922045147_ai_atomic_daily_budget.sql'];
  run(remap(fixture+files.map(f=>read('../supabase/migrations/'+f)).join('\n')+'commit;'));
  run(`create function test_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'assertion: %',label;end if;end$$;
    create function test_reject(q text,want text) returns void language plpgsql as $$begin begin execute q;exception when others then if sqlerrm like '%'||want||'%' then return;end if;raise;end;raise exception 'Expected %',want;end$$;
    insert into professional_profiles values('${owner}'),('${other}');
    insert into private.ai_accounts(professional_id,purchased_credits) values('${owner}',100),('${other}',100);
    insert into private.ai_pilot_limits(professional_id,enabled,max_total_generations,max_daily_generations,max_daily_credits) values('${owner}',true,100,20,5),('${other}',true,100,20,5);
    update private.ai_feature_config set enabled=true,model='mock',pricing_version='test',max_input_tokens=10000,max_output_tokens=1024,input_usd_per_million=3,cached_usd_per_million=0,output_usd_per_million=0 where feature='core_check';
    insert into private.ai_feature_access values('core_check','${owner}',true,now()),('core_check','${other}',true,now());`);
  test('reservation below budget',`select ${reserve()};${check(`${active}=3`,'reserved 3')}`);
  test('reservation exactly remaining',`update private.ai_feature_config set input_usd_per_million=5 where feature='core_check';select ${reserve()};${check(`${active}=5`,'exact 5')}`);
  test('exceeds by .001',`update private.ai_feature_config set input_usd_per_million=5.001 where feature='core_check';${reject('select '+reserve(),'pilot_daily_budget')}${check('(select count(*)=0 from private.ai_generations)','no write')}`);
  test('6.337 reservation rejected at 5',`update private.ai_feature_config set input_usd_per_million=6.337 where feature='core_check';${reject('select '+reserve(),'pilot_daily_budget')}`);
  test('active reservations plus new one',`select ${reserve()};${reject('select '+reserve(),'pilot_daily_budget')}${check(`${active}=3`,'only first')}`);
  // Named generation lets subsequent SQL exercise actual settlement rather than fabricated ledger values.
  const key=randomUUID();
  const prepare=`select ${reserve(key)};`;
  const id=`(select id from private.ai_generations where idempotency_key='${key}')`;
  const settleExpr=(status,tokens)=>`public.ai_server('settle','${owner}',jsonb_build_object('generation_id',${id},'status','${status}','input_tokens',${tokens},'output_tokens',0,'cached_tokens',0))`;
  const claim=`select public.ai_server('claim','${owner}',jsonb_build_object('generation_id',${id}));`;
  test('confirmed usage plus new reservation',prepare+claim+`select ${settleExpr('succeeded',10000)};${reject('select '+reserve(),'pilot_daily_budget')}`);
  test('original .601 + 2.868 + 2.868 regression',`update private.ai_feature_config set input_usd_per_million=.601 where feature='core_check';${prepare}${claim}select ${settleExpr('succeeded',10000)};update private.ai_feature_config set input_usd_per_million=2.868 where feature='core_check';select ${reserve()};${reject('select '+reserve(),'pilot_daily_budget')}${check(`${active}=3.469`,'reject 6.337')}`);
  test('duplicate key once and conflicting fingerprint rejected',prepare+`select ${reserve(key)};${check('(select count(*)=1 from private.ai_generations)','one generation')}${check("(select count(*)=1 from private.ai_credit_ledger where type='RESERVE')",'one reserve')}${reject(`select public.ai_server('reserve','${owner}',jsonb_build_object('idempotency_key','${key}','request_hash',repeat('b',64)))`,'idempotency_conflict')}`);
  test('pre-provider zero failure releases budget and generation quotas',`update private.ai_pilot_limits set max_total_generations=1,max_daily_generations=1;${prepare}select ${settleExpr('failed',0)};${check(`${active}=0`,'released')}${check('(select reserved_purchased=0 and purchased_credits=100 from private.ai_accounts where professional_id=\''+owner+'\')','balance restored')}select ${reserve()};`);
  test('success actual charge and unused difference',prepare+claim+`select ${settleExpr('succeeded',1000)};${check(`${active}=.3`,'actual usage')}${check(`(select purchased_credits=99.7 and reserved_purchased=0 from private.ai_accounts where professional_id='${owner}')`,'difference released')}`);
  test('settlement replay charges once',prepare+claim+`select ${settleExpr('succeeded',1000)};select ${settleExpr('succeeded',1000)};${check("(select count(*)=1 from private.ai_credit_ledger where type='USAGE')",'one charge')}${check(`${active}=.3`,'not double')}`);
  test('invalid output with real usage stays charged and counts quota',`update private.ai_pilot_limits set max_daily_generations=1;${prepare}${claim}select ${settleExpr('invalid_output',1000)};${check(`${active}=.3`,'billable failed output')}${reject('select '+reserve(),'pilot_daily_limit')}`);
  test('failed with usage cannot be refunded on replay',prepare+claim+`select ${settleExpr('failed',1000)};select ${settleExpr('failed',0)};${check(`${active}=.3`,'real usage preserved')}`);
  test('abandoned reserved after 10min safely released',prepare+`update private.ai_generations set started_at=clock_timestamp()-interval '11 minutes';select public.ai_server('release_unclaimed','${owner}',jsonb_build_object('generation_id',${id}));${check(`${active}=0`,'unclaimed released')}`);
  test('fresh reservation cannot expire early',prepare+reject(`select public.ai_server('release_unclaimed','${owner}',jsonb_build_object('generation_id',${id}))`,'reservation_not_releasable'));
  test('uncertain stays reserved even across day boundary',prepare+claim+`select public.ai_server('uncertain','${owner}',jsonb_build_object('generation_id',${id}));update private.ai_generations set started_at=clock_timestamp()-interval '2 days';${check(`${active}=3`,'pending carryover')}${reject('select '+reserve(),'pilot_daily_budget')}${reject(`select public.ai_server('release_unclaimed','${owner}',jsonb_build_object('generation_id',${id}))`,'reservation_not_releasable')}`);
  test('UTC day boundary independent of Mexico timezone',`set local timezone='America/Mexico_City';${check("private.ai_utc_day_start('2026-09-22T23:59:59Z')='2026-09-22T00:00:00Z'::timestamptz",'before midnight')}${check("private.ai_utc_day_start('2026-09-23T00:00:00Z')='2026-09-23T00:00:00Z'::timestamptz",'midnight')}${prepare}${claim}select ${settleExpr('succeeded',10000)};update private.ai_generations set started_at='2026-09-22T23:59:59Z';${check(`private.ai_daily_committed('${owner}','2026-09-22T23:59:59Z')=3`,'previous day charged')}${check(`private.ai_daily_committed('${owner}','2026-09-23T00:00:00Z')=0`,'new day released')}`);
  test('same key and budgets isolated per owner',prepare+`select ${reserve(key,other)};${check(`${active}=3 and private.ai_daily_committed('${other}',clock_timestamp())=3`,'separate budgets')}${check('(select count(*)=2 from private.ai_generations)','independent keys')}`);
  test('client cannot call reserve or write balances/usage',`set local role authenticated_${suffix};${reject('select '+reserve(),'permission denied')}${reject(`update private.ai_accounts set purchased_credits=999`,'permission denied')}${reject(`update private.ai_generations set charged_credits=0`,'permission denied')}${reject(`select private.ai_daily_committed('${other}',now())`,'permission denied')}reset role;${check("(select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('ai_accounts','ai_generations','ai_credit_ledger','ai_pilot_limits'))",'RLS enabled')}`);
  test('foreign generation cannot be settled',prepare+reject(`select public.ai_server('settle','${other}',jsonb_build_object('generation_id',${id},'status','failed','input_tokens',0,'output_tokens',0,'cached_tokens',0))`,'generation_unavailable'));
  test('actual charge never makes wallet negative even if usage exceeds estimate',prepare+claim+`select ${settleExpr('succeeded',20000)};${check(`${active}=3`,'existing cap preserved')}${check(`(select actual_cost=.06 and charged_credits=3 from private.ai_generations)`,'full cost audit preserved')}`);
  // Hold first account lock until second session demonstrably waits on it.
  const raceKey=randomUUID();const first=session('budget-first-'+suffix);
  first.c.stdin.write(`begin;set local role service_role_${suffix};select ${reserve(raceKey)};select 'held';\n`);
  await until(()=>first.out().includes('held'));
  const second=session('budget-second-'+suffix);second.c.stdin.end(`set role service_role_${suffix};select ${reserve()};`);
  await until(()=>run(`select count(*) from pg_stat_activity where application_name='budget-second-${suffix}' and wait_event_type='Lock'`)==='1');
  first.c.stdin.end('commit;\n');assert.equal((await first.done).code,0);
  const loser=await second.done;assert.notEqual(loser.code,0);assert.match(loser.err,/pilot_daily_budget/);
  assert.equal(run(`select ${active}`),'3.000');console.log('PASS concurrent 3 + 3 at limit 5: exactly one reservation');tests++;
  const gen=run('select id from private.ai_generations');run(`select ${act('claim',gen)};`);
  const settlements=Array.from({length:5},()=>{const s=session('settle-'+randomUUID());s.c.stdin.end(`set role service_role_${suffix};select ${settle(gen)};`);return s.done;});
  for(const result of await Promise.all(settlements))assert.equal(result.code,0,result.err);
  assert.equal(run("select count(*) from private.ai_credit_ledger where type='USAGE'"),'1');console.log('PASS five concurrent settlements: one charge/release');tests++;
  const duplicate=randomUUID();const a=session('duplicate-first-'+suffix);
  a.c.stdin.write(`begin;set local role service_role_${suffix};select ${reserve(duplicate)};select 'held';\n`);await until(()=>a.out().includes('held'));
  const b=session('duplicate-second-'+suffix);b.c.stdin.end(`set role service_role_${suffix};select ${reserve(duplicate)};`);
  await until(()=>run(`select count(*) from pg_stat_activity where application_name='duplicate-second-${suffix}' and wait_event_type='Lock'`)==='1');
  a.c.stdin.end('commit;\n');assert.equal((await a.done).code,0);const replay=await b.done;assert.equal(replay.code,0,replay.err);assert.match(replay.out,/"created": false/);
  assert.equal(run(`select count(*) from private.ai_generations where idempotency_key='${duplicate}'`),'1');console.log('PASS concurrent duplicate key: one generation');tests++;
  console.log(`PASS ${tests} budget scenarios; provider calls = 0`);
} finally {
  for(const c of children)if(c.exitCode===null)c.kill();
  if(created){run(`drop database ${database} with (force)`,'postgres');for(const role of roles)run(`drop role if exists ${role}_${suffix}`,'postgres');}
}
