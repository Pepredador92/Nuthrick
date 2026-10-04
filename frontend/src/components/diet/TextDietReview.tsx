import {useId,useRef,useState,useEffect} from 'react';
import {CheckCircle2,LoaderCircle,Pencil,X} from 'lucide-react';
import {isTextDiet,textDietPrescriptionMatches,type TextDiet} from '../../../../supabase/functions/_shared/text-diet';
import type {NutritionPlan,NutritionPlanVersion} from '@/src/types/domain';
import {patientPlanViewFromDraft,patientPlanViewFromVersion} from '@/src/features/diet-review/model';
import {PatientPlanPreview} from './PatientPlanPreview';

export function TextDietEditor({plan,onSave,onClose}:{plan:NutritionPlan;onSave:(draft:TextDiet)=>Promise<NutritionPlan>;onClose:()=>void}) {
  const id=useId(),dialog=useRef<HTMLDialogElement>(null),lock=useRef(false);
  const [draft,setDraft]=useState(()=>structuredClone(plan.text_diet!)),[page,setPage]=useState(0),[reviewed,setReviewed]=useState<boolean[]>(()=>plan.text_diet!.diets.map(()=>false));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const current=draft.diets[page],complete=reviewed.every(Boolean)&&isTextDiet(draft);
  useEffect(()=>{const node=dialog.current;node?.showModal?.();node?.querySelector<HTMLElement>('h2')?.focus();return()=>{if(node?.open)node.close?.();};},[]);
  async function persist(nextPage?:number,close=false,approve=false){if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{const value={...draft,reviewed_at:approve?new Date().toISOString():null,
      prescription:approve?{target_calories:plan.target_calories,macro_distribution:plan.macro_distribution}:draft.prescription};
      if(!isTextDiet(value))throw Error('Cada dieta necesita un título y contenido antes de guardar.');
      await onSave(value);setDraft(value);setNotice(approve?'Dietas aprobadas para publicación.':'Borrador guardado.');
      if(nextPage!==undefined){setPage(nextPage);dialog.current?.scrollTo?.({top:0});}if(close)onClose();
    }catch(e){setError(e instanceof Error?e.message:'No pudimos guardar. Tus cambios siguen en este diálogo.');}finally{lock.current=false;setBusy(false);}}
  function edit(field:'title'|'text',value:string){setDraft(d=>({...d,reviewed_at:null,diets:d.diets.map((row,i)=>i===page?{...row,[field]:value}:row)}));setReviewed(r=>r.map((v,i)=>i===page?false:v));setNotice('');}
  return <dialog ref={dialog} open={typeof HTMLDialogElement==='undefined'||!HTMLDialogElement.prototype.showModal} aria-labelledby={`${id}-title`} onCancel={e=>{e.preventDefault();void persist(undefined,true);}} className="m-auto max-h-[94dvh] w-[min(980px,calc(100vw-20px))] overflow-auto rounded-2xl border border-[#d4e2d8] bg-white p-4 text-[#173d36] shadow-xl backdrop:bg-[#173d36]/40 sm:p-6">
    <header className="flex items-start justify-between gap-3"><div><p className="nuth-eyebrow">Revisión del borrador · Dieta {page+1} de {draft.diets.length}</p><h2 tabIndex={-1} id={`${id}-title`} className="mt-1 text-xl font-semibold">Revisa y edita tu propuesta</h2></div><button aria-label="Guardar y cerrar revisión" disabled={busy} onClick={()=>void persist(undefined,true)}><X size={22}/></button></header>
    <p className="my-3 text-sm text-[#687870]">Modifica o elimina libremente ingredientes, cantidades y preparación. Los cambios se guardan al cambiar de dieta o pulsar Guardar borrador.</p>
    <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Revisa coherencia, porciones, alergias y aporte nutricional. Las metas orientaron a la IA; el texto no tiene un cálculo nutricional verificado.</p>
    {!textDietPrescriptionMatches(draft,plan)&&<p role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm">La prescripción cambió. Revisa todas las dietas con las metas actuales antes de aprobar: {plan.target_calories} kcal diarias.</p>}
    <nav aria-label="Dietas del borrador" className="mb-4 flex flex-wrap gap-2">{draft.diets.map((d,i)=><button key={d.id} disabled={busy} aria-current={page===i?'step':undefined} className={`rounded-lg border px-3 py-2 text-sm ${i===page?'bg-[#173d36] text-white':'border-[#dbe6df]'}`} onClick={()=>void persist(i)}>{reviewed[i]?'✓ ':''}Dieta {i+1}</button>)}</nav>
    {error&&<p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="mb-3 text-sm">{notice}</p>}
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <label className="block text-sm font-semibold">Título de la dieta<input className="nuth-input mt-1" value={current.title} maxLength={120} onChange={e=>edit('title',e.target.value)}/></label>
      <label className="block text-sm font-semibold">Contenido editable<textarea aria-label="Contenido editable" className="nuth-input mt-1 min-h-[48dvh] resize-y !font-normal !leading-7" value={current.text} maxLength={12000} onChange={e=>edit('text',e.target.value)}/></label>
      <label className="flex items-start gap-2 rounded-xl bg-[#edf5f0] p-3 text-sm"><input type="checkbox" checked={reviewed[page]} onChange={e=>setReviewed(r=>r.map((v,i)=>i===page?e.target.checked:v))}/>Revisé esta dieta, sus cantidades, restricciones y adecuación al paciente.</label>
    </fieldset>
    <footer className="sticky -bottom-4 mt-4 flex flex-wrap items-center gap-2 border-t border-[#dfe6e1] bg-white py-3 sm:-bottom-6">
      {page>0&&<button className="nuth-button-secondary" disabled={busy} onClick={()=>void persist(page-1)}>Anterior</button>}
      {page<draft.diets.length-1&&<button className="nuth-button" disabled={busy} onClick={()=>void persist(page+1)}>Siguiente dieta</button>}
      <button className="nuth-button-secondary" disabled={busy} onClick={()=>void persist()}>Guardar borrador</button>
      <button className="nuth-button" disabled={busy||!complete} onClick={()=>void persist(undefined,true,true)}>{busy?<LoaderCircle className="animate-spin" size={16}/>:<CheckCircle2 size={16}/>}Aprobar {draft.diets.length} dietas</button>
      <span className="text-xs text-[#687870]">{reviewed.filter(Boolean).length} de {draft.diets.length} revisadas. La publicación es el paso siguiente.</span>
    </footer>
  </dialog>;
}

export function TextDietReviewStep({plan,patientName,versions,publishing,onSave,onPublish,generateAction}:{plan:NutritionPlan;patientName:string;versions:NutritionPlanVersion[];publishing:boolean;onSave:(draft:TextDiet)=>Promise<NutritionPlan>;onPublish:()=>void;generateAction?:React.ReactNode}) {
  const [editing,setEditing]=useState(!plan.text_diet?.reviewed_at),[confirming,setConfirming]=useState(false),[version,setVersion]=useState<NutritionPlanVersion|null>(null);
  const draft=plan.text_diet!,ready=isTextDiet(draft)&&!!draft.reviewed_at&&textDietPrescriptionMatches(draft,plan)&&!!plan.patient_id;
  return <section className="rounded-[28px] border border-[#dce6de] bg-white p-4 text-[#173d36] sm:p-7">
    <header className="flex flex-wrap justify-between gap-3"><div><p className="nuth-eyebrow">Revisión · Dietas en texto</p><h1 className="mt-2 text-2xl font-semibold">{draft.diets.length} dietas completas</h1><p className="mt-2 text-sm text-[#687870]">Revisa el texto que recibirá el paciente. Publicar conserva esta versión tal como la aprobaste.</p></div>{generateAction}</header>
    <div className="my-5 flex flex-wrap items-center gap-3"><button className="nuth-button-secondary" onClick={()=>setEditing(true)}><Pencil size={16}/>Revisar y editar dietas</button><span className={`text-sm ${ready?'text-green-800':'text-amber-800'}`}>{ready?'Revisión aprobada':'Pendiente de revisión y aprobación'}</span></div>
    <PatientPlanPreview value={patientPlanViewFromDraft(plan,patientName)}/>
    <section className="mt-5 rounded-xl border border-[#dfe6e1] p-4"><h2 className="font-semibold">Publicación</h2><p className="mt-2 text-sm text-[#687870]">Las metas prescritas son referencia. Las cantidades y el contenido de estas dietas han de ser revisados por ti antes de publicar.</p><button className="nuth-button mt-3" disabled={!ready||publishing} onClick={()=>setConfirming(true)}>{publishing&&<LoaderCircle className="animate-spin" size={16}/>}Publicar versión</button></section>
    <section className="mt-5"><h2 className="font-semibold">Historial de publicaciones</h2><ul className="mt-2 space-y-2">{versions.map(v=><li key={v.id}><button className="nuth-button-secondary !py-2" onClick={()=>setVersion(v)}>Ver versión {v.version_number}{v.id===plan.current_version_id?' · vigente':''}</button></li>)}</ul></section>
    {editing&&<TextDietEditor plan={plan} onSave={onSave} onClose={()=>setEditing(false)}/>}
    {confirming&&<div role="dialog" aria-modal="true" aria-label="Publicar dietas revisadas" className="fixed inset-0 z-50 grid place-items-center bg-[#173d36]/40 p-4"><div className="max-w-lg rounded-2xl bg-white p-6"><h2 className="text-xl font-semibold">Publicar {draft.diets.length} dietas revisadas</h2><p className="my-3 text-sm">Se conservará exactamente el texto aprobado. Las versiones anteriores permanecerán en el historial.</p><div className="flex gap-2"><button className="nuth-button-secondary" onClick={()=>setConfirming(false)}>Volver</button><button className="nuth-button" onClick={()=>{setConfirming(false);onPublish();}}>Confirmar publicación</button></div></div></div>}
    {version&&<div role="dialog" aria-modal="true" aria-label="Versión publicada" className="fixed inset-0 z-50 overflow-auto bg-[#173d36]/40 p-4"><div className="mx-auto max-w-3xl rounded-2xl bg-white p-5"><button className="nuth-button-secondary mb-3" onClick={()=>setVersion(null)}>Cerrar versión</button><PatientPlanPreview historical value={patientPlanViewFromVersion(version.snapshot)}/></div></div>}
  </section>;
}
