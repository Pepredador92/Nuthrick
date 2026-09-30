import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { playNotificationSound } from '@/src/features/notifications/sound';
import { subscribeSupport, supportRequest, type SupportThread } from './api';
type State={thread:SupportThread|null;unread:number;revision:number;loading:boolean;error:string;refresh:()=>Promise<void>};
const Context=createContext<State>({thread:null,unread:0,revision:0,loading:true,error:'',refresh:async()=>{}});
function Session({userId,admin,children}:{userId:string;admin:boolean;children:ReactNode}){
 const [state,setState]=useState<Omit<State,'refresh'>>({thread:null,unread:0,revision:0,loading:true,error:''});
 const alive=useRef(false),request=useRef(0),previousUnread=useRef<number|null>(null);
 const refresh=useCallback(async()=>{
  const generation=++request.current;
  try {
   const result=await supportRequest<{thread?:SupportThread|null;unread:number}>('summary',{},admin);
   if(!alive.current||generation!==request.current)return;
   if(previousUnread.current!==null&&result.unread>previousUnread.current)playNotificationSound();
   previousUnread.current=result.unread;
   setState(s=>({thread:result.thread??null,unread:result.unread,revision:s.revision+1,loading:false,error:''}));
  }catch(error){if(alive.current&&generation===request.current)setState(s=>({...s,loading:false,error:error instanceof Error?error.message:'No pudimos actualizar soporte.'}));}
 },[admin]);
 useEffect(()=>{
  alive.current=true;
  if(!userId)return()=>{alive.current=false;};
  void refresh();
  const update=()=>{if(document.visibilityState==='visible')void refresh();};
  let stop=()=>{};try{stop=subscribeSupport(userId,admin,update);}catch{/* Polling remains available. */}
  const timer=setInterval(update,30000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
  return()=>{alive.current=false;stop();clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
 },[admin,refresh,userId]);
 return <Context.Provider value={{...state,refresh}}>{children}</Context.Provider>;
}
export function SupportProvider({admin=false,children}:{admin?:boolean;children:ReactNode}){
 const {user}=useAuth();return <Session key={`${user?.id}:${admin}`} userId={user?.id??''} admin={admin}>{children}</Session>;
}
export const useSupport=()=>useContext(Context);
export function SupportUnread(){const {unread}=useSupport();return unread>0?<span className="ml-auto rounded-full bg-[#efbd6b] px-2 py-0.5 text-xs font-bold text-[#173d36]" aria-label={`${unread} mensajes de soporte sin leer`}>{unread>99?'99+':unread}</span>:null;}
