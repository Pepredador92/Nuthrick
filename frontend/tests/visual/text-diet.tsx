import {useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TextDietAI} from '../../src/components/diet/TextDietAI';
import {TextDietReviewStep} from '../../src/components/diet/TextDietReview';
import {PortalPlanContent} from '../../src/components/patients/PortalPlan';
import {uxFixture} from '../fixtures/dietCopilotUX';
import type {TextDietTransport} from '../../src/services/textDietAI';
import type {NutritionPlan} from '../../src/types/domain';
import type {TextDiet} from '../../../supabase/functions/_shared/text-diet';
import '../../app/globals.css';
function Harness(){
 const f=useMemo(()=>uxFixture(),[]),[plan,setPlan]=useState<NutritionPlan>(()=>({...f.input.source.plan,diet_menu:null})),[published,setPublished]=useState(false);
 const transport:TextDietTransport=useMemo(()=>{let generated=plan;return{
 preflight:async(p,g,n)=>{const r=await f.transport.preflight(p,n);return{...r,context:r.context!,eligible:true,reasons:[],contextToken:JSON.stringify([g,n])};},
 generate:async(p,g)=>{const textDraft:TextDiet={schema_version:1,requested_count:g.dietCount,meals:g.meals,reviewed_at:null,prescription:{target_calories:p.target_calories,macro_distribution:p.macro_distribution},diets:Array.from({length:g.dietCount},(_,i)=>({id:`diet-${i}`,title:`Dieta ${i+1}`,text:`Desayuno · 08:00\nHuevos a la mexicana con tortilla y papaya\n• 2 huevos\n• 2 tortillas de maíz\n• ½ taza de jitomate y cebolla\n• 1 cucharadita de aceite\n• 1 taza de papaya\nPreparación: cocinar el huevo con las verduras y el aceite; acompañar con tortilla y papaya.\n\nComida · 14:00\nPollo con arroz y calabacitas\n• 120 g de pollo cocido\n• ¾ taza de arroz cocido\n• 1 taza de calabacitas\nPreparación: servir el pollo con el arroz y las verduras.\n\nCena · 20:00\nTostadas de frijol con panela\n• 2 tostadas horneadas\n• ½ taza de frijoles cocidos\n• 40 g de queso panela\nPreparación: untar los frijoles sobre las tostadas y añadir el queso.\n\nEjemplo sintético ${i+1}, no es una dieta generada por IA.`}))};generated={...p,text_diet:textDraft};return{generationId:'synthetic',textDraft};},
 apply:async()=>generated,recover:async()=>({generationId:'synthetic',textDraft:generated.text_diet!}),status:async()=>null,discard:async()=>{}
 };},[f,plan]);
 return <main className="mx-auto max-w-[1200px] p-3 sm:p-8"><p className="mb-4 text-xs">Prueba local · Datos ficticios · Sin llamadas a OpenAI</p>{published?<PortalPlanContent plan={{title:plan.title,versionNumber:1,publishedAt:'2026-10-04T12:00:00Z',days:plan.text_diet!.diets.map(d=>({name:d.title,text:d.text,meals:[]}))}}/>:plan.text_diet?<TextDietReviewStep plan={plan} patientName="Paciente de prueba" versions={[]} publishing={false} onSave={async d=>{const updated={...plan,text_diet:d};setPlan(updated);return updated;}} onPublish={()=>setPublished(true)}/>:<section className="rounded-2xl bg-white p-6"><h1 className="mb-4 text-2xl">Equivalentes</h1><TextDietAI plan={plan} before={async()=>plan} transport={transport} onApplied={setPlan}/></section>}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
