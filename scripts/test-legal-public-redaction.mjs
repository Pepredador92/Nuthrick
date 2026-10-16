import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildLegalRedactionSql, publicationDocuments } from './publish-legal-redaction.mjs';

const bin = process.env.LEGAL_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@16/bin/';
const database = `nuthrick_legal_redaction_${process.pid}`;
const run = (command, args, input) => spawnSync(bin + command, args, { input, encoding: 'utf8' });
const query = sql => run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-d', database], sql);
const success = result => assert.equal(result.status, 0, result.stderr || result.stdout);
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const docs = publicationDocuments();
const oldBody = key => `Operador de ejemplo ${key}. Domicilio particular ficticio 55. Teléfono 5551234567.`;
const fixtures = docs.map(d => ({ ...d, expected_content_hash: createHash('sha256').update(oldBody(d.key)).digest('hex') }));
const migration = readFileSync(new URL('../supabase/migrations/20260925162150_live_one_b_legal_email.sql', import.meta.url), 'utf8');
const definition = (schema, name) => {
  const match = migration.match(new RegExp(`create (?:or replace )?function ${schema}\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'));
  assert.ok(match, `Missing actual legal function ${name}`);
  return match[0];
};

success(run('createdb', [database]));
try {
  const schema = `
create schema private;
create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create table private.legal_documents (
 key text primary key, title text, version integer, effective_at timestamptz,
 review_status text, content_ref text, updated_at timestamptz default now(),
 body text, revision integer, approved_by uuid, approved_at timestamptz,
 published_at timestamptz, requires_acceptance boolean
);
create table private.legal_document_versions (
 document_key text, version integer, title text, body text, review_status text,
 revision integer, effective_at timestamptz, published_at timestamptz,
 approved_at timestamptz, approved_by uuid, requires_acceptance boolean,
 content_hash text, updated_at timestamptz, primary key(document_key, version)
);
create table public.legal_documents_public (
 key text, title text, version integer, effective_at timestamptz, review_status text,
 content_ref text, updated_at timestamptz, body text, published_at timestamptz,
 requires_acceptance boolean, primary key(key, version)
);
create table private.legal_acceptances (
 document_key text, document_version integer,
 foreign key(document_key, document_version) references private.legal_document_versions(document_key, version)
);
create table private.admin_audit (
 id bigint generated always as identity primary key, action text not null, entity text not null, entity_id text,
 actor_admin uuid, reason text, metadata jsonb
);
${['preserve_legal_version', 'save_legal_history', 'sync_legal_documents_public'].map(n => definition('private', n)).join('\n')}
${definition('public', 'legal_document')}
create trigger legal_version_guard before update or delete on private.legal_documents for each row execute function private.preserve_legal_version();
create trigger legal_version_history after update on private.legal_documents for each row execute function private.save_legal_history();
create trigger legal_documents_public_sync after update on private.legal_documents for each row execute function private.sync_legal_documents_public();
${fixtures.map(d => `insert into private.legal_documents(key,title,version,effective_at,review_status,content_ref,body,revision,approved_at,published_at,requires_acceptance)
 values(${quote(d.key)},${quote(d.key)},2,now()-interval '1 day','approved',${quote('/'+d.key)},${quote(oldBody(d.key))},${d.expected_revision},now()-interval '1 day',now()-interval '1 day',${d.requires_acceptance});`).join('\n')}
insert into private.legal_document_versions select key,version,title,body,review_status,revision,effective_at,published_at,approved_at,approved_by,requires_acceptance,encode(extensions.digest(body,'sha256'),'hex'),updated_at from private.legal_documents;
insert into private.legal_document_versions select document_key,1,title,body,review_status,revision,effective_at,published_at,approved_at,approved_by,requires_acceptance,content_hash,updated_at from private.legal_document_versions where version=2;
insert into public.legal_documents_public select key,title,version,effective_at,review_status,content_ref,updated_at,body,published_at,requires_acceptance from private.legal_documents;
insert into public.legal_documents_public select key,title,1,effective_at,review_status,content_ref,updated_at,body,published_at,requires_acceptance from private.legal_documents;
insert into private.legal_acceptances values('terms',2),('privacy',2);
`;
  success(query(schema));
  const stale = query(buildLegalRedactionSql());
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /legal_version_changed/);
  const unchanged = query(`do $$begin if (select count(*) from private.legal_documents where version=2)<>3 or (select count(*) from public.legal_documents_public)<>6 then raise exception 'Failed transaction changed published data';end if;end$$;`);
  success(unchanged);
  success(query(buildLegalRedactionSql(fixtures)));
  success(query(buildLegalRedactionSql(fixtures)));
  const checks = `do $$begin
 if (select count(*) from private.legal_documents where version=3 and review_status='approved')<>3 then raise exception 'New versions missing';end if;
 if (select count(*) from public.legal_documents_public)<>3 or exists(select 1 from public.legal_documents_public where version<>3) then raise exception 'Old public copies remain';end if;
 if exists(select 1 from public.legal_documents_public where body like '%5551234567%' or body like '%Operador de ejemplo%') then raise exception 'Personal data exposed';end if;
 if (select count(*) from private.legal_document_versions)<>9 then raise exception 'Private history lost';end if;
 if (select count(*) from private.legal_document_versions where version<=2 and body like '%5551234567%')<>6 then raise exception 'Original evidence overwritten';end if;
 if (select count(*) from private.legal_acceptances)<>2 then raise exception 'Acceptances changed';end if;
 if (select count(*) from private.legal_documents where requires_acceptance)<>2 then raise exception 'Acceptance requirements changed';end if;
 if (select count(*) from private.admin_audit)<>3 or exists(select 1 from private.admin_audit where actor_admin is not null) then raise exception 'Audit duplicated or impersonated';end if;
 if exists(select 1 from private.admin_audit where metadata->>'legal_compliance_certified'<>'false' or metadata->>'commercial_identification_pending'<>'true') then raise exception 'Missing compliance limitation';end if;
 ${fixtures.map(d => `if public.legal_document(${quote(d.key)})->>'body' is distinct from ${quote(d.body)} then raise exception 'Public RPC content mismatch';end if;
 if (select content_hash from private.legal_document_versions where document_key=${quote(d.key)} and version=2)<>${quote(d.expected_content_hash)} then raise exception 'Original hash changed';end if;`).join('\n')}
 begin update private.legal_documents set body='mutated' where key='terms';raise exception 'Immutable version guard bypassed';
 exception when others then if sqlerrm<>'legal_version_immutable' then raise;end if;end;
end$$;`;
  success(query(checks));
  console.log('Legal redaction checks passed: atomic publication, stale-source rejection, public withdrawal, private history, consent records, original guards and idempotent audit.');
} finally {
  success(run('dropdb', [database]));
}
