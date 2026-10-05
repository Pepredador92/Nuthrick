import {useEffect,useId,useRef,useState} from 'react';
import {LoaderCircle,Plus,Sparkles,Trash2,X} from 'lucide-react';
import {useAccess} from '@/src/features/admin/AccessProvider';
import {canUseFeature} from '@/src/features/admin/api';
import {AIRequestError} from '@/src/services/ai';
import {textDietTransport,type TextDietTransport,type TextDietPreflight,type TextDietProposal} from '@/src/services/textDietAI';
import {isTextDietGuidance,type TextDietGuidance} from '../../../../supabase/functions/_shared/text-diet';
import type {NutritionPlan} from '@/src/types/domain';
import {copilotMessage,factText,numberText} from './dietCopilotPresentation';
import {dietClinicalLabel,dietClinicalValue} from './dietClinicalLabels';
import {dietFactDate,dietRestrictionsSuggestion} from './textDietFormContext';

import './TextDietAI.css';

const pages=['Contexto','Dietas y horarios','Preferencias','Confirmar'];
const critical=new Set(['draft_required','consultation_required','context_mismatch','energy_required','macros_required','prescription_inconsistent','feature_disabled','insufficient_credits']);
export function TextDietAI({plan,before,onApplied,transport=textDietTransport}:{plan:NutritionPlan;before:()=>Promise<NutritionPlan>;onApplied:(plan:NutritionPlan)=>void;transport?:TextDietTransport}) {
  const {data:access}=useAccess(),available=!access||canUseFeature(access.access,'ai.diet_draft');
  const id=useId(),dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLButtonElement>(null),lock=useRef(false);
  const [open,setOpen]=useState(false),[step,setStep]=useState(0),[busy,setBusy]=useState(''),[error,setError]=useState(''),[attempted,setAttempted]=useState(false);
  const [context,setContext]=useState<TextDietPreflight|null>(null),[checked,setChecked]=useState<TextDietPreflight|null>(null);
  const [guidance,setGuidance]=useState<TextDietGuidance>({version:1,dietCount:3,objective:'',contextReviewed:false,restrictionsReviewed:false,restrictions:'',
    meals:plan.text_diet?.meals??(plan.meal_distribution?.meal_times.length?plan.meal_distribution.meal_times.map(m=>({name:m.display_name,time:m.time})):[{name:'Desayuno',time:null},{name:'Comida',time:null},{name:'Cena',time:null}])});
  const [preferences,setPreferences]=useState(''),[budget,setBudget]=useState('Económico; abarrotes y mercado local'),[cooking,setCooking]=useState(''),[extra,setExtra]=useState(''),[replace,setReplace]=useState(false);
  const [proposal,setProposal]=useState<TextDietProposal|null>(null);
  const storageKey=`text-diet-pending:${plan.id}`,[pending,setPending]=useState(()=>sessionStorage.getItem(storageKey));
  const initialized=useRef(false),instructions=[preferences&&`Preferencias: ${preferences}`,budget&&`Presupuesto y disponibilidad: ${budget}`,cooking&&`Tiempo para cocinar: ${cooking}`,extra].filter(Boolean).join('\n');
  const existing=!!(plan.text_diet||plan.diet_menu);
  useEffect(()=>{const node=dialog.current;if(open){node?.showModal?.();node?.querySelector<HTMLElement>('h2')?.focus();}return()=>{if(node?.open)node.close?.();};},[open]);
  useEffect(()=>{dialog.current?.scrollTo?.({top:0});},[step]);
  function remember(value:string|null){if(value)sessionStorage.setItem(storageKey,value);else sessionStorage.removeItem(storageKey);setPending(value);}
  function fail(e:unknown){setError(e instanceof AIRequestError?e.code==='text_restrictions_required'?'Escribe y confirma las alergias o restricciones revisadas con el paciente.':e.code==='invalid_output'?'La IA no entregó todas las dietas y tiempos requeridos o repitió una propuesta. No se guardó un plan incompleto.':copilotMessage(e.code):'No se pudo completar la operación. Conserva la solicitud para consultar su estado.');}
  async function show(){if(lock.current||!available)return;lock.current=true;setOpen(true);setBusy('Leyendo consulta e historial…');setError('');
    try{const r=await transport.preflight(await before(),guidance,instructions);setContext(r);
      if(!initialized.current&&r.context){const goal=r.context.clinical.objective.fact;setGuidance(g=>({...g,objective:g.objective||(goal.state==='known'?goal.value:r.context.clinical.objectiveSuggestion??''),restrictions:g.restrictions||dietRestrictionsSuggestion(r.context)}));initialized.current=true;}
    }catch(e){fail(e);}finally{lock.current=false;setBusy('');}}
  async function next(){if(lock.current)return;setError('');
    if(step===0){
      setAttempted(true);
      const missing=[!guidance.objective.trim()&&'Escribe el objetivo de las dietas.',!guidance.restrictions.trim()&&'Completa el resumen de alergias y restricciones revisadas.',!guidance.restrictionsReviewed&&'Confirma la revisión de alergias y restricciones.',!guidance.contextReviewed&&'Confirma la revisión del contexto y la prescripción.'].filter(Boolean);
      if(missing.length){setError(missing.join(' '));const field=!guidance.objective.trim()?'objective':!guidance.restrictions.trim()?'restrictions':null;if(field)document.getElementById(`${id}-${field}`)?.focus();return;}
    }
    if(!isTextDietGuidance(guidance)){setError('Revisa los nombres y horarios; admite de 1 a 7 dietas y de 1 a 6 tiempos distintos.');return;}
    if(step<2){setStep(s=>s+1);return;}lock.current=true;setBusy('Comprobando la solicitud…');
    try{setChecked(await transport.preflight(await before(),guidance,instructions));setStep(3);}catch(e){fail(e);}finally{lock.current=false;setBusy('');}}
  async function apply(p:TextDietProposal){const updated=await transport.apply(p.generationId,replace);remember(null);setProposal(null);setOpen(false);onApplied(updated);}
  async function generate(){if(lock.current||pending||!checked?.eligible)return;lock.current=true;setError('');setBusy(`Preparando ${guidance.dietCount} dietas completas…`);let produced=false,key:string|null=null;
    try{const saved=await before(),fresh=await transport.preflight(saved,guidance,instructions);if(fresh.contextToken!==checked.contextToken){setChecked(fresh);throw new AIRequestError('context_changed');}
      key=crypto.randomUUID();remember(key);const p=await transport.generate(saved,guidance,instructions,key);produced=true;setProposal(p);setBusy('Conservando el borrador para revisión…');await apply(p);
    }catch(e){if(!produced&&(!key||e instanceof AIRequestError&&!['provider_outcome_unknown','service_unavailable','result_unavailable'].includes(e.code)))remember(null);fail(e);}finally{lock.current=false;setBusy('');}}
  async function recover(){if(lock.current||!pending)return;lock.current=true;setBusy('Recuperando la solicitud existente…');setError('');try{const r=await transport.status(pending);if(r?.status==='succeeded'){const p=await transport.recover(r.generationId);setProposal(p);setStep(3);}else if(r&&['failed','invalid_output'].includes(r.status)){remember(null);throw new AIRequestError(r.errorCode??'invalid_output');}else throw new AIRequestError('provider_outcome_unknown');}catch(e){fail(e);}finally{lock.current=false;setBusy('');}}
  async function saveProposal(){if(lock.current||!proposal)return;lock.current=true;setBusy('Guardando borrador…');try{await apply(proposal);}catch(e){fail(e);}finally{lock.current=false;setBusy('');}}
  async function discard(){if(lock.current||!proposal)return;lock.current=true;setBusy('Descartando propuesta…');try{await transport.discard(proposal.generationId);setProposal(null);remember(null);setStep(0);}catch(e){fail(e);}finally{lock.current=false;setBusy('');}}
  function edit(patch:Partial<TextDietGuidance>){setGuidance(g=>({...g,...patch}));setChecked(null);setError('');}
  const close=()=>{setOpen(false);opener.current?.focus();},c=context?.context;
  return <>
    <button ref={opener} type="button" data-diet-ai-entry className="nuth-button !px-4 !py-2" disabled={!available} onClick={()=>void show()}><Sparkles size={16}/>Generar con IA</button>
    {open&&<dialog ref={dialog} open={typeof HTMLDialogElement==='undefined'||!HTMLDialogElement.prototype.showModal} aria-labelledby={`${id}-title`} onCancel={e=>{e.preventDefault();if(!busy)close();}} className="text-diet-assistant m-auto max-h-[92dvh] w-[min(800px,calc(100vw-24px))] overflow-auto rounded-2xl border border-[#d4e2d8] bg-white p-4 text-[#173d36] shadow-xl backdrop:bg-[#173d36]/40 sm:p-6">
      <header className="flex items-start justify-between gap-3"><div><p className="nuth-eyebrow">Dietas con IA · {step+1} de 4</p><h2 tabIndex={-1} id={`${id}-title`} className="mt-1 text-xl font-semibold">{pages[step]}</h2></div><button aria-label="Cerrar asistente" disabled={!!busy} onClick={close}><X size={22}/></button></header>
      <p className="my-3 text-sm text-[#687870]">Dietas completas con alimentos accesibles en México. Después revisarás y editarás cada propuesta en texto libre.</p>
      <ol aria-label="Pasos del asistente" className="mb-4 grid grid-cols-4 gap-2">{pages.map((p,i)=><li key={p} aria-current={step===i?'step':undefined} className={`rounded-lg px-2 py-2 text-xs ${i===step?'bg-[#173d36] text-white':'bg-[#eef4f0]'}`}>{i+1}. {p}</li>)}</ol>
      {error&&<p role="alert" className="my-3 rounded-xl bg-amber-50 p-3 text-sm">{error}</p>}
      {busy&&<p role="status" className="my-3 flex gap-2 text-sm"><LoaderCircle size={18} className="animate-spin"/>{busy}</p>}
      <fieldset disabled={!!busy||!!pending} className="text-diet-assistant-cards min-w-0 space-y-4 disabled:opacity-70">
        {step===0&&c&&<>
          <section className="rounded-xl bg-[#edf5f0] p-3 text-sm"><h3 className="font-semibold">Metas prescritas para alimentos</h3><p>Energía: {factText(c.prescription.energy_kcal.fact,v=>`${numberText(v)} kcal`)}</p><p>{factText(c.prescription.macros.fact,v=>`Proteína: ${numberText(v.PROTEIN.grams)} g · Carbohidratos: ${numberText(v.CARBOHYDRATE.grams)} g · Grasa: ${numberText(v.FAT.grams)} g`)}</p><p className="mt-1 text-xs">Ya se descontaron los suplementos. Son objetivos para orientar la propuesta; sus aportes requieren revisión profesional.</p></section>
          <label className="block text-sm font-semibold">Objetivo de las dietas <span className="font-normal text-[#687870]">· Obligatorio</span><textarea id={`${id}-objective`} aria-label="Objetivo de las dietas" aria-required="true" aria-invalid={attempted&&!guidance.objective.trim()} aria-describedby={`${id}-objective-help`} className="nuth-input mt-1 min-h-20" maxLength={1200} value={guidance.objective} onChange={e=>edit({objective:e.target.value,contextReviewed:false})}/></label>
          <p id={`${id}-objective-help`} className="!mt-1 text-xs text-[#687870]">{c.clinical.objectiveSuggestionOrigin?`${dietFactDate(c.clinical.objectiveSuggestionOrigin)}. `:''}Revisa o adapta el objetivo registrado. Si no hay uno, escribe el objetivo que acordaste con el paciente.</p>
          <details className="rounded-xl border border-[#dfe6e1] p-3 text-sm"><summary className="font-semibold">Consulta e historial utilizado</summary>{c.clinical.history?.map((h,i)=><section key={i} className="mt-3"><h4>{h.current?'Consulta seleccionada':'Antecedente'} · {h.date}</h4><ul className="mt-1 space-y-1 text-xs">{h.facts.map((f,j)=><li key={j}><strong>{dietClinicalLabel(f.key)}:</strong> {dietClinicalValue(f.value)}</li>)}</ul></section>)}</details>
          <section aria-label="Datos alimentarios del expediente" className="rounded-xl bg-[#edf5f0] p-3 text-sm">
            <h3 className="mb-2 font-semibold">Datos de la consulta y antecedentes</h3>
            <p>Reacciones alimentarias: {c.restrictions.reaction_status.fact.state==='unavailable'?'Sin respuesta registrada':factText(c.restrictions.reaction_status.fact)}{dietFactDate(c.restrictions.reaction_status.origin)&&<span className="block text-xs text-[#687870]">{dietFactDate(c.restrictions.reaction_status.origin)}</span>}</p>
            {c.restrictions.reactions.fact.state==='known'&&<p className="mt-2">Detalle: {c.restrictions.reactions.fact.value.map(r=>`${r.food}: ${r.classification}${r.management?` · ${r.management}`:''}`).join('; ')}<span className="block text-xs text-[#687870]">{dietFactDate(c.restrictions.reactions.origin)}</span></p>}
            <p className="mt-2">Patrón alimentario: {c.preferences.eating_pattern.fact.state==='unavailable'?'Sin registro':factText(c.preferences.eating_pattern.fact,v=>v.join(', '))}<span className="block text-xs text-[#687870]">{dietFactDate(c.preferences.eating_pattern.origin)}</span></p>
            <p className="mt-2">Preferencias registradas: {c.preferences.foods.fact.state==='unavailable'?'Sin preferencias específicas registradas':factText(c.preferences.foods.fact,v=>v.map(f=>`${f.food}: ${f.category}`).join('; '))}<span className="block text-xs text-[#687870]">{dietFactDate(c.preferences.foods.origin)}</span></p>
            <p className="mt-2 text-xs text-[#687870]">Las preferencias sin registrar no impiden continuar. Confirma si los antecedentes siguen vigentes y completa los dos campos obligatorios.</p>
          </section>
          <label className="block text-sm">Alergias y restricciones revisadas <span className="text-[#687870]">· Obligatorio</span><textarea id={`${id}-restrictions`} aria-label="Alergias y restricciones revisadas" aria-required="true" aria-invalid={attempted&&!guidance.restrictions.trim()} className="nuth-input mt-1" maxLength={1500} placeholder="Resume lo confirmado con el paciente. Si no hay restricciones, indícalo expresamente." value={guidance.restrictions} onChange={e=>edit({restrictions:e.target.value,restrictionsReviewed:false})}/></label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={guidance.restrictionsReviewed} onChange={e=>edit({restrictionsReviewed:e.target.checked})}/>Revisé alergias, intolerancias, restricciones y preferencias con el paciente.</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={guidance.contextReviewed} onChange={e=>edit({contextReviewed:e.target.checked})}/>Revisé el contexto, el objetivo y la prescripción.</label>
          {!!context?.reasons.some(r=>critical.has(r.code))&&<p role="alert" className="text-sm text-amber-900">{context.reasons.filter(r=>critical.has(r.code)).map(r=>copilotMessage(r.code)).join(' ')}</p>}
        </>}
        {step===1&&<>
          <label className="block text-sm font-semibold">Dietas completas diferentes<select className="nuth-input mt-1" value={guidance.dietCount} onChange={e=>edit({dietCount:Number(e.target.value)})}>{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n} {n===1?'dieta completa':'dietas completas'}</option>)}</select></label>
          <p className="text-sm">Cada dieta incluirá todos estos tiempos. Por ejemplo, tres dietas son tres jornadas completas diferentes.</p>
          {guidance.meals.map((m,i)=><div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-[#dfe6e1] p-3 sm:grid-cols-[1fr_140px_auto]"><label className="text-xs">Nombre del tiempo {i+1}<input className="nuth-input mt-1" maxLength={60} value={m.name} onChange={e=>edit({meals:guidance.meals.map((v,j)=>i===j?{...v,name:e.target.value}:v)})}/></label><label className="col-start-1 text-xs sm:col-start-auto">Hora opcional<input type="time" className="nuth-input mt-1" value={m.time??''} onChange={e=>edit({meals:guidance.meals.map((v,j)=>i===j?{...v,time:e.target.value||null}:v)})}/></label><button type="button" className="p-2" aria-label={`Quitar ${m.name}`} disabled={guidance.meals.length<=1} onClick={()=>edit({meals:guidance.meals.filter((_,j)=>i!==j)})}><Trash2 size={17}/></button></div>)}
          <button type="button" className="nuth-button-secondary" disabled={guidance.meals.length>=6} onClick={()=>edit({meals:[...guidance.meals,{name:`Colación ${guidance.meals.length-2}`,time:null}]})}><Plus size={16}/>Agregar tiempo</button>
        </>}
        {step===2&&<>
          <p className="rounded-xl bg-[#edf5f0] p-3 text-sm">Se priorizarán alimentos básicos mexicanos, de temporada y fáciles de conseguir; platillos sencillos y combinaciones coherentes.</p>
          <label className="block text-sm">Preferencias de preparación<textarea className="nuth-input mt-1" maxLength={300} value={preferences} onChange={e=>setPreferences(e.target.value)}/></label>
          <label className="block text-sm">Presupuesto y dónde compra<input className="nuth-input mt-1" maxLength={250} value={budget} onChange={e=>setBudget(e.target.value)}/></label>
          <label className="block text-sm">Tiempo para cocinar<input className="nuth-input mt-1" maxLength={150} value={cooking} onChange={e=>setCooking(e.target.value)}/></label>
          <label className="block text-sm">Indicaciones adicionales<textarea className="nuth-input mt-1" maxLength={300} value={extra} onChange={e=>setExtra(e.target.value)}/></label>
        </>}
        {step===3&&!proposal&&<>
          <div className="rounded-xl bg-[#edf5f0] p-4 text-sm"><strong>{guidance.dietCount} dietas completas · {guidance.meals.length} tiempos por dieta</strong><p className="mt-2">{guidance.objective}</p><p className="mt-2">{guidance.meals.map(m=>`${m.name}${m.time?' '+m.time:''}`).join(' · ')}</p><p className="mt-2 whitespace-pre-wrap">{instructions}</p></div>
          <p className="text-sm">La propuesta se guardará como borrador de texto y abrirá la revisión por dieta. Publicar requerirá tu aprobación posterior.</p>
          {!!checked?.reasons.length&&<p role="alert">{checked.reasons.map(r=>copilotMessage(r.code)).join(' ')}</p>}
          {existing&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>Usar la nueva propuesta de texto para este borrador. Las versiones publicadas se conservan.</label>}
        </>}
      </fieldset>
      {proposal&&<p className="my-3 text-sm">Se generaron {proposal.textDraft.diets.length} dietas. Conserva esta propuesta y vuelve a intentar guardar para revisarlas.</p>}
      <footer className="sticky -bottom-4 mt-5 flex flex-wrap gap-2 border-t border-[#dfe6e1] bg-white py-3 sm:-bottom-6">
        {!pending&&!proposal&&<>{step>0&&<button className="nuth-button-secondary" disabled={!!busy} onClick={()=>setStep(s=>s-1)}>Atrás</button>}{step<3?<button className="nuth-button" disabled={!!busy||!c||!!context?.reasons.some(r=>critical.has(r.code))} onClick={()=>void next()}>Continuar</button>:<button className="nuth-button" disabled={!!busy||!checked?.eligible||(existing&&!replace)} onClick={()=>void generate()}>Generar {guidance.dietCount} dietas</button>}</>}
        {pending&&!proposal&&<button className="nuth-button" disabled={!!busy} onClick={()=>void recover()}>Consultar solicitud pendiente</button>}
        {proposal&&<><button className="nuth-button" disabled={!!busy||(existing&&!replace)} onClick={()=>void saveProposal()}>Guardar y revisar dietas</button><button className="nuth-button-secondary" disabled={!!busy} onClick={()=>void discard()}>Descartar propuesta</button>{existing&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/>Usar esta propuesta en el borrador</label>}</>}
        <button className="nuth-button-secondary" disabled={!!busy} onClick={close}>Cerrar</button>
      </footer>
    </dialog>}
  </>;
}
