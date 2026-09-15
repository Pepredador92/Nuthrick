// Emits SQL/summary to stdout. No database connection, no files written.
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('./data/library-food-snapshots.json',import.meta.url),'utf8'));
const root=fileURLToPath(new URL('../frontend',import.meta.url));
const server=await createServer({root,configFile:false,resolve:{alias:{'@':root}},server:{middlewareMode:true}});
try {
 const {buildPdfLibrary}=await server.ssrLoadModule('../scripts/build-pdf-library.ts');
 const all=buildPdfLibrary();
 const requested=process.argv.find(a=>a.startsWith('--index='));
 const items=requested ? [all[Number(requested.split('=')[1])]] : all;
 if(process.argv.includes('--sql')) {
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  if(!requested) console.log('begin;');
  for(const item of items) {
   // Store each ingredient list once in the SQL artifact; rebuild menu/calendar snapshots.
   const compact=structuredClone(item.content);
   compact.menu.menus[0].meal_menus=[];
   compact.menu.week_plan.days[0].assignments=[];
   let encoded=JSON.stringify(compact);
   for(const food of catalog) encoded=encoded.replaceAll(JSON.stringify(food.id),JSON.stringify('catalog:'+food.stable_code));
   console.log(`do $seed$ declare encoded text := ${quote(encoded)}; f record; begin
for f in select id,stable_code from public.food_items where owner_id is null and stable_code is not null loop
 encoded:=replace(encoded,to_json('catalog:'||f.stable_code)::text,to_json(f.id::text)::text);
end loop;
if position('"catalog:' in encoded)>0 then raise exception 'Falta un alimento del catálogo requerido por la importación'; end if;
with seed as (select encoded::jsonb as c), expanded as (select jsonb_set(jsonb_set(c,'{menu,menus,0,meal_menus}',(select jsonb_agg(jsonb_build_object('meal_time_id',o->'meal_time_id','entries',o->'entries')) from jsonb_array_elements(c#>'{menu,meal_options}') o)),'{menu,week_plan,days,0,assignments}',(select jsonb_agg(jsonb_build_object('meal_time_id',o->'meal_time_id','option_id',o->'id','option_snapshot',o,'fixed',false)) from jsonb_array_elements(c#>'{menu,meal_options}') o)) as content from seed) insert into public.diet_library_items(owner_id,name,content,provenance) select null,${quote(item.name)},content,${quote(JSON.stringify(item.provenance))}::jsonb from expanded where not exists(select 1 from public.diet_library_items where owner_id is null and provenance->>'label'=${quote(item.provenance.label)});
end $seed$;`);
  }
  if(!requested) console.log('commit;');
 } else console.log(JSON.stringify(items.map(({name,ready,known_totals,provenance})=>({name,ready,known_totals,notes:provenance.notes})),null,2));
} finally { await server.close(); }
