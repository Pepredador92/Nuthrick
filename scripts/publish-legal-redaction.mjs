import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const base = new URL('../docs/legal-v3/', import.meta.url);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;

export function publicationDocuments() {
  const manifest = JSON.parse(readFileSync(new URL('publication.json', base), 'utf8'));
  return manifest.documents.map(document => ({ ...document, body: readFileSync(new URL(`${document.key}.md`, base), 'utf8') }));
}

export function buildLegalRedactionSql(documents = publicationDocuments()) {
  if (documents.length !== 3 || new Set(documents.map(d => d.key)).size !== 3 || documents.some(d => !['terms', 'privacy', 'refunds'].includes(d.key))) throw new Error('Expected exactly the three legal documents');
  for (const doc of documents) {
    if (!Number.isInteger(doc.expected_version) || !Number.isInteger(doc.expected_revision) || !/^[a-f0-9]{64}$/.test(doc.expected_content_hash)) throw new Error('Invalid source revision');
    if (doc.body.length < 100 || doc.body.length > 60000 || /\[PENDIENTE:|\{\{|operad[oa]\s+por|persona f[ií]sica|domicilio(?: de atenci[oó]n| particular| comercial)|(?:\d[\s()-]*){10,}|\b\d{5}\b/i.test(doc.body)) throw new Error('Unresolved or personal identification data in publication');
  }
  const values = documents.map(d => `(${literal(d.key)}, ${d.expected_version}, ${d.expected_revision}, ${literal(d.expected_content_hash)}, ${literal(d.body)})`).join(',\n');
  return `-- Owner-authorized withdrawal of public personal details, 2026-10-16.
-- Content publication, not a legal compliance certification. No schema changes.
begin;
do $redaction$
declare
  requested record;
  existing private.legal_documents;
  removed integer;
  already_published boolean;
begin
  if auth.uid() is not null then raise exception 'maintenance_context_required'; end if;
  lock table private.legal_documents in share row exclusive mode;
  for requested in select * from (values
${values}
  ) as input(document_key, expected_version, expected_revision, expected_hash, new_body)
  loop
    select * into existing from private.legal_documents where key = requested.document_key for update;
    if existing.key is null then raise exception 'legal_document_missing'; end if;
    already_published := existing.version = requested.expected_version + 1
      and existing.review_status = 'approved'
      and existing.body = requested.new_body;
    if not already_published then
      if existing.version <> requested.expected_version
        or existing.revision <> requested.expected_revision
        or existing.review_status <> 'approved'
        or encode(extensions.digest(existing.body, 'sha256'), 'hex') <> requested.expected_hash
      then raise exception 'legal_version_changed'; end if;
      update private.legal_documents set version = version + 1, review_status = 'draft',
        effective_at = null, approved_at = null, approved_by = null, published_at = null
      where key = requested.document_key;
      update private.legal_documents set body = requested.new_body, review_status = 'pending_review'
      where key = requested.document_key;
      -- Maintenance publication: approved_by stays null; no human identity is impersonated.
      perform set_config('nuthrick.legal_approval', 'confirmed', true);
      update private.legal_documents set review_status = 'approved', effective_at = now(),
        approved_at = now(), published_at = now(), approved_by = null
      where key = requested.document_key;
    end if;
    -- These are derived public copies. Original versions and acceptances stay private.
    delete from public.legal_documents_public
    where key = requested.document_key and version < requested.expected_version + 1;
    get diagnostics removed = row_count;
    if not already_published or removed > 0 then
      insert into private.admin_audit(action, entity, entity_id, reason, metadata)
      values('legal_public_personal_data_removed', 'legal_document',
        requested.document_key || ':v' || (requested.expected_version + 1)::text,
        'Retirada de datos personales públicos solicitada expresamente por el titular el 16/10/2026.',
        jsonb_build_object('source', 'authorized_database_maintenance', 'document', requested.document_key,
          'previous_version', requested.expected_version, 'published_version', requested.expected_version + 1,
          'previous_content_hash', requested.expected_hash,
          'published_content_hash', encode(extensions.digest(requested.new_body, 'sha256'), 'hex'),
          'withdrawn_public_copies', removed, 'private_history_preserved', true,
          'legal_compliance_certified', false, 'commercial_identification_pending', true));
    end if;
    if public.legal_document(requested.document_key)->>'body' is distinct from requested.new_body then
      raise exception 'legal_publication_verification_failed';
    end if;
  end loop;
end
$redaction$;
commit;
select jsonb_build_object('documents', (select jsonb_agg(jsonb_build_object('key', key,
  'version', version, 'status', review_status)) from private.legal_documents),
  'public_copies', (select count(*) from public.legal_documents_public)) as publication_result;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(buildLegalRedactionSql());
}
