begin;

-- Keep document integrity and the existing owner/context checks. Approval only
-- requires a name, a concrete action, and at least one linked approved goal.
create or replace function private.validate_intervention_document(doc jsonb,strict boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare item jsonb:=doc->'strategy'; field text; needed text[]; entry jsonb;
begin
 if jsonb_typeof(doc) is distinct from 'object' or doc->'version' is distinct from '1'::jsonb or octet_length(doc::text)>90000
 or jsonb_typeof(doc->'pesApprovedAt') is distinct from 'string' or jsonb_typeof(doc->'objectiveApprovedAt') is distinct from 'string' or jsonb_typeof(item) is distinct from 'object' then raise exception 'invalid_strategy'; end if;
 foreach field in array array['title','action','etiologyLink','method','frequency','duration','startDate','responsible','executor','adaptations','monitoring','reviewAt','adjustmentCriteria','access','dose','composition','educationTopic','materials','comprehensionCheck','coordinationWith','coordinationReason','referenceTitle','referenceUrl','referenceVersion','referenceNotes'] loop
  if jsonb_typeof(item->field) is distinct from 'string' or length(item->>field)>1500 then raise exception 'invalid_strategy'; end if;
 end loop;
 if item->>'category' is null or item->>'category' not in ('food','education','counseling','supplementation','coordination')
 or item->>'route' is null or item->>'route' not in ('not_applicable','oral','enteral','parenteral')
 or item->>'agreement' is null or item->>'agreement' not in ('pending','patient','caregiver')
 or jsonb_typeof(item->'priority') is distinct from 'number' or (item->>'priority') !~ '^(10|[1-9])$'
 or jsonb_typeof(item->'goalIndexes') is distinct from 'array' or jsonb_array_length(item->'goalIndexes')>3 then raise exception 'invalid_strategy'; end if;
 if exists(select 1 from jsonb_array_elements(item->'goalIndexes') n where jsonb_typeof(n)<>'number' or (n#>>'{}') !~ '^[0-2]$')
 or (select count(*)<>count(distinct n) from jsonb_array_elements(item->'goalIndexes') n) then raise exception 'invalid_strategy'; end if;
 if jsonb_typeof(item->'evidence') is distinct from 'array' or jsonb_array_length(item->'evidence')>10
 or jsonb_typeof(item->'referenceIds') is distinct from 'array' or jsonb_array_length(item->'referenceIds')>5
 or jsonb_typeof(item->'missingContext') is distinct from 'array' or jsonb_array_length(item->'missingContext')>15 then raise exception 'invalid_strategy'; end if;
 for entry in select value from jsonb_array_elements(item->'evidence') loop
  if jsonb_typeof(entry->'source') is distinct from 'string' or jsonb_typeof(entry->'finding') is distinct from 'string' or length(entry->>'source')>2000 or length(entry->>'finding')>4000 then raise exception 'invalid_strategy'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(item->'referenceIds') e where jsonb_typeof(e)<>'string' or e#>>'{}' not in ('academy-intervention','academy-monitoring'))
 or exists(select 1 from jsonb_array_elements(item->'missingContext') e where jsonb_typeof(e)<>'string' or length(e#>>'{}')>400) then raise exception 'invalid_strategy'; end if;
 if btrim(item->>'referenceUrl')<>'' and item->>'referenceUrl' !~ '^https://[^[:space:]]+$' then raise exception 'invalid_strategy'; end if;
 if not strict then return; end if;
 -- Professional approval records the planned action. Undecided operational
 -- details and the patient/caregiver agreement may remain pending.
 needed:=array['title','action'];
 foreach field in array needed loop if btrim(item->>field)='' then raise exception 'strategy_incomplete'; end if; end loop;
 if jsonb_array_length(item->'goalIndexes')=0 then raise exception 'strategy_incomplete'; end if;
 -- A supplied route must still be applicable to the category. An unspecified
 -- route for food/supplementation is allowed; no prescription is invented.
 if item->>'category' not in ('food','supplementation') and item->>'route'<>'not_applicable' then raise exception 'invalid_strategy'; end if;
end $$;
revoke all on function private.validate_intervention_document(jsonb,boolean) from public,anon,authenticated,service_role;

commit;
