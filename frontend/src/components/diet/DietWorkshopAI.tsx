import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { AIRequestError, getAIGenerationStatus, runAIRequest } from '@/src/services/ai';
import { decideWorkshop, workshopAIStatus, type WorkshopPreview } from '@/src/services/dietWorkshopAI';
import { activeMenu } from '@/src/features/menu/model';
import { getExchangeGroup } from '@/src/features/exchanges/catalog';
import { foodUnitLabels } from '@/src/features/menu/units';
import type { NutritionPlan } from '@/src/types/domain';

export function DietWorkshopAI({plan,before,onApplied}:{plan:NutritionPlan;before:()=>Promise<NutritionPlan>;onApplied:(plan:NutritionPlan)=>void}) {
  const [enabled,setEnabled]=useState(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[preview,setPreview]=useState<WorkshopPreview|null>(null),[error,setError]=useState('');
  const [rejected,setRejected]=useState<string[]>([]),[signatures,setSignatures]=useState<string[]>([]);
  const storageKey=`workshop-ai-pending:${plan.id}`;
  const [uncertain,setUncertain]=useState(()=>sessionStorage.getItem(storageKey));
  const lock=useRef(false),dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{let active=true;void workshopAIStatus(plan.id).then(s=>{if(active)setEnabled(s.enabled);});return()=>{active=false;};},[plan.id]);
  useEffect(()=>{if(open)dialog.current?.showModal();else if(dialog.current?.open)dialog.current.close();},[open]);
  const ready=Boolean(plan.target_calories&&plan.macro_distribution?.complete&&(!plan.patient_id||plan.consultation_id));
  const generate=async()=>{
    if(lock.current||uncertain)return;
    lock.current=true;setBusy(true);setError('');
    let key:string|null=null;
    try {
      const saved=await before();
      if(preview) {await decideWorkshop(preview,false);setPreview(null);}
      key=crypto.randomUUID();sessionStorage.setItem(storageKey,key);
      const result=await runAIRequest({feature:'diet_workshop',idempotencyKey:key,planId:saved.id,revision:saved.draft_revision??1,
        ...(saved.patient_id?{patientId:saved.patient_id}:{}),...(saved.consultation_id?{consultationId:saved.consultation_id}:{}),rejectedFoodIds:rejected,rejectedSignatures:signatures.slice(-3)});
      if(!result.output){setUncertain(key);throw new Error('Consulta el estado de esta solicitud antes de generar otra.');}
      setPreview(result.output as WorkshopPreview);sessionStorage.removeItem(storageKey);
      setSignatures(v=>[...v,(result.output as WorkshopPreview).menuSignature].slice(-3));
    } catch(e) {
      if(e instanceof AIRequestError) {
        const pending=['provider_outcome_unknown','service_unavailable'].includes(e.code);
        if(pending&&key)setUncertain(key);else sessionStorage.removeItem(storageKey);
        setError(({feature_disabled:'Asistente de IA no disponible.',insufficient_credits:'No tienes créditos de IA disponibles.',pilot_limit_reached:'El límite del piloto para esta función ya se alcanzó.',pilot_daily_limit:'El piloto alcanzó su límite diario de generaciones.',pilot_daily_budget:'El piloto alcanzó su presupuesto diario de créditos.',targets_required:'Completa Energía y Macros antes de generar una propuesta.',proposal_unavailable:'No pude construir una propuesta completa con estas condiciones.',invalid_output:'No pude construir una propuesta completa con estas condiciones.',restrictions_need_review:'Hay alergias o intolerancias clínicas que requieren revisión manual. Usa el Taller manual para este plan.'} as Record<string,string>)[e.code]??e.message);
      } else setError(e instanceof Error?e.message:'No se pudo generar la propuesta.');
    } finally {lock.current=false;setBusy(false);}
  };
  const dismiss=async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{if(preview)await decideWorkshop(preview,false);setPreview(null);setOpen(false);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}};
  const apply=async()=>{if(!preview||lock.current)return;lock.current=true;setBusy(true);try{await before();const updated=await decideWorkshop(preview,true);setPreview(null);setOpen(false);onApplied(updated);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}};
  return <section className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Asistente del Taller">
    <button className="nuth-button-secondary !py-2" disabled={!enabled} onClick={()=>setOpen(true)}><Sparkles size={15}/>Crear propuesta con IA</button>
    {!enabled&&<span className="text-xs text-[#74817d]">Asistente de IA no disponible.</span>}
    <dialog ref={dialog} aria-labelledby="workshop-ai-title" className="m-auto max-h-[90vh] w-[min(860px,94vw)] overflow-auto rounded-2xl bg-white p-5 text-[#173d36] backdrop:bg-black/30" onCancel={e=>{e.preventDefault();void dismiss();}}>
      <header className="flex items-center justify-between gap-3"><h2 id="workshop-ai-title" className="text-xl font-semibold">{preview?'Propuesta de plan':'Crear propuesta con IA'}</h2><button aria-label="Cerrar propuesta" disabled={busy} onClick={()=>void dismiss()}><X size={18}/></button></header>
      <p className="my-3 text-sm text-[#74817d]">{plan.patient_id?'Se utilizará la consulta seleccionada y el objetivo acordado más reciente.':'Esta propuesta se generará sin contexto de paciente.'} Aplicar solo guarda un borrador.</p>
      {!ready&&<p role="status">{plan.patient_id&&!plan.consultation_id?'Selecciona la consulta del paciente.':'Completa Energía y Macros antes de generar una propuesta.'}</p>}
      {error&&<p role="alert" className="my-3 rounded-lg bg-amber-50 p-3">{error}</p>}
      {uncertain&&<button className="nuth-button-secondary" disabled={busy} onClick={()=>void getAIGenerationStatus(uncertain).then(s=>{if(s&&['failed','invalid_output','succeeded'].includes(s.status)){sessionStorage.removeItem(storageKey);setUncertain(null);setError('Solicitud resuelta. Puedes generar una nueva propuesta.');}else setError('La solicitud sigue pendiente. No se enviará otra generación.');}).catch(()=>setError('No pudimos consultar el estado.'))}>Consultar solicitud pendiente</button>}
      {busy&&<p role="status" className="my-4">Preparando la propuesta…</p>}
      {preview&&<>
        <p className="my-3 text-sm">Objetivo energético conservado: {plan.target_calories} kcal. Propuesta: {Math.round(preview.patch.exchange_prescription?.derived_totals?.energy_kcal??0)} kcal según equivalentes.</p>
        {preview.goal&&<p className="my-3"><span className="font-semibold">Objetivo: </span>{preview.goal}</p>}
        <p className="my-3">{preview.summary}</p>
        <div className="my-4 flex flex-wrap gap-2">{preview.patch.exchange_prescription?.groups.filter(g=>g.portions>0).map(g=><span className="rounded-lg bg-[#eef5f0] px-3 py-1 text-xs" key={g.group_code}>{getExchangeGroup(g.group_code).shortName}: {g.portions}</span>)}</div>
        <div className="grid gap-3 sm:grid-cols-2">{preview.patch.diet_menu&&activeMenu(preview.patch.diet_menu).meal_menus.map(m=><section key={m.meal_time_id} className="rounded-xl border border-[#dfe6e1] p-4"><h3 className="font-semibold">{preview.patch.meal_distribution?.meal_times.find(t=>t.id===m.meal_time_id)?.display_name}</h3><ul className="mt-2 space-y-2">{m.entries.map(e=><li key={e.id} className="text-sm">{e.name_snapshot} · {e.quantity} {e.unit==='recipe_serving'?'porción':foodUnitLabels[e.unit]}<label className="ml-2 text-xs text-[#74817d]"><input type="checkbox" aria-label={`Evitar ${e.name_snapshot} en otra propuesta`} checked={(e.food_snapshot?[e.source_id]:e.recipe_snapshot?.items.map(i=>i.food_snapshot.id)??[]).every(id=>rejected.includes(id))} onChange={ev=>{const ids=e.food_snapshot?[e.source_id]:e.recipe_snapshot?.items.map(i=>i.food_snapshot.id)??[];setRejected(v=>ev.target.checked?[...new Set([...v,...ids])].slice(-30):v.filter(id=>!ids.includes(id)));}}/>Otra opción</label></li>)}</ul></section>)}</div>
        {[...preview.warnings,...preview.assumptions].map((w,i)=><p key={i} className="mt-3 text-sm text-amber-800">{w}</p>)}
        <p className="my-4 text-xs text-[#74817d]">Podrás editar todo en el Taller después de aplicar. “Otra opción” solo afecta esta búsqueda; no registra alergias ni exclusiones clínicas.</p>
      </>}
      <footer className="mt-5 flex flex-wrap gap-2">
        {preview&&<button className="nuth-button" disabled={busy} onClick={()=>void apply()}>Aplicar propuesta</button>}
        <button className="nuth-button-secondary" disabled={!ready||busy||Boolean(uncertain)} onClick={()=>void generate()}>{preview?'Otra propuesta':'Generar propuesta'}</button>
        <button className="nuth-button-secondary" disabled={busy} onClick={()=>void dismiss()}>{preview?'Descartar':'Continuar manualmente'}</button>
      </footer>
    </dialog>
  </section>;
}
