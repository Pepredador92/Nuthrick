import { useCallback, useEffect, useState } from 'react';
import { confirmationOpensAt, listAppointments, patientAppointments, patientConfirmAppointment, type Appointment } from '@/src/services/appointments';
import { AppointmentCard } from './AppointmentCard';
import { useAppointmentClock } from './useAppointmentClock';
export function UpcomingAppointments({patientId,session,limit=5,refreshKey=0,remindersOnly=false}:{patientId?:string;session?:string;limit?:number;refreshKey?:number;remindersOnly?:boolean}) {
 const now=useAppointmentClock();
 const [items,setItems]=useState<Appointment[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{try{const r=await (session?patientAppointments(session):listAppointments(patientId));setItems(r.appointments);setError('');}catch(e){setError(e instanceof Error?e.message:'No pudimos cargar tus citas.');}finally{setLoading(false);}},[patientId,session]);
 useEffect(()=>{let active=true;const refresh=()=>{if(active&&document.visibilityState==='visible')void load();};refresh();const timer=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[load,refreshKey]);
 const visible=items.filter(a=>Date.parse(a.starts_at)>now&&(!remindersOnly||now>=confirmationOpensAt(a)));
 return <section aria-label="Próximas citas" className="space-y-3"><h2 className="font-semibold text-[#173d36]">{remindersOnly?'Citas en las próximas 48 horas':'Próximas citas'}</h2>{loading?<p role="status" className="text-sm">Cargando citas…</p>:error?<p role="alert" className="text-sm text-red-700">{error}</p>:!visible.length?<p className="text-sm text-[#63796d]">{remindersOnly?'No hay citas en las próximas 48 horas.':'No hay citas próximas.'}</p>:visible.slice(0,limit).map(a=><AppointmentCard key={a.id} appointment={a} onChanged={()=>void load()} confirmPatient={session?()=>patientConfirmAppointment(session,a.id):undefined}/>)}</section>;
}
