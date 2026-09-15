do $$ begin
 if (select count(*) from public.diet_library_items where provenance->>'import_version'='2')<>21 then raise exception 'Not all 21 bases updated'; end if;
 if exists(select 1 from public.diet_library_items where provenance->>'kind'='provided_pdf' and (name ilike '%PDF%' or content->'reference_targets'='null'::jsonb or content->'estimation' is null)) then raise exception 'Missing names, targets or estimation provenance'; end if;
 if exists(select 1 from before_estimates b left join public.diet_library_items a on a.id=b.id where a.id is null) then raise exception 'Stable library ids lost'; end if;
 if exists(select 1 from before_estimates b join public.diet_library_items a using(id) where b.owner_id is not null and to_jsonb(b)<>to_jsonb(a)) then raise exception 'Personal library changed'; end if;
 if exists(select 1 from before_estimates b join public.diet_library_items a using(id) where b.provenance->>'kind'='provided_pdf' and a.revision<>b.revision+1) then raise exception 'Update is not idempotent'; end if;
 if exists(select 1 from public.diet_library_items where provenance->>'kind'='provided_pdf' and content::text like '%"catalog:%') then raise exception 'Catalog ids unresolved'; end if;
end $$;
select '21 estimated bases: complete goals, stable ids, single revision, personal copies untouched: PASS' as result;
