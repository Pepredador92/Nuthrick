import {useEffect,useState} from 'react';
import {portalAction,type PortalContent} from '@/src/services/patientPortal';
import {portalDate} from './PortalContentView';
type Goal={consultationId:string;date:string;revision:number;questionKey:string;content:string};
export function PortalGoal({patientId,content,onChange}:{patientId:string;content:PortalContent;onChange:(content:PortalContent)=>void}){
 const [goals,setGoals]=useState<Goal[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[custom,setCustom]=useState(Boolean(content.goal&&!content.goalSource));
 useEffect(()=>{
  let active=true,inFlight=false;
  const load=async()=>{if(inFlight)return;inFlight=true;try{const result=await portalAction<{goals:Goal[]}>({patientId},'goal_candidates');if(active){setGoals(result.goals);setError('');}}catch{if(active)setError('No pudimos consultar el objetivo. Intenta nuevamente al volver a esta pantalla.');}finally{inFlight=false;if(active)setLoading(false);}};
  void load();window.addEventListener('focus',load);
  return()=>{active=false;window.removeEventListener('focus',load);};
 },[patientId]);
 const current=goals.find(g=>g.consultationId===content.goalSource?.consultationId&&g.revision===content.goalSource?.revision&&g.questionKey===content.goalSource?.questionKey);
 const candidate=goals[0];
 const apply=(g:Goal)=>onChange({...content,goal:g.content,goalSource:{consultationId:g.consultationId,revision:g.revision,questionKey:g.questionKey}});
 return <section className="mt-5" aria-label="Objetivo de consulta">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Objetivo actual</h3>
   <select aria-label="Origen del objetivo" className="nuth-input !w-auto !py-2 text-sm" value={custom?'custom':'consultation'} onChange={e=>{setCustom(e.target.value==='custom');onChange({...content,goal:'',goalSource:null});}}>
    <option value="consultation">Usar objetivo de la consulta</option><option value="custom">Texto personalizado</option>
   </select>
  </div>
  {custom?<><p className="my-2 text-xs text-[#74817d]">Texto exclusivo del portal. No modifica objetivos históricos.</p><textarea aria-label="Objetivo personalizado" className="nuth-input min-h-24" maxLength={12000} value={content.goal} onChange={e=>onChange({...content,goal:e.target.value,goalSource:null})}/></>:
   <>
    {loading?<p role="status" className="mt-3 text-sm">Buscando objetivo de consulta…</p>:error?<p role="alert">{error}</p>:!candidate?<p className="mt-3 text-sm text-[#74817d]">Aún no hay objetivos registrados en una consulta finalizada.</p>:<>
     <p className="mt-3 whitespace-pre-line rounded-xl bg-[#f5f7f3] p-3 text-sm">{content.goalSource?content.goal:candidate.content}</p>
     <p className="mt-2 text-xs text-[#74817d]">{current?`Origen: consulta del ${portalDate(current.date)}`:content.goalSource?'El objetivo anterior ya no está disponible en una consulta finalizada.':`Origen: consulta del ${portalDate(candidate.date)}`}</p>
     <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(content.goalSource&&content.goal)} onChange={e=>e.target.checked?apply(candidate):onChange({...content,goal:'',goalSource:null})}/>Compartir objetivo</label>
     {content.goalSource&&(candidate.consultationId!==content.goalSource.consultationId||candidate.revision!==content.goalSource.revision||candidate.content!==content.goal)&&<button type="button" className="mt-3 text-sm font-semibold underline" onClick={()=>apply(candidate)}>Usar objetivo más reciente · {portalDate(candidate.date)}</button>}
    </>}
   </>}
  {!custom&&!candidate&&content.goalSource&&<button type="button" className="mt-3 text-sm font-semibold underline" onClick={()=>onChange({...content,goal:'',goalSource:null})}>Dejar de compartir el objetivo anterior</button>}
  <p className="mt-2 text-xs text-[#74817d]">Se actualiza para el paciente al revisar y publicar los cambios.</p>
 </section>;
}
