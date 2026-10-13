-- Preserve the exact source/hash for existing catalog-based recalls and pending diet drafts.
do $$
declare signature text; definition text; amended text;
begin
  foreach signature in array array['public.ai_diet_source(uuid,uuid,integer)','public.ai_text_diet_source(uuid,uuid,integer)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    amended:=replace(definition,
      'return jsonb_build_object(''source'',source||jsonb_build_object(''stamp'',md5(source::text)),',
      'if source ? ''confirmedRecall'' and s.clinical_records->''recall''->>''method'' is distinct from ''ai_estimate'' then
         source:=jsonb_set(source,''{confirmedRecall}'',source->''confirmedRecall''-''method''-''estimate'');
       end if;
       return jsonb_build_object(''source'',source||jsonb_build_object(''stamp'',md5(source::text)),');
    if amended=definition then raise exception 'recall_manual_compatibility_patch_failed: %',signature; end if;
    execute amended;
  end loop;
end $$;
