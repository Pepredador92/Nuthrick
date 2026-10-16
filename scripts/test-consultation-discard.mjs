import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const bin = process.env.CONSULTATION_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@16/bin/';
const database = `nuthrick_consultation_discard_${process.pid}`;
const run = (command, args, input) => spawnSync(bin + command, args, { input, encoding: 'utf8' });
const query = sql => run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database], sql);
const check = result => assert.equal(result.status, 0, result.stderr || result.stdout);
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20261016221253_discard_unfinished_consultation_draft.sql');
const definition = (source, name) => {
  const match = source.match(new RegExp(`create (?:or replace )?function private\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'));
  assert.ok(match, name);
  return match[0];
};
const labs = read('../supabase/migrations/20260905212911_laboratory_reports_and_results.sql');
const id = n => `'10000000-0000-0000-0000-${String(n).padStart(12, '0')}'::uuid`;
const owner = id(100), patient = id(200);
const children = ['consultation_snapshots','consultation_answers','consultation_anthropometry','consultation_measurements','consultation_calculation_results','consultation_device_sessions'];
check(run('createdb', [database]));
try {
  check(query(`
    do $$begin if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select from pg_roles where rolname='anon') then create role anon; end if; end$$;
    create schema private; create schema auth;
    grant usage on schema public,private,auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function private.require_my_entitlement(text) returns void language plpgsql as $$begin
      if current_setting('test.block_write',true)='true' then raise insufficient_privilege; end if; end$$;
    create table public.consultations(id uuid primary key, professional_id uuid, patient_id uuid, status text,
      completed_at timestamptz, summary text, deleted_at timestamptz, unique(professional_id,id,patient_id));
    ${children.map(table => `create table public.${table}(id uuid primary key default gen_random_uuid(),professional_id uuid,consultation_id uuid,patient_id uuid,
      foreign key(professional_id,consultation_id,patient_id) references public.consultations(professional_id,id,patient_id) on delete cascade);`).join('\n')}
    alter table public.consultation_snapshots add column template_id uuid, add column template_version integer default 1;
    ${['consultation_notes','patient_notes','patient_measurements','questionnaire_submissions','nutrition_plans','nutrition_plan_versions'].map(table => `create table public.${table}(consultation_id uuid references public.consultations(id), professional_id uuid);`).join('\n')}
    create table public.laboratory_reports(id uuid primary key default gen_random_uuid(),professional_id uuid,consultation_id uuid references public.consultations on delete cascade,patient_id uuid,created_at timestamptz);
    create table public.laboratory_results(id uuid primary key default gen_random_uuid(),report_id uuid references public.laboratory_reports on delete cascade,professional_id uuid,consultation_id uuid references public.consultations on delete cascade,patient_id uuid);
    create table public.measurement_types(id uuid); create table public.laboratory_custom_analytes(id uuid);
    ${[1,2,3,4,5,6,7,8].map(n => `insert into public.consultations(id,professional_id,patient_id,status,summary) values(${id(n)},${n===5?id(101):owner},${patient},'${n===3?'completed':'draft'}',${n===4?"'Previous closed summary'":'null'});`).join('\n')}
    ${children.map(table => `insert into public.${table}(professional_id,consultation_id,patient_id) select professional_id,id,patient_id from public.consultations;`).join('\n')}
    insert into public.laboratory_reports(professional_id,consultation_id,patient_id) select professional_id,id,patient_id from public.consultations;
    insert into public.laboratory_results(report_id,professional_id,consultation_id,patient_id) select id,professional_id,consultation_id,patient_id from public.laboratory_reports;
    insert into public.nutrition_plans values(${id(6)},${owner});
    insert into public.nutrition_plan_versions values(${id(7)},${owner});
    insert into public.patient_notes values(${id(8)},${owner});
    ${definition(labs,'validate_laboratory_report')}
    ${definition(labs,'validate_laboratory_result')}
    create trigger laboratory_reports_validate before delete on public.laboratory_reports for each row execute function private.validate_laboratory_report();
    create trigger laboratory_results_validate before delete on public.laboratory_results for each row execute function private.validate_laboratory_result();
    alter table public.consultations enable row level security;
    create policy own on public.consultations to authenticated using(professional_id=auth.uid()) with check(professional_id=auth.uid());
    grant select,update on public.consultations to authenticated;
    ${migration}
    insert into public.consultations(id,professional_id,patient_id,status) values(${id(10)},${owner},${patient},'draft');
    insert into public.consultation_snapshots(professional_id,consultation_id,patient_id) values(${owner},${id(10)},${patient}),(${owner},${id(10)},${patient});
    insert into public.consultations(id,professional_id,patient_id,status) values(${id(9)},${owner},${patient},'draft');
    update public.consultations set status='completed' where id=${id(9)};
    update public.consultations set status='draft',draft_discard_protected=false where id=${id(9)};
    do $$begin if not (select draft_discard_protected from public.consultations where id=${id(9)}) then raise exception 'Closed history flag reset'; end if; end$$;
    set role authenticated;
    select set_config('request.jwt.claim.sub',${owner}::text,false);
    do $$begin
      if has_function_privilege('anon','public.discard_consultation_draft(uuid)','execute') or has_function_privilege('anon','private.discard_consultation_draft(uuid)','execute') then raise exception 'Anonymous execute'; end if;
      perform public.discard_consultation_draft(${id(1)});
      perform public.discard_consultation_draft(${id(1)});
      perform public.discard_consultation_draft(${id(5)});
      ${[3,4,6,7,8,9,10].map(n => `begin perform public.discard_consultation_draft(${id(n)}); raise exception 'Protected record ${n} deleted'; exception when check_violation then null; end;`).join('\n')}
      perform set_config('test.block_write','true',false);
      begin perform public.discard_consultation_draft(${id(2)}); raise exception 'Entitlement bypass'; exception when insufficient_privilege then null; end;
      perform set_config('test.block_write','false',false);
      perform set_config('request.jwt.claim.sub','',false);
      begin perform public.discard_consultation_draft(${id(2)}); raise exception 'Missing identity accepted'; exception when insufficient_privilege then null; end;
    end$$;
    reset role;
    do $$begin
      if exists(select from public.consultations where id=${id(1)}) then raise exception 'Draft remains'; end if;
      ${[...children,'laboratory_reports','laboratory_results'].map(table => `if exists(select from public.${table} where consultation_id=${id(1)}) then raise exception '${table} orphan'; end if;
      if (select count(*) from public.${table})<>${table==='consultation_snapshots'?9:7} then raise exception '${table} other records changed'; end if;`).join('\n')}
      if (select count(*) from public.consultations)<>9 then raise exception 'Other consultations lost'; end if;
    end$$;
    create function private.test_failure() returns trigger language plpgsql as $$begin raise exception 'simulated deletion failure'; end$$;
    create trigger test_failure before delete on public.laboratory_reports for each row execute function private.test_failure();
    set role authenticated;
    select set_config('request.jwt.claim.sub',${owner}::text,false);
    do $$begin
      begin perform public.discard_consultation_draft(${id(2)}); raise exception 'Failure expected'; exception when raise_exception then
        if sqlerrm <> 'simulated deletion failure' then raise; end if; end;
    end$$;
    reset role;
    do $$begin if not exists(select from public.laboratory_results where consultation_id=${id(2)}) or not exists(select from public.consultations where id=${id(2)}) then raise exception 'Partial deletion after failure'; end if; end$$;
    drop trigger test_failure on public.laboratory_reports;
    set role authenticated;
    select public.discard_consultation_draft(${id(2)});
    reset role;
    select 'PASS: draft data removed; history, plans, other owner, retries, permissions and atomic rollback protected' as result;
  `));
  console.log('PASS: draft discard, real laboratory validation triggers, cascades, protected history, linked plans, ownership, entitlements, retry and atomic rollback.');
} finally { check(run('dropdb', [database])); }
