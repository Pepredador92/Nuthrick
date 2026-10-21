import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type Dispatch,type MutableRefObject,type ReactNode,type SetStateAction} from 'react';
import {supabase} from '@/src/lib/supabase';
import {boundedAnswerRequest,changedAnswers,createAnswerAutosave,type AnswerState,type AnswerWrite} from '@/src/features/consultations/answerAutosave';

export type ConsultationDraftController = {flush:()=>Promise<boolean>;stop:()=>Promise<void>;resume:()=>void;refresh:()=>Promise<Record<string,unknown>>};
type DraftContext = {values:Record<string,unknown>;set:(key:string,value:unknown)=>void;flush:()=>Promise<boolean>;refresh:()=>Promise<Record<string,unknown>>;save:()=>Promise<boolean>};
const Context=createContext<DraftContext|null>(null);
const backupKey=(id:string,revision:number)=>`consultation-working:${id}:${revision}`;
async function sync(id:string,revision:number,write?:AnswerWrite,signal?:AbortSignal):Promise<AnswerState> {
  const request=supabase.rpc('sync_consultation_drafts',{p_consultation:id,p_revision:revision,p_version:write?.version??null,p_changes:write?.changes??null,p_request:write?.requestId??null});
  const {data,error}=await (signal?request.abortSignal(signal):request);
  if(error||!data)throw new Error('No pudimos guardar el avance de la consulta. Tus cambios siguen en esta pestaña. Reintenta antes de salir.');
  return data as AnswerState;
}

/** Unapproved work has its own versioned server checkpoint. Saving it neither
 * approves clinical decisions nor publishes drafts to the patient. */
export function ConsultationDrafts({consultationId,revision,controllerRef,onSave,children}:{consultationId:string;revision:number;controllerRef:MutableRefObject<ConsultationDraftController|null>;onSave:()=>Promise<boolean>;children:ReactNode}) {
  const [writer]=useState(()=>createAnswerAutosave());
  const [values,setValues]=useState<Record<string,unknown>>({});
  const current=useRef(values),mounted=useRef(true),discarded=useRef(false);
  const [ready,setReady]=useState(false),[loadError,setLoadError]=useState('');
  const [state,setState]=useState({saving:false,error:'',conflict:false});
  const key=backupKey(consultationId,revision);
  const backup=useCallback(()=>{
    if(discarded.current)return;
    try{sessionStorage.setItem(key,JSON.stringify({values:current.current,base:writer.saved()}));}catch{/* The server checkpoint remains the durable copy. */}
  },[key,writer]);
  const flush=useCallback(()=>writer.flush(),[writer]);
  const refresh=useCallback(async()=>{
    if(!await writer.flush())return current.current;
    const saved=await boundedAnswerRequest(signal=>sync(consultationId,revision,undefined,signal));
    writer.reset(saved,saved.answers);current.current=saved.answers;setValues(saved.answers);backup();return saved.answers;
  },[writer,consultationId,revision,backup]);
  useEffect(()=>{
    mounted.current=true;
    writer.configure({read:signal=>sync(consultationId,revision,undefined,signal),write:(request,signal)=>sync(consultationId,revision,request,signal),
      onState:next=>{if(mounted.current)setState(next);},onMerge:(next)=>{current.current=next;if(mounted.current)setValues(next);backup();}});
    let alive=true;
    void boundedAnswerRequest(signal=>sync(consultationId,revision,undefined,signal)).then(saved=>{
      if(!alive)return;
      let cached:{values:Record<string,unknown>;base:AnswerState}|null=null;
      try{cached=JSON.parse(sessionStorage.getItem(key)||'null');}catch{/* Ignore an unreadable local backup. */}
      const next=cached?.values&&cached?.base?{...saved.answers,...changedAnswers(cached.base.answers,cached.values)}:saved.answers;
      writer.reset(saved,next,cached?.base);current.current=next;setValues(next);setReady(true);
    }).catch(()=>{if(alive)setLoadError('No pudimos recuperar el avance guardado. Actualiza la página para volver a intentarlo.');});
    controllerRef.current={flush,refresh,stop:async()=>{discarded.current=true;await writer.stop();try{sessionStorage.removeItem(key);}catch{/* Local storage may be unavailable. */}},resume:()=>{discarded.current=false;writer.resume();backup();}};
    const persist=()=>{backup();if(document.visibilityState==='hidden')void writer.flush();};
    document.addEventListener('visibilitychange',persist);window.addEventListener('pagehide',persist);
    return()=>{alive=false;mounted.current=false;backup();void writer.stop();controllerRef.current=null;document.removeEventListener('visibilitychange',persist);window.removeEventListener('pagehide',persist);};
  },[consultationId,revision,writer,key,backup,controllerRef,flush,refresh]);
  useEffect(()=>{if(!ready||state.error)return;const timer=setTimeout(()=>void writer.flush(),800);return()=>clearTimeout(timer);},[values,ready,state.error,writer]);
  const set=useCallback((name:string,value:unknown)=>{
    const normalized=value===undefined?null:value;
    if(!Object.keys(changedAnswers({[name]:current.current[name]},{[name]:normalized})).length)return;
    const next={...current.current,[name]:normalized};current.current=next;writer.update(next);setValues(next);backup();
  },[writer,backup]);
  if(!ready)return <section className="nuth-card p-5" role="status">{loadError||'Recuperando el avance de la consulta…'}</section>;
  return <Context value={{values,set,flush,refresh,save:onSave}}>
    {state.error&&<section role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><p>{state.error}</p>{state.conflict?<div className="mt-3 flex gap-3"><button type="button" onClick={()=>{writer.resolveConflict(true);void flush();}}>Conservar mi avance y guardar</button><button type="button" onClick={()=>{writer.resolveConflict(false);void flush();}}>Usar el avance del servidor</button></div>:<button type="button" className="mt-2 underline" onClick={()=>void flush()}>Reintentar guardado del avance</button>}</section>}
    {children}
  </Context>;
}

export function useConsultationDraft<T>(key:string,initial:T|(()=>T),persistInitial=false):[T,Dispatch<SetStateAction<T>>] {
  const context=useContext(Context);
  const [fallback,setFallback]=useState(initial);
  const value=context&&Object.hasOwn(context.values,key)?context.values[key] as T:fallback;
  const latest=useRef(value),contextRef=useRef(context);
  useLayoutEffect(()=>{latest.current=value;contextRef.current=context;},[value,context]);
  useEffect(()=>{if(persistInitial&&context&&!Object.hasOwn(context.values,key))context.set(key,fallback);},[persistInitial,context,key,fallback]);
  const update:Dispatch<SetStateAction<T>>=useCallback(next=>{
    const resolved=typeof next==='function'?(next as (previous:T)=>T)(latest.current):next;
    latest.current=resolved;if(contextRef.current)contextRef.current.set(key,resolved);else setFallback(resolved);
  },[key]);
  return [value,update];
}
export const useConsultationDraftContext=()=>useContext(Context);

export function useDurableAIProposal(feature:string,onRestore:(output:Record<string,unknown>,generationId:string)=>void,destination?:string) {
  const context=useContext(Context);
  const [handled,setHandled]=useConsultationDraft<string|null>(`handled:${feature}`,null);
  const callback=useRef(onRestore);useLayoutEffect(()=>{callback.current=onRestore;},[onRestore]);
  const proposal=context?.values[`proposal:${feature}`] as {generationId?:string;output?:Record<string,unknown>}|undefined;
  const target=context?.values[`destination:${feature}`];
  useEffect(()=>{
    if(!proposal?.generationId||!proposal.output||handled===proposal.generationId||(destination&&target&&target!==destination))return;
    callback.current(proposal.output,proposal.generationId);setHandled(proposal.generationId);
  },[proposal,handled,destination,target,setHandled]);
  return (generationId:string)=>setHandled(generationId);
}

export function SaveConsultationDraftButton() {
  const context=useContext(Context),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('');
  if(!context)return null;
  return <div><button type="button" className="nuth-button-secondary !text-sm" disabled={busy} onClick={()=>{setBusy(true);setSaved(false);setError('');void context.save().then(ok=>{setSaved(ok);if(!ok)setError('No pudimos guardar todo el avance. Conserva esta ventana abierta y reintenta.');}).catch(()=>setError('No pudimos guardar el avance. Reintenta antes de salir.')).finally(()=>setBusy(false));}}>{busy?'Guardando consulta…':'Guardar consulta'}</button>{saved&&<p role="status" className="mt-1 text-xs">Avance guardado. Puedes continuar después.</p>}{error&&<p role="alert" className="mt-1 text-xs">{error}</p>}</div>;
}

export function ConsultationDraftPosition({value,onRestore}:{value:{module:string;active:number;clinicalStage:number};onRestore:(position:{module:string;active:number;clinicalStage:number})=>void}) {
  const context=useContext(Context),first=useRef(true);
  useEffect(()=>{
    if(first.current){first.current=false;const saved=context?.values.navigation as typeof value|undefined;if(saved&&typeof saved.module==='string'&&Number.isInteger(saved.active)&&Number.isInteger(saved.clinicalStage)){onRestore(saved);return;}}
    context?.set('navigation',value);
  },[value,onRestore,context]);
  return null;
}
