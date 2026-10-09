import {inferGroceryCategory,groupGroceries} from '../../../../supabase/functions/_shared/grocery-categories';
import { describe, expect, it } from 'vitest';
import { compileGroceries, parseGroceryIngredient } from './compile';
import { grocerySourceKey, isGroceryList, patientGroceries } from '../../../../supabase/functions/_shared/groceries';
import { isTextDiet, type TextDiet } from '../../../../supabase/functions/_shared/text-diet';
import { projectPortalPlan } from '../../../../supabase/functions/agenda/portal-plan';
import { buildPlanDocument, renderPlanPdf, renderPlanTex } from '../../../../supabase/functions/agenda/plan-document';
export const diets=[{id:'a',title:'Dieta 1',text:'Comida\n• 120 g de pollo cocido\n• ½ taza de arroz cocido\nPreparación: servir.'},{id:'b',title:'Dieta 2',text:'Comida\n• 0.2 kg de pollo cocido\n• 100 g de arroz crudo\n• 1 taza de arroz cocido\nPreparación: cocinar.'}];
export const schedule=diets.map((d,i)=>({diet_id:d.id,title:d.title,days:i===0?3:2}));
describe('shopping quantities',()=>{
 it('multiplies selected days and merges only matching ingredients and compatible units',()=>{
  const rows=compileGroceries(diets,schedule);
  expect(rows.map(({name,quantity,unit})=>({name,quantity,unit}))).toEqual([{name:'pollo cocido',quantity:760,unit:'g'},{name:'arroz cocido',quantity:3.5,unit:'taza'},{name:'arroz crudo',quantity:200,unit:'g'}]);
  expect(compileGroceries(diets,[{...schedule[0],days:0},schedule[1]])[0].quantity).toBe(400);
 });
 it.each([['1 ½ tazas de avena',1.5],['1 1/2 tazas de avena',1.5],['3/4 taza de avena',.75],['0,5 taza de avena',.5]])('reads %s without rounding practical portions',(source,n)=>expect(parseGroceryIngredient(source).quantity).toBe(n));
 it.each(['100–150 g de pollo','1 taza de jitomate y cebolla','Aceite al gusto','2 huevos o 60 g de queso'])('does not invent quantities for %s',source=>expect(parseGroceryIngredient(source).quantity).toBeNull());
 it('surfaces diets without ingredient bullets instead of silently returning an empty cart',()=>expect(compileGroceries([{...diets[0],text:'Comer dos huevos'}],[schedule[0]])[0].needsReview).toBe(true));
});
it('binds the reviewed list to exact diet text and projects only patient-facing fields into exports',()=>{
 const shopping_list={schema_version:1 as const,source_key:grocerySourceKey(diets),reviewed_at:'2026-10-08T12:00:00Z',schedule,items:[{name:'pollo cocido',quantity:760,unit:'g'}]};
 const draft:TextDiet={schema_version:1,requested_count:2,diets,meals:[{name:'Comida',time:null}],prescription:{target_calories:null,macro_distribution:null},reviewed_at:shopping_list.reviewed_at,shopping_list};
 expect(isTextDiet(draft)).toBe(true);
 expect(isGroceryList(shopping_list,[{...diets[0],text:'Cambio de porciones'},diets[1]])).toBe(false);
 expect(isGroceryList({...shopping_list,schedule:schedule.map(s=>({...s,days:0}))},diets)).toBe(false);
 expect(isGroceryList({...shopping_list,items:[{name:'Pollo',quantity:Infinity,unit:'g'}]},diets)).toBe(false);
 const raw={versionNumber:1,publishedAt:shopping_list.reviewed_at,snapshot:{text_diet:draft,plan:{title:'Plan'},patient:{full_name:'Paciente de prueba'},professional:{full_name:'Profesional'},prescription:{macro_distribution:null}}};
 expect(projectPortalPlan(raw)?.shoppingList).toEqual(patientGroceries(shopping_list,diets));
 expect(JSON.stringify(projectPortalPlan(raw)?.shoppingList)).not.toContain('source_key');
 const model=buildPlanDocument(raw,{});
 expect(renderPlanTex(model)).toContain('Tu carrito del súper');
 expect(renderPlanTex(model)).toContain('760 g');
 expect(renderPlanTex(model)).toContain('Carnes, pescado y huevo');
 expect(new TextDecoder().decode(renderPlanPdf(model))).toContain('760 g');
 expect(isTextDiet({...draft,shopping_list:undefined})).toBe(true);
});

it.each([
 ['Pechuga de pollo cocida: 120 g','Pechuga de pollo cocida',120,'g'],
 ['Arroz cocido — 1/2 taza','Arroz cocido',.5,'taza'],
 ['Leche (250 ml)','Leche',250,'ml'],
 ['**100g de zanahoria**','zanahoria',100,'g'],
 ['2 huevos','huevos',2,'pieza'],
 ['1 cda. de aceite de oliva','aceite de oliva',1,'cucharada'],
])('automatically reads existing ingredient format %s',(text,name,quantity,unit)=>{
 expect(parseGroceryIngredient(text)).toMatchObject({name,quantity,unit,needsReview:false});
});
it('preserves categories through validation and rejects invalid ones',()=>{
 const base={schema_version:1,source_key:grocerySourceKey(diets),reviewed_at:'2026-10-08T12:00:00Z',schedule,items:[{name:'Producto especial',quantity:2,unit:'pieza',category:'dairy'}]};
 expect(isGroceryList(base,diets)).toBe(true);
 expect(patientGroceries(base,diets)?.items[0].category).toBe('dairy');
 expect(isGroceryList({...base,items:[{...base.items[0],category:'unexpected'}]},diets)).toBe(false);
});

it('sums common singular and plural pieces without conflating preparation',()=>{
 const days=[{id:'one',title:'Dieta 1',text:'• 2 huevos\n• 1 pieza de huevo\n• 1 pieza de huevo cocido'}];
 const rows=compileGroceries(days,[{diet_id:'one',title:'Dieta 1',days:2}]);
 expect(rows).toHaveLength(2);
 expect(rows[0].quantity).toBe(6);
 expect(rows[1].quantity).toBe(2);
});

it('groups by shopping aisle and respects explicit corrections',()=>{
 expect(inferGroceryCategory('Leche de almendra')).toBe('dairy');
 expect(inferGroceryCategory('Crema de cacahuate')).toBe('fats');
 expect(inferGroceryCategory('Papa cocida')).toBe('produce');
 expect(groupGroceries([{name:'Arroz'},{name:'Pollo',category:'other'}]).map(group=>group.id)).toEqual(['grains','other']);
});
