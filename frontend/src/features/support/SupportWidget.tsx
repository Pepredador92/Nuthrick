import { useEffect, useRef, useState } from 'react';
import { Headphones, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { supportSource, supportStatuses, supportTopics } from './api';
import { SupportComposer, SupportConversation } from './SupportConversation';
import { useSupport } from './SupportProvider';
import './support.css';
function SupportDialog({close}:{close:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const {thread,loading,error,refresh}=useSupport();
 const {pathname}=useLocation();
 useEffect(()=>{const el=dialog.current!;const previous=document.activeElement as HTMLElement|null;el.showModal();void refresh();return()=>{el.close();previous?.focus();};},[refresh]);
 return <dialog ref={dialog} className="support-dialog" aria-label="Soporte Nuthrick" onCancel={e=>{e.preventDefault();close();}}>
  <div className="support-dialog-shell">
   <header className="flex items-center justify-between gap-3 border-b border-[#e0e8e2] px-5 py-4"><div><h2 className="flex items-center gap-2 font-semibold"><Headphones size={19}/>Soporte Nuthrick</h2><p className="mt-1 text-xs text-[#63796d]">9:00 a. m. a 5:00 p. m. · Ciudad de México</p></div><button className="rounded-lg p-2 hover:bg-[#f2f5f2]" aria-label="Cerrar soporte" onClick={close}><X size={18}/></button></header>
   <div className="support-dialog-body">
    {loading?<p role="status" className="p-5 text-sm">Cargando soporte…</p>:thread?<><p className="px-5 pt-4 text-xs text-[#63796d]">{supportTopics[thread.topic]} · {supportStatuses[thread.status]}</p><SupportConversation key={thread.id} thread={thread} onChange={refresh}/></>:<SupportWelcome source={supportSource(pathname)} onSent={refresh}/>}
    {error&&<p role="alert" className="px-5 pb-4 text-sm text-red-700">{error} <button onClick={()=>void refresh()} className="underline">Reintentar</button></p>}
   </div>
  </div>
 </dialog>;
}
function SupportWelcome({source,onSent}:{source:string;onSent:()=>Promise<void>}){
 const [topic,setTopic]=useState<keyof typeof supportTopics>('other');
 return <div><div className="p-5"><h3 className="text-lg font-semibold">¿En qué podemos ayudarte?</h3><p className="mt-2 text-sm leading-relaxed text-[#63796d]">Déjanos tu mensaje; te responderemos aquí. Puedes escribirnos también fuera del horario de atención.</p><fieldset className="mt-4"><legend className="mb-2 text-sm font-medium">Tema de tu consulta</legend><div className="flex flex-wrap gap-2">{Object.entries(supportTopics).map(([key,label])=><button key={key} type="button" aria-pressed={topic===key} onClick={()=>setTopic(key as keyof typeof supportTopics)} className={`rounded-full border px-3 py-2 text-xs ${topic===key?'border-[#608c73] bg-[#e7f0e9]':'border-[#dbe5df] bg-white'}`}>{label}</button>)}</div></fieldset></div><SupportComposer topic={topic} source={source} onSent={onSent}/></div>;
}
export function SupportWidget(){
 const [open,setOpen]=useState(false);const {unread}=useSupport();
 return <><button type="button" className="support-launcher" aria-label={unread?`Soporte, ${unread} mensajes sin leer`:'Abrir soporte'} aria-haspopup="dialog" onClick={()=>setOpen(true)}><Headphones size={21} aria-hidden="true"/><span>Ayuda</span>{unread>0&&<span className="rounded-full bg-[#efbd6b] px-2 text-xs text-[#173d36]">{unread>99?'99+':unread}</span>}</button>{open&&<SupportDialog close={()=>setOpen(false)}/>}</>;
}
