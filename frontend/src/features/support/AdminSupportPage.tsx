import { useEffect, useState } from 'react';
import { CheckCheck, RotateCcw } from 'lucide-react';
import { Heading } from '@/src/features/admin/AdminPages';
import { SupportConversation } from './SupportConversation';
import { useSupport } from './SupportProvider';
import { supportDate, supportRequest, supportStatuses, supportTopics, type SupportStatus, type SupportThread } from './api';
import './support.css';
export function AdminSupportPage(){
 const {revision,refresh}=useSupport();
 const [items,setItems]=useState<SupportThread[]>([]),[selected,setSelected]=useState<SupportThread|null>(null),[status,setStatus]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let active=true;const timer=setTimeout(()=>{
   void supportRequest<{items:SupportThread[]}>('inbox',{status,search,offset},true).then(data=>{
    if(!active)return;setItems(data.items);setLoading(false);setError('');
    setSelected(current=>current?data.items.find(t=>t.id===current.id)??current:null);
   }).catch(e=>{if(active){setError(e.message);setLoading(false);}});
  },200);return()=>{active=false;clearTimeout(timer);};
 },[revision,status,search,offset]);
 async function changeStatus(next:SupportStatus){
  if(!selected||busy)return;setBusy(true);setError('');
  try{const updated=await supportRequest<SupportThread>('status',{threadId:selected.id,revision:selected.revision,status:next},true);setSelected({...selected,...updated});await refresh();}
  catch(e){setError(e instanceof Error?e.message:'No pudimos actualizar el caso.');await refresh();}finally{setBusy(false);}
 }
 return <>
  <Heading eyebrow="Soporte" title="Atención a nutriólogos" text="Responde dudas y resuelve casos. Al resolver, el nutriólogo vuelve al inicio y el historial queda aquí."/>
  <div className="mb-5 flex flex-wrap gap-3"><label className="min-w-52 flex-1 text-sm">Buscar nutriólogo<input className="nuth-input mt-1" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}} placeholder="Nombre o correo"/></label><label className="text-sm">Estado<select className="nuth-input mt-1" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="">Todos los casos</option>{Object.entries(supportStatuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button className="admin-button secondary self-end" onClick={()=>void refresh()}>Actualizar</button></div>
  {error&&<p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
  <div className="support-admin-grid">
   <section className="admin-card !p-3" aria-label="Bandeja de soporte">
    {loading?<p role="status" className="p-3">Cargando conversaciones…</p>:!items.length?<p className="p-3 text-sm text-[#63796d]">No hay conversaciones con estos filtros.</p>:<ul className="max-h-[65vh] space-y-2 overflow-auto">{items.map(thread=><li key={thread.id}><button className={`w-full rounded-xl border p-3 text-left ${thread.id===selected?.id?'border-[#729580] bg-[#edf5ef]':'border-[#e0e8e2] bg-white'}`} aria-pressed={thread.id===selected?.id} onClick={()=>setSelected(thread)}><span className="flex items-center justify-between gap-2"><strong className="text-sm">{thread.professional_name}</strong>{thread.admin_unread>0&&<span className="rounded-full bg-[#efbd6b] px-2 text-xs">{thread.admin_unread} sin leer</span>}</span><span className="mt-1 block text-xs text-[#63796d]">{supportTopics[thread.topic]} · {supportStatuses[thread.status]}</span><span className="mt-2 block truncate text-sm">{thread.preview}</span><time className="mt-2 block text-xs text-[#63796d]">{supportDate(thread.updated_at)}</time></button></li>)}</ul>}
    <div className="mt-3 flex items-center justify-between gap-2"><button className="admin-link" disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Anterior</button><span className="text-xs">Página {offset/50+1}</span><button className="admin-link" disabled={items.length<50} onClick={()=>setOffset(n=>n+50)}>Siguiente</button></div>
   </section>
   <section className="admin-card !overflow-hidden !p-0" aria-label="Caso de soporte seleccionado">
    {selected?<><header className="border-b border-[#dbe5df] p-5"><h2 className="font-semibold">{selected.professional_name}</h2><p className="mt-1 break-all text-xs text-[#63796d]">{selected.email} · {supportTopics[selected.topic]}{selected.source?` · Desde ${selected.source}`:''}</p><div className="mt-4 flex flex-wrap gap-2">{selected.status==='resolved'?<button className="admin-button secondary" disabled={busy} onClick={()=>void changeStatus('in_progress')}><RotateCcw size={15}/>Reabrir caso</button>:<><button className="admin-button secondary" disabled={busy||selected.status==='in_progress'} onClick={()=>void changeStatus('in_progress')}>En atención</button><button className="admin-button" disabled={busy||selected.admin_unread>0} onClick={()=>void changeStatus('resolved')}><CheckCheck size={16}/>Resolver y reiniciar</button></>}<span className="self-center text-xs text-[#63796d]">{supportStatuses[selected.status]}</span></div>{selected.admin_unread>0&&<p className="mt-2 text-xs text-[#63796d]">Revisa los mensajes nuevos antes de resolver.</p>}</header><SupportConversation key={selected.id} thread={selected} admin onChange={refresh}/></>:<p className="p-8 text-sm text-[#63796d]">Selecciona una conversación para atenderla.</p>}
   </section>
  </div>
 </>;
}
