import {buildPlanDocument,renderPlanPdf,renderPlanTex} from '../supabase/functions/agenda/plan-document.ts';
import {encode} from 'npm:fast-png@6.4.0';
// Synthetic QA only. No clinical records or production credentials.
const times=Array.from({length:6},(_,i)=>({id:`m${i}`,display_name:['Desayuno','Colación matutina','Comida','Colación vespertina','Cena','Colación nocturna'][i],display_order:i,time:`${8+i*2}:00`}));
const option=(i:number)=>({name:'Platillo de prueba',entries:[{id:`e${i}`,quantity:1,unit:'recipe_serving',name_snapshot:'Verduras con arroz',recipe_snapshot:{servings:1,items:[{amount:2,unit:'cup',food_snapshot:{name:'Verduras variadas',group_code:'VEGETABLES'}},{amount:1,unit:'cup',food_snapshot:{name:'Arroz cocido',group_code:'CEREALS_NO_FAT'}}],instructions:'Preparación de prueba. Enjuaga las verduras, cocina el arroz y sirve juntos. '+('Texto extenso con español: piña, jalapeño, ¿cómo está?, ¡bien! José & María 50% Plan_A $500 #1. '.repeat(i===2?45:1))}},{id:`w${i}`,quantity:240,unit:'ml',name_snapshot:'Agua natural'}]});
const raw={versionNumber:1,publishedAt:'2026-09-21T18:00:00Z',snapshot:{plan:{title:'Plan_A · José & María · 50% adherencia · $500 · #1'},patient:{full_name:'José & María'},professional:{full_name:'Andrea Ríos',professional_title:'Licenciada en Nutrición'},prescription:{meal_distribution:{meal_times:times}},calendar:['mon','tue'].map(day=>({day,assignments:times.map((m,i)=>({meal_time_id:m.id,option_snapshot:option(i)}))}))}};
const profile={licenseNumber:'CÉDULA DE PRUEBA',businessName:'Nuthrick · Nutrición y bienestar',businessAddress:'Domicilio de ejemplo',contactLines:['Contacto de prueba']};
const model=buildPlanDocument(raw,profile);
const dir=new URL('../tmp/pdfs/plan-exports/',import.meta.url);await Deno.mkdir(dir,{recursive:true});
await Deno.writeFile(new URL('plan-seis-tiempos.pdf',dir),renderPlanPdf(model));
await Deno.writeTextFile(new URL('plan-seis-tiempos.tex',dir),renderPlanTex(model));
const logo='data:image/png;base64,'+btoa(String.fromCharCode(...encode({width:2,height:2,data:new Uint8Array([23,61,54,255,205,161,96,255,205,161,96,255,23,61,54,255]),channels:4})));
await Deno.writeTextFile(new URL('plan-logo.tex',dir),renderPlanTex(model,logo));
model.plan.days=model.plan.days.slice(0,1);model.plan.days[0].meals=model.plan.days[0].meals.slice(0,3);
await Deno.writeFile(new URL('plan-tres-tiempos.pdf',dir),renderPlanPdf(model));
// Layout-only stress case: synthetic alternatives, not clinical suggestions.
model.plan.days[0].meals[0].ingredients[0].alternatives=Array.from({length:20},(_,i)=>({name:`Alternativa ficticia ${i+1}: descripción larga de prueba para verificar saltos de línea y mantener cantidades legibles`,amount:i+1,unit:'g'}));
await Deno.writeFile(new URL('plan-sustituciones.pdf',dir),renderPlanPdf(model,logo));
console.log('Synthetic PDF and TEX fixtures ready.');
