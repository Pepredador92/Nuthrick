// Disposable local database and uniquely named test roles; never production.
import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const suffix = randomUUID().replaceAll('-','').slice(0,12);
const registered = process.argv.includes('--registration');
const database = `nuthrick_agenda_test_${suffix}`;
const roles = ['anon','authenticated','service_role'];
const remap = sql => roles.reduce((text,role)=>text.replaceAll(new RegExp(`\\b${role}\\b`,'g'),`${role}_${suffix}`),sql);
const command = (db,sql) => spawnSync('psql',['-X','-h','/tmp','-d',db,'-v','ON_ERROR_STOP=1','-At'],{input:sql,encoding:'utf8'});
function run(db,sql) { const result=command(db,sql); if(result.status!==0) throw new Error(result.stderr); return result.stdout.trim(); }
let created=false;
let children=[];
try {
  run('postgres',`create database ${database};`); created=true;
  const setup=readFileSync(new URL('./test-agenda-db.sql',import.meta.url),'utf8').split('-- MIGRATION INSERTION POINT --')[0];
  const migration=readFileSync(new URL('../supabase/migrations/20260916004238_agenda_booking_core.sql',import.meta.url),'utf8').replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'');
  const registrationMigration=registered ? `alter table public.patients alter column id set default gen_random_uuid(), add column full_name text, add column email text, add column country_code text, add column phone text, add column birth_date date, add column timezone text, add column portal_access_enabled boolean default false;\n${readFileSync(new URL('../supabase/migrations/20260916015845_agenda_patient_registration.sql',import.meta.url),'utf8').replace(/^begin;\s*/m,'').replace(/commit;\s*$/,'')}` : '';
  run(database,remap(`begin;${setup}\n${migration}\n${registrationMigration}\ncommit;`));
  const owner='00000000-0000-0000-0000-000000000001';
  const start=run(database,"select (((now() at time zone 'America/Mexico_City')::date+2+time '10:00') at time zone 'America/Mexico_City')::text;");
  run(database,`insert into private.agenda_verifications(id,professional_id,email,code_hash,proof_hash,verified_at,expires_at)
    select gen_random_uuid(),'${owner}','synthetic@example.invalid','unused','race-proof-'||n,now(),now()+interval '10 minutes' from generate_series(1,2) n;`);
  const key=randomUUID();
  const payload=JSON.stringify({kind:'appointment',name:'Contacto sintético',start,modality:'online',...(registered ? {registration:{birthDate:'1990-03-12',countryCode:'+52',phone:'+524920000001',consent:true}} : {})});
  const book=(proof,operation)=>`select public.${registered?'agenda_book_registered':'agenda_book'}('agenda-test','race-proof-${proof}','${operation}','${payload}');`;
  const session=(app)=>{
    const child=spawn('psql',['-X','-h','/tmp','-d',database,'-v','ON_ERROR_STOP=1','-At'],{env:{...process.env,PGAPPNAME:app}});
    let output='',error=''; child.stdout.on('data',b=>output+=b); child.stderr.on('data',b=>error+=b);
    const done=new Promise(resolve=>child.on('close',code=>resolve({code,get output(){return output;},get error(){return error;}})));
    children.push(child); return {child,done,output:()=>output};
  };
  const first=session(`agenda-first-${suffix}`);
  first.child.stdin.write(`begin;${book(1,key)}select 'first-held';\n`);
  const until=async predicate=>{ const deadline=Date.now()+10000; while(!predicate()){if(Date.now()>deadline)throw new Error('Race synchronization timed out');await new Promise(r=>setTimeout(r,25));} };
  await until(()=>first.output().includes('first-held'));
  const second=session(`agenda-second-${suffix}`);
  second.child.stdin.end(book(2,randomUUID()));
  await until(()=>run(database,`select count(*) from pg_stat_activity where datname='${database}' and application_name='agenda-second-${suffix}' and wait_event_type='Lock';`)==='1');
  first.child.stdin.end('commit;\n');
  assert.equal((await first.done).code,0);
  const lost=await second.done;
  assert.notEqual(lost.code,0); assert.match(lost.error,/slot_taken|exclusion constraint/);
  assert.equal(run(database,"select count(*) from public.agenda_entries where kind='appointment';"),'1');
  const retry=JSON.parse(run(database,book(1,key)));
  assert.equal(retry.status,registered?'pending_confirmation':'confirmed');
  if(registered) {
    assert.equal(run(database,"select count(*) from public.patients where email='synthetic@example.invalid';"),'1');
    run(database,`select public.agenda_book_registered('agenda-test','race-proof-2','${randomUUID()}','${payload}'::jsonb || jsonb_build_object('start','${start}'::timestamptz+interval '1 hour'));`);
    assert.equal(run(database,"select count(*) from public.patients where email='synthetic@example.invalid';"),'1');
    assert.equal(run(database,"select count(*) from public.agenda_entries where registration_status='review' and patient_id is null;"),'1');
  }
  assert.equal(run(database,"select count(*) from private.agenda_outbox where kind='confirmation';"),registered?'2':'1');
  console.log('PASS: two simultaneous booking connections, single winner, one confirmation job, safe lost-response retry');
} finally {
  for(const child of children) if(child.exitCode===null) child.kill();
  if(created) {
    run('postgres',`drop database ${database} with (force);`);
    for(const role of roles) run('postgres',`drop role if exists ${role}_${suffix};`);
  }
}
