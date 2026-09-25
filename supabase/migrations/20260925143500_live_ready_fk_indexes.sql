-- Cover the foreign keys introduced by the operational controls.
create index if not exists transactional_email_outbox_template_key on private.transactional_email_outbox(template_key);
create index if not exists legal_acceptances_document_key on private.legal_acceptances(document_key);
create index if not exists operational_case_resolutions_resolved_by on private.operational_case_resolutions(resolved_by);
