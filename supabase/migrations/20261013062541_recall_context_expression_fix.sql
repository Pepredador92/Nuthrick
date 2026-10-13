-- Explicit operator grouping keeps manual source projection byte-for-byte compatible.
do $$
declare signature text; definition text; amended text;
begin
  foreach signature in array array['public.ai_diet_source(uuid,uuid,integer)','public.ai_text_diet_source(uuid,uuid,integer)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    amended:=replace(definition,
      'source->''confirmedRecall''-''method''-''estimate''',
      '(source->''confirmedRecall'')-''method''-''estimate''');
    if amended=definition then raise exception 'recall_context_expression_patch_failed: %',signature; end if;
    execute amended;
  end loop;
end $$;
