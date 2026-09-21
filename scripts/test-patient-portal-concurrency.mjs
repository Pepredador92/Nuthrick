// Two real local PostgreSQL connections; disposable synthetic database only.
import { readFileSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const database = `nuthrick_portal_test_${suffix}`;
const roles = ['anon', 'authenticated', 'service_role'];
const remap = sql => roles.reduce((text, role) => text.replaceAll(new RegExp(`\\b${role}\\b`, 'g'), `${role}_${suffix}`), sql);
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function run(db, sql) {
  const result = spawnSync('psql', ['-X', '-h', '/tmp', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
const children = [];
let created = false;
try {
  run('postgres', `create database ${database};`); created = true;
  const name = readdirSync(new URL('../supabase/migrations/', import.meta.url)).find(n => n.endsWith('_patient_superlink.sql'));
  const setup = read('./test-patient-portal.sql').split('-- MIGRATION INSERTION POINT --')[0];
  run(database, remap(`begin;${setup}\n${read(`../supabase/migrations/${name}`).replace(/^begin;\s*/m, '').replace(/commit;\s*$/, '')}\ncommit;`));
  run(database, `select public.patient_portal('link','{"owner":"00000000-0000-0000-0000-000000000001","patientId":"10000000-0000-0000-0000-000000000001","linkHash":"race-link","encryptedLink":"fixture"}');
    select public.patient_portal('challenge','{"id":"30000000-0000-0000-0000-000000000001","linkHash":"race-link","email":"patient@example.invalid","codeHash":"correct"}');`);
  const verify = hash => `select public.patient_portal('verify','{"id":"30000000-0000-0000-0000-000000000001","linkHash":"race-link","codeHash":"correct","newSessionHash":"${hash}"}');`;
  function session(app) {
    const child = spawn('psql', ['-X', '-h', '/tmp', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], { env: { ...process.env, PGAPPNAME: app } });
    children.push(child);
    let output = '', error = '';
    child.stdout.on('data', b => output += b); child.stderr.on('data', b => error += b);
    const done = new Promise(resolve => child.on('close', code => resolve({ code, output, error })));
    return { child, done, output: () => output };
  }
  async function until(predicate) {
    const deadline = Date.now() + 10000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('Concurrency synchronization timed out');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  const first = session(`portal-first-${suffix}`);
  first.child.stdin.write(`begin;${verify('winner')}select 'first-held';\n`);
  await until(() => first.output().includes('first-held'));
  const second = session(`portal-second-${suffix}`);
  second.child.stdin.end(verify('loser'));
  await until(() => run(database, `select count(*) from pg_stat_activity where datname='${database}' and application_name='portal-second-${suffix}' and wait_event_type='Lock';`) === '1');
  first.child.stdin.end('commit;\n');
  assert.equal((await first.done).code, 0);
  const loser = await second.done;
  assert.equal(loser.code, 0, loser.error);
  assert.equal(JSON.parse(loser.output).error, 'invalid_code');
  assert.equal(run(database, 'select count(*) from private.portal_sessions;'), '1');
  console.log('PASS: simultaneous correct-code requests create only one session');
} finally {
  for (const child of children) if (child.exitCode === null) child.kill();
  if (created) {
    run('postgres', `drop database ${database} with (force);`);
    for (const role of roles) run('postgres', `drop role if exists ${role}_${suffix};`);
  }
}
