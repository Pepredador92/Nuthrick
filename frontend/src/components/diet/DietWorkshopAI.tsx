import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, Sparkles, X } from 'lucide-react';
import { AIRequestError } from '@/src/services/ai';
import { workshopTransport, type WorkshopTransport, type WorkshopPreflight, type WorkshopProposal, type WorkshopContext } from '@/src/services/dietWorkshopAI';
import { hasDietMenuContent } from '@/src/features/diet-workshop/generationBoundary';
import { activeMenu } from '@/src/features/menu/model';
import { foodUnitLabels } from '@/src/features/menu/units';
import { copilotMessage, factText, nutritionLabels, numberText, targetNutrition } from './dietCopilotPresentation';
import type { NutritionPlan } from '@/src/types/domain';

function ContextSummary({context:c}:{context:WorkshopContext}) {
  const targets=targetNutrition(c);
  return <section aria-label="Contexto revisado" className="space-y-3 rounded-xl border border-[#dfe6e1] bg-[#f7faf7] p-4 text-sm">
    <div><h3 className="font-semibold">Prescripción</h3><p>{nutritionLabels.map(([key,label,unit])=>`${label}: ${(key==='energy_kcal'?c.prescription.energy_kcal.fact:c.prescription.macros.fact).state==='known'?`${numberText(targets[key])} ${unit}`:'No especificado'}`).join(' · ')}</p></div>
    <div><h3 className="font-semibold">Objetivo aprobado</h3><p>{factText(c.clinical.objective.fact)}</p></div>
    <div><h3 className="font-semibold">PES aprobado</h3><p>{factText(c.clinical.pes.fact)}</p></div>
    <div><h3 className="font-semibold">Tiempos</h3><p>{c.meals.join(' · ') || 'No especificado'}</p></div>
    <div><h3 className="font-semibold">Restricciones revisadas</h3><p>Reacciones alimentarias: {factText(c.restrictions.reaction_status.fact)}</p>
      <p>{factText(c.restrictions.reactions.fact,rows=>rows.map(r=>`${r.food}: ${r.classification}${r.management?` · ${r.management}`:''}`).join('; '))}</p></div>
    <div><h3 className="font-semibold">Preferencias</h3><p>Patrón: {factText(c.preferences.eating_pattern.fact,v=>v.join(', '))}</p>
      <p>Alimentos: {factText(c.preferences.foods.fact,v=>v.map(f=>`${f.food}: ${f.category}`).join('; '))}</p></div>
    <details><summary className="cursor-pointer text-[#477363]">Rutina conocida</summary><p>{factText(c.routine.usual_pattern.fact,v=>v.join(', '))}</p>
      <p>Tiempo para cocinar: {factText(c.routine.cooking_time.fact)}</p><p>Equipo: {factText(c.routine.food_equipment.fact,v=>v.join(', '))}</p>
      <p>{factText(c.routine.daily_schedule.fact,rows=>rows.map(r=>Object.values(r).join(' · ')).join('; '))}</p></details>
  </section>;
}

export function DietWorkshopAI({plan,before,onApplied,transport=workshopTransport}:{plan:NutritionPlan;before:()=>Promise<NutritionPlan>;onApplied:(plan:NutritionPlan)=>void;transport?:WorkshopTransport}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState<'context'|'generate'|'apply'|'discard'|'status'|null>(null);
  const [preflight,setPreflight]=useState<WorkshopPreflight|null>(null),[proposal,setProposal]=useState<WorkshopProposal|null>(null);
  const [contextOpen,setContextOpen]=useState(false),[instructions,setInstructions]=useState(''),[error,setError]=useState('');
  const [accept,setAccept]=useState(false),[replace,setReplace]=useState(false),[stale,setStale]=useState(false),[notice,setNotice]=useState('');
  const storageKey=`workshop-ai-pending:${plan.id}`;
  const [uncertain,setUncertain]=useState(()=>sessionStorage.getItem(storageKey));
  const lock=useRef(false),dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLButtonElement>(null),replacement=useRef<HTMLElement>(null);
  const generatedToken=useRef(''),wasOpen=useRef(false),id=useId();
  useEffect(()=>{
    const d=dialog.current;
    if(open){wasOpen.current=true;d?.showModal?.();d?.querySelector<HTMLElement>('h2')?.focus();}
    else if(wasOpen.current){wasOpen.current=false;opener.current?.focus();}
    return ()=>{if(d?.open)d.close?.();};
  },[open]);
  useEffect(()=>{if(replace){replacement.current?.focus();replacement.current?.scrollIntoView?.({block:'center'});}},[replace]);
  const fail=(e:unknown)=>setError(copilotMessage(e instanceof AIRequestError?e.code:'service_unavailable'));
  async function show() {
    if(lock.current)return;
    lock.current=true;setOpen(true);setBusy('context');setError('');setNotice('');setPreflight(null);setStale(false);setContextOpen(false);
    try {const saved=await before();setPreflight(await transport.preflight(saved,instructions));}catch(e){fail(e);}finally{lock.current=false;setBusy(null);}
  }
  async function generate() {
    if(lock.current||uncertain||!preflight?.eligible||proposal)return;
    lock.current=true;setBusy('generate');setError('');let key:string|null=null;
    try {
      const saved=await before(),fresh=await transport.preflight(saved,instructions);
      setPreflight(fresh);if(!fresh.eligible)return;
      generatedToken.current=fresh.contextToken;
      key=crypto.randomUUID();sessionStorage.setItem(storageKey,key);
      const result=await transport.generate(saved,instructions,key);
      setProposal(result);setAccept(false);setReplace(false);setContextOpen(false);sessionStorage.removeItem(storageKey);
    } catch(e) {
      if(key && (!(e instanceof AIRequestError)||['provider_outcome_unknown','service_unavailable'].includes(e.code)))setUncertain(key);
      else if(key)sessionStorage.removeItem(storageKey);
      fail(e);
    } finally {lock.current=false;setBusy(null);}
  }
  async function dismiss() {
    if(lock.current)return;
    lock.current=true;setBusy('discard');setError('');
    try {if(proposal)await transport.decide(proposal,false,false,false);setProposal(null);setReplace(false);setOpen(false);opener.current?.focus();}
    catch(e){fail(e);}finally{lock.current=false;setBusy(null);}
  }
  async function apply(confirmed=false) {
    if(!proposal||lock.current||proposal.validation.status==='invalid'||stale||((proposal.validation.requiresTargetReview||proposal.validation.status==='needs_adjustment')&&!accept))return;
    lock.current=true;setBusy('apply');setError('');
    try {
      const saved=await before(),fresh=await transport.preflight(saved,instructions);
      if(fresh.contextToken!==generatedToken.current){setStale(true);setReplace(false);throw new AIRequestError('context_changed');}
      if((proposal.hasManualMenu||hasDietMenuContent(saved.diet_menu))&&!confirmed){setReplace(true);return;}
      const updated=await transport.decide(proposal,true,confirmed,accept);
      if(!updated)throw new AIRequestError('service_unavailable');
      setProposal(null);setReplace(false);setOpen(false);setNotice('Propuesta aplicada al borrador. Puedes editarla en el Taller.');onApplied(updated);opener.current?.focus();
    }catch(e){if(e instanceof AIRequestError&&e.code==='context_changed')setStale(true);fail(e);}finally{lock.current=false;setBusy(null);}
  }
  async function checkPending() {
    if(lock.current||!uncertain)return;
    lock.current=true;setBusy('status');
    try {const s=await transport.status(uncertain);if(s&&['failed','invalid_output','succeeded'].includes(s.status)){
      sessionStorage.removeItem(storageKey);setUncertain(null);setError('La solicitud terminó. No se enviará otra propuesta automáticamente.');
    }else setError(copilotMessage('provider_outcome_unknown'));}catch(e){fail(e);}finally{lock.current=false;setBusy(null);}
  }
  const v=proposal?.validation,targets=preflight?targetNutrition(preflight.context):null;
  const needsAcceptance=Boolean(v&&(v.status==='needs_adjustment'||v.requiresTargetReview));
  return <>
    <button ref={opener} data-diet-ai-entry type="button" className="nuth-button-secondary !px-3 !py-2 !text-xs" onClick={()=>void show()}><Sparkles size={15}/>Crear propuesta con IA</button>
    {notice&&<span role="status" className="text-xs text-[#477363]">{notice}</span>}
    {open&&<dialog ref={dialog} open={typeof HTMLDialogElement==='undefined'||!HTMLDialogElement.prototype.showModal} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      className="m-auto max-h-[90dvh] w-[min(820px,calc(100vw-24px))] overflow-auto rounded-2xl border border-[#d4e2d8] bg-white p-4 text-[#173d36] shadow-xl backdrop:bg-[#173d36]/35 sm:p-6"
      onCancel={e=>{e.preventDefault();void dismiss();}}>
      <header className="flex items-start justify-between gap-3"><h2 id={`${id}-title`} tabIndex={-1} className="text-xl font-semibold">{proposal?'Propuesta lista para revisar':'Crear propuesta con IA'}</h2>
        <button type="button" aria-label="Cerrar propuesta" className="rounded-lg p-2" disabled={!!busy} onClick={()=>void dismiss()}><X size={18}/></button></header>
      <p id={`${id}-description`} className="my-3 text-sm text-[#74817d]">{proposal?'Borrador · Podrás editarlo en el Taller después de aplicar. No se publicará ni compartirá automáticamente.':'Nuthrick preparará una propuesta utilizando la prescripción y el contexto revisado. Tu borrador no cambiará hasta que decidas aplicarla.'}</p>
      {error&&<p role="alert" className="my-3 rounded-xl bg-[#fff7e7] p-3 text-sm">{error}</p>}
      {busy&&<div role="status" className="my-5 flex items-start gap-2 text-sm"><LoaderCircle size={18} className="shrink-0 animate-spin"/><div>{busy==='generate'?'Preparando propuesta…':busy==='apply'?'Revisando y aplicando al borrador…':busy==='context'?'Revisando contexto…':'Comprobando solicitud…'}{busy==='generate'&&<p className="mt-1 text-[#74817d]">Tu borrador permanece sin cambios mientras preparamos la propuesta.</p>}</div></div>}
      {preflight&&!proposal&&<>
        {!preflight.eligible&&<ul aria-label="Requisitos pendientes" className="my-3 space-y-1 rounded-xl bg-[#fff7e7] p-3 text-sm">{[...new Set(preflight.reasons.map(r=>copilotMessage(r.code)))].map(m=><li key={m}>{m}</li>)}</ul>}
        <button type="button" className="my-2 text-sm font-semibold text-[#477363] underline" aria-expanded={contextOpen} aria-controls={`${id}-context`} disabled={!!busy} onClick={()=>setContextOpen(!contextOpen)}>{contextOpen?'Ocultar contexto':'Revisar contexto'}</button>
        {contextOpen&&<div id={`${id}-context`}><ContextSummary context={preflight.context}/></div>}
        <div className="mt-4"><label htmlFor={`${id}-instructions`} className="text-sm font-semibold">Indicaciones adicionales</label><p id={`${id}-help`} className="mt-1 text-xs text-[#74817d]">Agrega información que Nuthrick todavía no conozca.</p>
          <textarea id={`${id}-instructions`} aria-describedby={`${id}-help`} className="nuth-input mt-2 min-h-24 resize-y" maxLength={1200} disabled={!!busy} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Ej. desayuno para llevar, preparaciones rápidas, priorizar alimentos económicos…"/></div>
      </>}
      {v&&<>
        <section className={`my-4 rounded-xl border p-3 text-sm ${v.status==='valid'?'border-[#d4e2d8] bg-[#edf5f0]':'border-[#efdab1] bg-[#fff7e7]'}`}>
          <h3 className="font-semibold">{v.status==='valid'?'Compatible con la prescripción':v.status==='needs_adjustment'?'Requiere revisión':'Esta propuesta no se puede aplicar'}</h3>
          {v.status==='valid'&&<p>Revisa la propuesta antes de aplicarla.</p>}
          <ul>{[...new Set(v.issues.map(i=>copilotMessage(i.code)))].map(m=><li key={m}>{m}</li>)}</ul>
        </section>
        {v.totals&&targets&&<section aria-label="Comparación nutricional" className="my-4 grid gap-2 sm:grid-cols-2">
          {nutritionLabels.map(([key,label,unit])=><div key={key} className="rounded-xl border border-[#dfe6e1] p-3 text-sm"><h3 className="font-semibold">{label}</h3>
            <p>Objetivo: {numberText(targets[key])} {unit}</p><p>Propuesta: {numberText(v.totals![key])} {unit}</p><p className="text-[#74817d]">Diferencia: {numberText(v.totals![key]-targets[key])} {unit}</p></div>)}
        </section>}
        {v.draft&&<div className="space-y-3">{activeMenu(v.draft).meal_menus.map((meal,i)=><section key={meal.meal_time_id} className="rounded-xl border border-[#dfe6e1] p-3 text-sm">
          <h3 className="font-semibold">{preflight?.context.meals[plan.meal_distribution?.meal_times.slice().sort((a,b)=>a.display_order-b.display_order).findIndex(m=>m.id===meal.meal_time_id)??i]??'Tiempo de comida'}</h3><ul className="mt-2 space-y-1">{meal.entries.map(e=><li key={e.id}>{e.name_snapshot} · {numberText(e.quantity)} {e.unit==='recipe_serving'?'porción':foodUnitLabels[e.unit]}{e.recipe_snapshot?.instructions&&<p className="mt-1 text-xs text-[#74817d]">{e.recipe_snapshot.instructions}</p>}</li>)}</ul>
        </section>)}</div>}
        {needsAcceptance&&v.status!=='invalid'&&<label className="my-4 flex items-start gap-2 rounded-xl bg-[#fff7e7] p-3 text-sm"><input type="checkbox" className="mt-1" checked={accept} disabled={!!busy||stale} onChange={e=>setAccept(e.target.checked)}/>Revisé las diferencias de la propuesta</label>}
      </>}
      {replace&&<section ref={replacement} tabIndex={-1} aria-label="Confirmar reemplazo" className="mt-4 rounded-xl border border-[#efdab1] bg-[#fff7e7] p-4 text-sm"><p>Ya existe contenido en este borrador. Aplicar esta propuesta reemplazará el menú actual del borrador.</p><div className="mt-3 flex flex-wrap gap-2"><button className="nuth-button-secondary" disabled={!!busy} onClick={()=>setReplace(false)}>Cancelar</button><button className="nuth-button" disabled={!!busy||stale} onClick={()=>void apply(true)}>Reemplazar con propuesta IA</button></div></section>}
      <footer className="sticky -bottom-4 mt-5 flex flex-wrap gap-2 border-t border-[#dfe6e1] bg-white py-3 sm:-bottom-6">
        {!proposal&&<button className="nuth-button" disabled={!!busy||!preflight?.eligible||!!uncertain} onClick={()=>void generate()}>Generar propuesta</button>}
        {proposal&&v?.status!=='invalid'&&!replace&&<button className="nuth-button" disabled={!!busy||stale||(needsAcceptance&&!accept)} onClick={()=>void apply()}>Aplicar al borrador</button>}
        {uncertain&&<button className="nuth-button-secondary" disabled={!!busy} onClick={()=>void checkPending()}>Consultar solicitud pendiente</button>}
        <button className="nuth-button-secondary" disabled={!!busy} onClick={()=>void dismiss()}>{proposal?'Descartar propuesta':'Continuar manualmente'}</button>
      </footer>
    </dialog>}
  </>;
}
