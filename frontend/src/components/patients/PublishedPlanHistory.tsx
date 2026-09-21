import {useEffect,useState} from 'react';
import {portalAction,type PortalPlan} from '@/src/services/patientPortal';
import type {PublishedPlanSummary} from '@/src/services/planDocuments';
import type {Consultation} from '@/src/types/domain';
import {PortalPlanContent} from './PortalPlan';
import {PlanExport} from './PlanExport';
import {portalDate} from './PortalContentView';
export function PublishedPlanHistory({patientId,consultations=[],onConsultation}:{patientId:string;consultations?:Consultation[];onConsultation?:(id:string)=>void}){
 const [versions,setVersions]=useState<PublishedPlanSummary[]>([]),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<PortalPlan|null>(null),[reading,setReading]=useState(false);
 useEffect(()=>{let active=true;void portalAction<{versions:PublishedPlanSummary[]}>({patientId},'plan_history').then(r=>{if(active){setVersions(r.versions);setMore(r.versions.length===50);}}).catch(()=>{if(active)setError('No pudimos cargar los planes publicados.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[patientId]);
 async function loadMore(){setLoading(true);try{const r=await portalAction<{versions:PublishedPlanSummary[]}>({patientId},'plan_history',{offset:versions.length});setVersions(old=>[...old,...r.versions]);setMore(r.versions.length===50);}catch{setError('No pudimos cargar los planes publicados.');}finally{setLoading(false);}}
 async function view(id:string){if(reading)return;setReading(true);setError('');try{const r=await portalAction<{plan:PortalPlan}>({patientId},'plan_version',{versionId:id});setSelected(r.plan);}catch{setError('No pudimos abrir esta versión del plan.');}finally{setReading(false);}}
 const events=[...versions.map(v=>({id:v.id,date:v.published_at,version:v,consultation:null as Consultation|null})),...consultations.filter(c=>c.status==='completed'&&!c.deleted_at).map(c=>({id:c.id,date:c.consultation_date,version:null as PublishedPlanSummary|null,consultation:c}))].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 return <section aria-label="Historial de planes publicados" className="space-y-3">
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {loading&&<p role="status">Cargando versiones publicadas…</p>}
  {!loading&&!events.length&&!error&&<p className="text-sm text-[#74817d]">Aún no hay planes publicados. Los borradores permanecen en el Taller.</p>}
  {events.map(event=><article key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dfe5e1] p-4">
   <div><p className="text-xs text-[#74817d]">{portalDate(event.date)}</p><h3 className="mt-1 font-semibold">{event.version?`Plan nutricional · v${event.version.version_number}`:'Consulta finalizada'}</h3>{event.version&&<p className="mt-1 text-sm text-[#52685d]">{event.version.title}</p>}</div>
   {event.version?<div className="flex gap-2"><button className="nuth-button-secondary !px-3 !py-2 !text-xs" disabled={reading} onClick={()=>void view(event.version!.id)}>Ver</button><PlanExport access={{patientId}} versionId={event.version.id}/></div>:<button className="nuth-button-secondary !px-3 !py-2 !text-xs" onClick={()=>onConsultation?.(event.id)}>Ver consulta</button>}
  </article>)}
  {more&&<button className="nuth-button-secondary" disabled={loading} onClick={()=>void loadMore()}>Ver versiones anteriores</button>}
  {selected&&<div className="fixed inset-0 z-50 overflow-y-auto bg-[#102d27]/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Plan publicado v${selected.versionNumber}`}><div className="mx-auto max-w-3xl rounded-3xl bg-white p-4"><div className="mb-3 flex items-center justify-between"><p className="text-sm">Versión histórica · Solo lectura</p><button className="nuth-button-secondary !py-2" onClick={()=>setSelected(null)}>Cerrar plan</button></div><PortalPlanContent plan={selected}/></div></div>}
 </section>;
}
