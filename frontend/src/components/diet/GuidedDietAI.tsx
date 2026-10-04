import {dietClinicalLabel,dietClinicalValue} from './dietClinicalLabels';
import {useEffect, useId, useRef, useState} from 'react';
import {LoaderCircle, Sparkles, X, Plus, Trash2} from 'lucide-react';
import {useAccess} from '@/src/features/admin/AccessProvider';
import {canUseFeature} from '@/src/features/admin/api';
import {AIRequestError} from '@/src/services/ai';
import {workshopTransport, type WorkshopTransport, type WorkshopPreflight, type WorkshopProposal} from '@/src/services/dietWorkshopAI';
import {isDietGuidance, type DietGuidance, GUIDED_DIET_LIMITS} from '../../../../supabase/functions/_shared/diet-guidance';
import {factText, targetNutrition, nutritionLabels, numberText, copilotMessage} from './dietCopilotPresentation';
import type {NutritionPlan} from '@/src/types/domain';

const screens=['Contexto y objetivo','Tiempos y alternativas','Preferencias','Resumen'];
const planningReasons=new Set(['exchanges_unconfirmed','invalid_distribution','meal_structure_required','meal_structure_invalid','distribution_invalid','pes_approval_required','objective_approval_required','restrictions_need_review','candidate_coverage_missing','input_too_large']);
type Props={plan:NutritionPlan;before:()=>Promise<NutritionPlan>;onApplied:(plan:NutritionPlan)=>void;transport?:WorkshopTransport};
export function GuidedDietAI({plan,before,onApplied,transport=workshopTransport}:Props){
  const {data:access}=useAccess(),id=useId(),dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLButtonElement>(null),lock=useRef(false);
  const available=!access||canUseFeature(access.access,'ai.diet_draft');
  const [open,setOpen]=useState(false),[step,setStep]=useState(0),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const [context,setContext]=useState<WorkshopPreflight|null>(null),[checked,setChecked]=useState<WorkshopPreflight|null>(null);
  const [proposal,setProposal]=useState<WorkshopProposal|null>(null),[replace,setReplace]=useState(false);
  const [guidance,setGuidance]=useState<DietGuidance>(()=>({version:1,objective:'',contextReviewed:false,reactionReview:'recorded',meals:
    plan.meal_distribution?.meal_times.length?plan.meal_distribution.meal_times.map(m=>({name:m.display_name,type:m.meal_type,time:m.time,options:1})):
    [{name:'Desayuno',type:'BREAKFAST',time:null,options:1},{name:'Comida',type:'MAIN_MEAL',time:null,options:1},{name:'Cena',type:'DINNER',time:null,options:1}]}));
  const [preferences,setPreferences]=useState(''),[budget,setBudget]=useState(''),[cooking,setCooking]=useState(''),[extra,setExtra]=useState('');
  const storageKey=`guided-diet-pending:${plan.id}`;
  const [pending,setPending]=useState(()=>sessionStorage.getItem(storageKey));
  const initialized=useRef(false),wasOpen=useRef(false);
  const instructions=[preferences&&`Preferencias: ${preferences}`,budget&&`Presupuesto: ${budget}`,cooking&&`Tiempo disponible para cocinar: ${cooking}`,extra].filter(Boolean).join('\n');
  const hasContent=Boolean(plan.exchange_prescription?.groups.some(g=>g.portions>0)||plan.meal_distribution?.distribution.length||plan.diet_menu?.meal_options?.length);
  const c=context?.context,targets=c?targetNutrition(c):null;
  const count=guidance.meals.reduce((n,m)=>n+m.options,0);
  useEffect(()=>{const d=dialog.current;if(open){wasOpen.current=true;d?.showModal?.();d?.querySelector<HTMLElement>('h2')?.focus();}else if(wasOpen.current){wasOpen.current=false;opener.current?.focus();}return()=>{if(d?.open)d.close?.();};},[open]);
  useEffect(()=>{dialog.current?.querySelector<HTMLElement>('h2')?.focus();dialog.current?.scrollTo?.({top:0});},[step]);
  const fail=(e:unknown)=>setError(e instanceof AIRequestError?copilotMessage(e.code):'No se pudo completar la operación. Puedes consultar la solicitud antes de volver a generar.');
  function remember(key:string|null){if(key)sessionStorage.setItem(storageKey,key);else sessionStorage.removeItem(storageKey);setPending(key);}
  async function show(){if(lock.current||!available)return;lock.current=true;setOpen(true);setBusy('Leyendo contexto de la consulta…');setError('');
    try{const saved=await before(),r=await transport.preflight(saved,'');setContext(r);
      if(!initialized.current&&r.context){const fact=r.context.clinical.objective.fact;setGuidance(g=>({...g,objective:fact.state==='known'?fact.value:r.context!.clinical.objectiveSuggestion??''}));initialized.current=true;}
    }catch(e){fail(e);}finally{lock.current=false;setBusy('');}}
  async function next(){if(lock.current)return;setError('');
    if(step===0&&(!guidance.contextReviewed||!guidance.objective.trim())){setError('Revisa el contexto y escribe el objetivo de esta propuesta.');return;}
    if(step===1&&!isDietGuidance(guidance)){setError(`Revisa los nombres, horarios y cantidades: hasta ${GUIDED_DIET_LIMITS.maxMeals} tiempos y ${GUIDED_DIET_LIMITS.maxOptions} alternativas en total.`);return;}
    if(step===2){lock.current=true;setBusy('Preparando equivalentes y distribución…');try{const saved=await before();setChecked(await transport.preflight(saved,instructions,guidance));setStep(3);}catch(e){fail(e);}finally{lock.current=false;setBusy('');}}
    else setStep(s=>s+1);
  }
  async function apply(p:WorkshopProposal,accept=false){const updated=await transport.decide(p,true,replace,accept);if(!updated)throw new AIRequestError('service_unavailable');remember(null);setProposal(null);setOpen(false);onApplied(updated);}
  async function generate(){if(lock.current||pending||!checked?.eligible||(hasContent&&!replace))return;lock.current=true;setBusy('Generando el menú y sus alternativas…');setError('');let key:string|null=null,generated=false;
    try{const saved=await before(),fresh=await transport.preflight(saved,instructions,guidance);if(fresh.contextToken!==checked.contextToken){setChecked(fresh);throw new AIRequestError('context_changed');}
      key=crypto.randomUUID();remember(key);const p=await transport.generate(saved,instructions,key,guidance);
      if(p.validation.status==='invalid'){remember(null);throw new AIRequestError(p.validation.issues[0]?.code??'invalid_output');}
      generated=true;setProposal(p);
      if(p.validation.status==='needs_adjustment'||p.validation.requiresTargetReview){setBusy('');return;}
      setBusy('Guardando el borrador…');await apply(p);
    }catch(e){if(!generated&&(!key||e instanceof AIRequestError&&!['provider_outcome_unknown','service_unavailable'].includes(e.code)))remember(null);fail(e);}finally{lock.current=false;setBusy('');}}
  async function accept(){if(lock.current||!proposal)return;lock.current=true;setBusy('Guardando el borrador…');setError('');try{await apply(proposal,true);}catch(e){fail(e);}finally{lock.current=false;setBusy('');}}
  async function recover(){if(lock.current||!pending)return;lock.current=true;setBusy('Consultando la solicitud existente…');setError('');try{const r=await transport.status(pending);
    if(r?.status==='succeeded'&&transport.recover){setProposal(await transport.recover(r.generationId));setStep(3);}
    else if(r&&['failed','invalid_output'].includes(r.status)){remember(null);setError(copilotMessage(r.errorCode??'invalid_output'));}
    else setError(copilotMessage('provider_outcome_unknown'));
  }catch(e){fail(e);}finally{lock.current=false;setBusy('');}}
  async function discard(){if(lock.current)return;lock.current=true;setBusy('Descartando propuesta…');try{if(proposal)await transport.decide(proposal,false,false,false);setProposal(null);remember(null);setChecked(null);setStep(0);}catch(e){fail(e);}finally{lock.current=false;setBusy('');}}
  const edit=(patch:Partial<DietGuidance>)=>{setGuidance(g=>({...g,...patch}));setChecked(null);};
  return <>
    <button ref={opener} type="button" data-diet-ai-entry disabled={!available} className="nuth-button !px-4 !py-2" onClick={()=>void show()}><Sparkles size={16}/>Generar con IA</button>
    {!available&&<span className="text-xs text-[#687870]">Taller IA disponible en Profesional</span>}
    {open&&<dialog ref={dialog} open={typeof HTMLDialogElement==='undefined'||!HTMLDialogElement.prototype.showModal} aria-labelledby={`${id}-title`} onCancel={e=>{e.preventDefault();if(!busy)setOpen(false);}}
      className="m-auto max-h-[92dvh] w-[min(800px,calc(100vw-24px))] overflow-auto rounded-2xl border border-[#d4e2d8] bg-white p-4 text-[#173d36] shadow-xl backdrop:bg-[#173d36]/40 sm:p-6">
      <header className="flex items-start justify-between gap-3"><div><p className="nuth-eyebrow">Asistente de dieta · {step+1} de 4</p><h2 tabIndex={-1} id={`${id}-title`} className="mt-1 text-xl font-semibold">{proposal?'Revisar diferencias':screens[step]}</h2></div><button type="button" aria-label="Cerrar asistente" disabled={!!busy} onClick={()=>setOpen(false)}><X size={22}/></button></header>
      <p className="my-3 text-sm text-[#687870]">Prepara equivalentes, tiempos y menú. Después podrás editar el borrador en Menú y confirmarlo en Revisión.</p>
      <ol aria-label="Pasos del asistente" className="mb-5 grid grid-cols-4 gap-2">{screens.map((s,i)=><li key={s} aria-current={step===i?'step':undefined} className={`rounded-lg px-2 py-2 text-xs ${step===i?'bg-[#173d36] text-white':'bg-[#eef4f0]'}`}>{i+1}. {s}</li>)}</ol>
      {error&&<p role="alert" className="my-3 rounded-xl bg-[#fff4de] p-3 text-sm">{error}</p>}
      {busy&&<p role="status" className="my-4 flex gap-2 text-sm"><LoaderCircle className="animate-spin" size={18}/>{busy}</p>}
      {context&&!proposal&&step===0&&context.reasons.some(r=>!planningReasons.has(r.code))&&<ul role="alert" className="mb-3 rounded-xl bg-[#fff7e7] p-3 text-sm">{[...new Set(context.reasons.filter(r=>!planningReasons.has(r.code)).map(r=>copilotMessage(r.code)))].map(s=><li key={s}>{s}</li>)}</ul>}
      <fieldset disabled={!!busy||!!pending} className="min-w-0 space-y-4 disabled:opacity-70">
      {!proposal&&step===0&&c&&<>
        {targets&&<section className="rounded-xl bg-[#edf5f0] p-3 text-sm"><h3 className="font-semibold">Objetivos para alimentos</h3><p>{nutritionLabels.map(([k,l,u])=>`${l}: ${numberText(targets[k])} ${u}`).join(' · ')}</p><p className="mt-1 text-xs">Se usan Energía y Macros del taller, descontando los suplementos prescritos.</p></section>}
        <label className="block text-sm font-semibold">Objetivo de esta dieta<textarea aria-label="Objetivo de esta dieta" className="nuth-input mt-1 min-h-20" maxLength={1200} value={guidance.objective} onChange={e=>edit({objective:e.target.value})}/><span className="text-xs font-normal text-[#687870]">Puedes ajustar el objetivo de la propuesta sin modificar la entrevista.</span></label>
        <div className="text-sm"><h3 className="font-semibold">PES aprobado</h3><p>{factText(c.clinical.pes.fact)}</p></div>
        {c.clinical.anthropometry&&<details className="text-sm"><summary>Mediciones de la consulta</summary><ul className="mt-2 space-y-1">{Object.entries(c.clinical.anthropometry).map(([k,v])=><li key={k}>{({weightKg:'Peso (kg)',heightCm:'Estatura (cm)',bmi:'IMC (kg/m²)',waistCm:'Cintura (cm)',bodyFatPct:'Grasa corporal (%)',leanMassKg:'Masa libre de grasa (kg)'} as Record<string,string>)[k]}: {numberText(Number(v))}</li>)}</ul></details>}
        <details className="rounded-xl border border-[#dfe6e1] p-3 text-sm" open><summary className="font-semibold">Consulta e historial utilizado</summary><p className="mt-1 text-xs text-[#687870]">Se incluyen datos de la consulta seleccionada, la inicial y hasta tres consultas previas cerradas.</p>{c.clinical.history?.length?c.clinical.history.map((h,i)=><section key={i} className="mt-3"><h4 className="font-semibold">{h.current?'Consulta seleccionada':'Antecedente'} · {h.date}</h4><ul className="mt-1 space-y-1 text-xs">{h.facts.map((f,j)=><li key={j}><strong>{dietClinicalLabel(f.key)}:</strong> {dietClinicalValue(f.value)}</li>)}</ul></section>):<p className="mt-2">No hay antecedentes adicionales disponibles.</p>}</details>
        <section className="rounded-xl bg-[#fff7e7] p-3 text-sm"><h3 className="font-semibold">Alergias y restricciones</h3><p>Reacciones registradas: {factText(c.restrictions.reaction_status.fact)}</p><p>{factText(c.restrictions.reactions.fact,r=>r.map(x=>`${x.food}: ${x.classification}`).join('; '))}</p><p>Patrón: {factText(c.preferences.eating_pattern.fact,v=>v.join(', '))}</p>
          {c.historyRequiresReview?<p className="mt-2">Hay restricciones en el historial que requieren revisión. Continúa con el taller manual mientras se aclaran.</p>:<label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={guidance.reactionReview==='none_confirmed'} onChange={e=>edit({reactionReview:e.target.checked?'none_confirmed':'recorded'})}/>Confirmé con el paciente que no hay alergias ni intolerancias alimentarias pendientes de registrar.</label>}</section>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={guidance.contextReviewed} onChange={e=>edit({contextReviewed:e.target.checked})}/>Revisé el contexto, el objetivo y la prescripción de esta propuesta.</label>
      </>}
      {!proposal&&step===1&&<><p className="text-sm">Elige tiempos y alternativas intercambiables. El paciente consume una opción por tiempo.</p>{guidance.meals.map((m,i)=><section key={i} className="grid grid-cols-2 gap-3 rounded-xl border border-[#dfe6e1] p-3 sm:grid-cols-4">
        <label className="col-span-2 text-xs">Nombre<input aria-label={`Nombre del tiempo ${i+1}`} className="nuth-input mt-1" maxLength={60} value={m.name} onChange={e=>edit({meals:guidance.meals.map((v,j)=>j===i?{...v,name:e.target.value}:v)})}/></label>
        <label className="text-xs">Tipo<select className="nuth-input mt-1" value={m.type} onChange={e=>edit({meals:guidance.meals.map((v,j)=>j===i?{...v,type:e.target.value as typeof m.type}:v)})}>{[['BREAKFAST','Desayuno'],['MAIN_MEAL','Comida'],['DINNER','Cena'],['SNACK','Colación'],['CUSTOM','Otro']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label className="text-xs">Hora opcional<input type="time" className="nuth-input mt-1" value={m.time??''} onChange={e=>edit({meals:guidance.meals.map((v,j)=>j===i?{...v,time:e.target.value||null}:v)})}/></label>
        <label className="col-span-2 text-xs">Alternativas de menú / recetas<select aria-label={`Alternativas para ${m.name}`} className="nuth-input mt-1" value={m.options} onChange={e=>edit({meals:guidance.meals.map((v,j)=>j===i?{...v,options:Number(e.target.value)}:v)})}>{[1,2,3].map(n=><option key={n}>{n}</option>)}</select></label>
        <button type="button" aria-label={`Quitar ${m.name}`} disabled={guidance.meals.length<=1} className="self-end justify-self-end p-2" onClick={()=>edit({meals:guidance.meals.filter((_,j)=>j!==i)})}><Trash2 size={17}/></button>
      </section>)}<button type="button" className="nuth-button-secondary" disabled={guidance.meals.length>=6} onClick={()=>edit({meals:[...guidance.meals,{name:`Colación ${guidance.meals.length-2}`,type:'SNACK',time:null,options:1}]})}><Plus size={16}/>Agregar tiempo</button><p className="text-xs text-[#687870]">{count} de {GUIDED_DIET_LIMITS.maxOptions} alternativas. Se usarán alimentos y recetas disponibles en tu catálogo.</p></>}
      {!proposal&&step===2&&<>
        <p className="text-sm">Preferencias registradas: {c?factText(c.preferences.foods.fact,r=>r.map(x=>`${x.food}: ${x.category}`).join('; ')):'No especificadas'}</p>
        <label className="block text-sm">Preferencias de preparación<textarea className="nuth-input mt-1" placeholder="Por ejemplo: desayunos para llevar, sabores mexicanos…" maxLength={300} value={preferences} onChange={e=>setPreferences(e.target.value)}/></label>
        <label className="block text-sm">Presupuesto disponible<input className="nuth-input mt-1" placeholder="Por ejemplo: económico, alimentos de temporada" maxLength={150} value={budget} onChange={e=>setBudget(e.target.value)}/></label>
        <label className="block text-sm">Tiempo para cocinar<input className="nuth-input mt-1" placeholder="Por ejemplo: 20 minutos por comida" maxLength={150} value={cooking} onChange={e=>setCooking(e.target.value)}/></label>
        <label className="block text-sm">Indicaciones adicionales<textarea className="nuth-input mt-1 min-h-24" maxLength={400} value={extra} onChange={e=>setExtra(e.target.value)}/></label>
        <p className="text-xs text-[#687870]">Las exclusiones obligatorias se revisan en el contexto y en las preferencias del catálogo. No agregues aquí alergias nuevas.</p>
      </>}
      {!proposal&&step===3&&<><section className="rounded-xl bg-[#edf5f0] p-4 text-sm"><h3 className="font-semibold">Tu solicitud</h3><p className="mt-2">{guidance.objective}</p><ul className="my-3 space-y-1">{guidance.meals.map((m,i)=><li key={i}>{m.name}{m.time?` · ${m.time}`:''} · {m.options} {m.options===1?'alternativa':'alternativas'}</li>)}</ul><p className="whitespace-pre-wrap">{instructions||'Usar las preferencias y la rutina documentadas.'}</p></section>
        {!!checked?.reasons.length&&<ul role="alert" className="rounded-xl bg-[#fff7e7] p-3 text-sm">{[...new Set(checked.reasons.map(r=>copilotMessage(r.code)))].map(s=><li key={s}>{s}</li>)}</ul>}
        <p className="text-sm">Al generar se prepararán los tres pasos. Si hay diferencias nutricionales, podrás revisarlas antes de guardar. El plan seguirá como borrador.</p>
        {hasContent&&<label className="flex items-start gap-2 rounded-xl bg-[#fff7e7] p-3 text-sm"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>Reemplazar los equivalentes, tiempos y menú de este borrador con la propuesta.</label>}
      </>}
      </fieldset>
      {proposal&&<section className="space-y-3 text-sm"><p>La propuesta está lista. Revisa el aporte de la primera opción de cada tiempo antes de continuar.</p>{proposal.validation.totals&&<div className="grid grid-cols-2 gap-2">{nutritionLabels.map(([k,l,u])=><div key={k} className="rounded-xl bg-[#edf5f0] p-3"><strong>{l}</strong><p>{numberText(proposal.validation.totals![k])} {u}</p>{proposal.validation.differences&&<p className="text-xs">Diferencia al objetivo: {numberText(proposal.validation.differences[k])} {u}</p>}</div>)}</div>}
        {!!proposal.validation.issues.length&&<ul className="rounded-xl bg-[#fff7e7] p-3">{[...new Set(proposal.validation.issues.map(r=>copilotMessage(r.code)))].map(s=><li key={s}>{s}</li>)}</ul>}
        <p>Las alternativas quedarán editables y pendientes de confirmación. Revisa cada una en Menú.</p>
        {(hasContent||proposal.hasManualMenu)&&<label className="flex gap-2"><input type="checkbox" checked={replace} disabled={!!busy} onChange={e=>setReplace(e.target.checked)}/>Reemplazar los tres pasos del borrador actual.</label>}
      </section>}
      <footer className="sticky -bottom-4 mt-5 flex flex-wrap gap-2 border-t border-[#dfe6e1] bg-white py-3 sm:-bottom-6">
        {!proposal&&!pending&&<>{step>0&&<button type="button" disabled={!!busy} className="nuth-button-secondary" onClick={()=>{setStep(s=>s-1);setChecked(null);}}>Atrás</button>}{step<3?<button type="button" className="nuth-button" disabled={!!busy||!c||!!context?.reasons.some(r=>!planningReasons.has(r.code))} onClick={()=>void next()}>Continuar</button>:<button type="button" className="nuth-button" disabled={!!busy||!checked?.eligible||(hasContent&&!replace)} onClick={()=>void generate()}>Confirmar y generar</button>}</>}
        {proposal&&<><button type="button" className="nuth-button" disabled={!!busy||((hasContent||proposal.hasManualMenu)&&!replace)} onClick={()=>void accept()}>Guardar borrador y revisar en Menú</button><button type="button" className="nuth-button-secondary" disabled={!!busy} onClick={()=>void discard()}>Descartar propuesta</button></>}
        {pending&&!proposal&&<button type="button" disabled={!!busy} className="nuth-button-secondary" onClick={()=>void recover()}>Consultar solicitud pendiente</button>}
        <button type="button" className="nuth-button-secondary" disabled={!!busy} onClick={()=>setOpen(false)}>Cerrar</button>
      </footer>
    </dialog>}
  </>;
}
