-- Optional additive JSON field: existing autosave/revision and immutable snapshot
-- already preserve the complete macro_distribution object.
create or replace function private.valid_diet_supplements(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; product jsonb; key text; ids text[]:='{}';
begin
 if value is null then return true; end if;
 if jsonb_typeof(value) is distinct from 'array' then return false; end if;
 if jsonb_array_length(value)>30 then return false; end if;
 for item in select * from jsonb_array_elements(value) loop
  product:=item->'product';
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(product) is distinct from 'object' then return false;end if;
  if jsonb_typeof(item->'id') is distinct from 'string' or length(trim(item->>'id')) not between 1 and 100 or item->>'id'=any(ids) then return false;end if;
  ids:=array_append(ids,item->>'id');
  if jsonb_typeof(item->'quantity') is distinct from 'number' or (item->>'quantity')::numeric<=0 or (item->>'quantity')::numeric>100000 then return false;end if;
  if coalesce(item->>'unit','') not in ('serving','scoop','g') then return false;end if;
  if jsonb_typeof(item->'instructions') is distinct from 'string' or length(item->>'instructions')>1500 then return false;end if;
  foreach key in array array['id','name','serving_label'] loop
   if jsonb_typeof(product->key) is distinct from 'string' or length(trim(product->>key)) not between 1 and (case when key='id' then 100 else 180 end) then return false;end if;
  end loop;
  foreach key in array array['brand','presentation'] loop
   if jsonb_typeof(product->key) is distinct from 'string' or length(product->>key)>120 then return false;end if;
  end loop;
  foreach key in array array['source_url','label_url','verified_at'] loop
   if jsonb_typeof(product->key)='null' then continue;end if;
   if jsonb_typeof(product->key) is distinct from 'string' or length(product->>key)>(case when key='verified_at' then 50 else 2000 end) then return false;end if;
  end loop;
  foreach key in array array['energy_kcal','carbohydrate_g','protein_g','fat_g'] loop
   if jsonb_typeof(product->key) is distinct from 'number' or (product->>key)::numeric<0 or (product->>key)::numeric>100000 then return false;end if;
  end loop;
  foreach key in array array['serving_grams','scoops_per_serving'] loop
   if jsonb_typeof(product->key)='null' then continue;end if;
   if jsonb_typeof(product->key) is distinct from 'number' or (product->>key)::numeric<=0 or (product->>key)::numeric>100000 then return false;end if;
  end loop;
  if item->>'unit'='g' and jsonb_typeof(product->'serving_grams') is distinct from 'number' then return false;end if;
  if item->>'unit'='scoop' and jsonb_typeof(product->'scoops_per_serving') is distinct from 'number' then return false;end if;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function private.valid_diet_supplements(jsonb) from public, anon;
grant execute on function private.valid_diet_supplements(jsonb) to authenticated;
alter table public.nutrition_plans add constraint nutrition_plan_supplements_valid check(private.valid_diet_supplements(macro_distribution->'supplements'));
