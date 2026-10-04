import {useState,useMemo,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {GuidedDietAI} from '../../src/components/diet/GuidedDietAI';
import {DietEquivalentsStep} from '../../src/components/diet/DietEquivalentsStep';
import {DietMenuStep} from '../../src/components/diet/DietMenuStep';
import {dietCalibrationFixture} from '../../src/features/diet-workshop/generationCalibrationFixtures';
import {prepareGuidedDiet} from '../../src/features/diet-workshop/guidedPreparation';
import {getDietGenerationEligibility,prepareDietGeneration,validateDietSnapshotDraft,type GenerationInput} from '../../src/features/diet-workshop/generationBoundary';
import {foodTargetsFor} from '../../src/features/supplements/targets';
import type {WorkshopTransport} from '../../src/services/dietWorkshopAI';
import '../../app/globals.css';
function Harness(){
 const fixture=useMemo(()=>{const f=dietCalibrationFixture('A');f.source.plan.exchange_prescription=null;f.source.plan.meal_distribution=null;f.source.plan.diet_menu=null;f.source.plan.updated_at='2026-10-03T12:00:00Z';f.source.datedContext=[{date:'2026-10-03',current:true,facts:[{key:'treatment_objective',value:'Organizar los tiempos de comida.'}]},{date:'2026-08-01',current:false,facts:[{key:'cooking_time',value:'20 minutos para preparar la comida.'}]}];return f;},[]);
 const [plan,setPlan]=useState(fixture.source.plan),[applied,setApplied]=useState(false);
 const generated=useRef<typeof plan|undefined>(undefined);
 const transport:WorkshopTransport=useMemo(()=>{return{status:async()=>null,preflight:async(p,n,g)=>{const source={...fixture.source,plan:p,additionalInstructions:n,...(g?{guidance:g}:{})};const guided=prepareGuidedDiet(source);const r=getDietGenerationEligibility({source:guided.source,policy:{restrictions:{},unresolved:[]},sanitizeText:s=>s},{enabled:true,budgetAvailable:true,pending:false}),c=r.context;return{eligible:r.eligible&&!guided.issues.length,reasons:[...r.reasons,...guided.issues],contextToken:JSON.stringify([p,n,g]),context:{...c,meals:c.meals.fact.state==='known'?c.meals.fact.value.map(m=>m.display_name):[]}};},generate:async(p,n,_k,g)=>{const i:GenerationInput={source:prepareGuidedDiet({...fixture.source,plan:p,additionalInstructions:n,guidance:g}).source,policy:{restrictions:{},unresolved:[]},sanitizeText:s=>s};const ready=prepareDietGeneration(i,{enabled:true,budgetAvailable:true,pending:false}).prepared!;const raw={schema_version:1,meal_options:ready.payload.meals.map(m=>({meal_ref:m.meal_ref,entries:m.distribution.map(group=>{const foods=m.candidates.filter(c=>c.type==='food'&&c.exchanges.some(e=>e.group_code===group.group_code));return{candidate_ref:foods[((m.alternative??1)-1)%foods.length].candidate_ref,portion_ref:'base',multiplier:group.portions};})}))};const validation=validateDietSnapshotDraft(raw,ready,i.source.plan);generated.current={...i.source.plan,diet_menu:validation.draft!};return{generationId:'synthetic',validation,hasManualMenu:false};},decide:async(_p,apply)=>apply?generated.current:undefined};},[fixture]);
 return <main className="mx-auto max-w-[1440px] p-3 sm:p-8"><p className="mb-4 text-xs">Prueba local · Datos ficticios · Sin llamadas a OpenAI</p>{applied?<DietMenuStep plan={plan} catalog={fixture.source.catalog} onSave={async menu=>setPlan(p=>({...p,diet_menu:menu}))} onGoToMeals={()=>setApplied(false)}/>:<DietEquivalentsStep plan={plan} targets={foodTargetsFor(plan)} catalog={fixture.source.catalog} onSave={async()=>{}} onDraftChange={()=>{}} onGoToMacros={()=>{}} headerActions={<GuidedDietAI plan={plan} before={async()=>plan} transport={transport} onApplied={p=>{setPlan(p);setApplied(true);}}/>}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
