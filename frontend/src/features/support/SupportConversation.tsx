import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { SupportMacroPicker } from './SupportContent';
import { supportDate, supportRequest, type SupportDetail, type SupportMessage, type SupportThread } from './api';

export function SupportComposer({threadId,topic='other',source='',admin=false,onSent}:{threadId?:string;topic?:string;source?:string;admin?:boolean;onSent:()=>Promise<void>|void}){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const operation=useRef({fingerprint:'',key:''});
 async function send(event:React.FormEvent){
  event.preventDefault();if(busy||!text.trim())return;setBusy(true);setError('');
  const data={body:text.trim(),topic,source,...(threadId?{threadId}:{})},fingerprint=JSON.stringify(data);
  if(operation.current.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()};
  try{await supportRequest('send',{...data,clientKey:operation.current.key},admin);setText('');operation.current={fingerprint:'',key:''};await onSent();}
  catch(e){setError(e instanceof Error?e.message:'No pudimos enviar el mensaje.');}finally{setBusy(false);}
 }
 return <form onSubmit={send} className="support-composer">
  <>{admin&&<SupportMacroPicker disabled={busy} onSelect={body=>setText(current=>`${current}${current?'\n\n':''}${body}`.slice(0,8000))}/>}</>
  <label className="sr-only" htmlFor={`support-message-${threadId??'new'}`}>Mensaje para {admin?'el nutriólogo':'soporte'}</label>
  <textarea id={`support-message-${threadId??'new'}`} value={text} onChange={e=>setText(e.target.value)} maxLength={8000} disabled={busy} rows={3} placeholder={admin?'Escribe una respuesta…':'Cuéntanos en qué podemos ayudarte…'} className="nuth-input resize-y"/>
  <div className="flex items-center justify-between gap-3"><span className="text-xs text-[#63796d]">{text.length.toLocaleString('es-MX')} / 8,000</span><button className="nuth-button" disabled={busy||!text.trim()}><Send size={16} aria-hidden="true"/>{busy?'Enviando…':'Enviar'}</button></div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 </form>;
}

export function SupportConversation({thread,admin=false,onChange}:{thread:SupportThread;admin?:boolean;onChange:()=>Promise<void>|void}){
 const [messages,setMessages]=useState<SupportMessage[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[older,setOlder]=useState(false),[loadingOlder,setLoadingOlder]=useState(false),[reload,setReload]=useState(0);
 const end=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  let live=true;
  void supportRequest<SupportDetail>('thread',{threadId:thread.id},admin).then(async data=>{
   if(!live)return;
   setMessages(current=>{const map=new Map(current.map(m=>[m.seq,m]));data.messages.forEach(m=>map.set(m.seq,m));return [...map.values()].sort((a,b)=>a.seq-b.seq);});
   setOlder(data.messages.length===50);setError('');setLoading(false);
   const through=data.messages.at(-1)?.seq;
   if(through&&document.visibilityState==='visible')await supportRequest('read',{threadId:thread.id,through},admin);
  }).catch(e=>{if(live){setError(e.message);setLoading(false);}});
  return()=>{live=false;};
 },[thread.id,thread.last_seq,thread.status,admin,reload]);
 useEffect(()=>{end.current?.scrollIntoView?.({block:'nearest'});},[thread.last_seq]);
 async function loadOlder(){
  if(loadingOlder)return;setLoadingOlder(true);
  try{const data=await supportRequest<SupportDetail>('thread',{threadId:thread.id,before:messages[0]?.seq},admin);setMessages(current=>[...data.messages,...current]);setOlder(data.messages.length===50);}
  catch(e){setError(e instanceof Error?e.message:'No pudimos cargar el historial.');}finally{setLoadingOlder(false);}
 }
 return <div className="support-conversation">
  <div className="support-messages" role="log" aria-label="Conversación con soporte" aria-live="polite">
   {loading&&<p role="status">Cargando conversación…</p>}
   {older&&<button className="nuth-button-secondary" disabled={loadingOlder} onClick={()=>void loadOlder()}>Ver mensajes anteriores</button>}
   {messages.map(message=><article key={message.seq} className={`support-message ${message.sender===(admin?'admin':'professional')?'support-message-own':''}`}>
    <p className="mb-1 text-xs font-semibold">{message.sender==='admin'?'Equipo Nuthrick':admin?'Nutriólogo':'Tú'}</p>
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
    <time dateTime={message.created_at} className="mt-2 block text-[11px] text-[#63796d]">{supportDate(message.created_at)}</time>
   </article>)}<div ref={end}/>
   {error&&<p role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={()=>setReload(n=>n+1)}>Reintentar</button></p>}
  </div>
  {thread.status==='resolved'?<p className="border-t border-[#dbe5df] p-4 text-sm text-[#63796d]">Caso resuelto. El historial queda conservado; el nutriólogo comienza una conversación nueva cuando vuelva a necesitar ayuda.</p>:<SupportComposer threadId={thread.id} admin={admin} onSent={async()=>{setReload(n=>n+1);await onChange();}}/>}
 </div>;
}
