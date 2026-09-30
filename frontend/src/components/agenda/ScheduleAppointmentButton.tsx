import { useEffect, useRef, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { agendaApi } from '@/src/services/agenda';
import type { Appointment, AppointmentOptions } from '@/src/services/appointments';
import { AppointmentCard } from './AppointmentCard';
import { PatientCombobox, type PatientOption } from './PatientCombobox';
export function ScheduleAppointmentButton({patient,onSaved,className='nuth-button'}:{patient?:PatientOption;onSaved?:()=>void;className?:string}) {
 const [open,setOpen]=useState(false);
 return <><button type="button" className={className} onClick={()=>setOpen(true)}><CalendarPlus size={17} aria-hidden="true"/>Agendar cita</button>{open&&<ScheduleDialog patient={patient} close={()=>setOpen(false)} onSaved={onSaved}/>}</>;
}
function ScheduleDialog({patient,close,onSaved}:{patient?:PatientOption;close:()=>void;onSaved?:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),operation=useRef({fingerprint:'',key:''});
 const [options,setOptions]=useState<AppointmentOptions|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[created,setCreated]=useState<Appointment|null>(null);
 const [selected,setSelected]=useState<PatientOption|null>(patient??null),[localTime,setLocalTime]=useState(''),[choice,setChoice]=useState(''),[exception,setException]=useState(false);
 useEffect(()=>{const el=dialog.current!;const previous=document.activeElement as HTMLElement|null;el.showModal();return()=>{el.close();previous?.focus();};},[]);
 useEffect(()=>{let active=true;void agendaApi<AppointmentOptions>('appointment_options',{},true).then(data=>{if(active){setOptions(data);if(data.options.length===1)setChoice('0');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function save(event:React.FormEvent){event.preventDefault();if(busy||!options||choice===''||!selected)return;setBusy(true);setError('');try{
  const resolved=await agendaApi<{instants:string[]}>('resolve_time_private',{localTime},true);
  if(resolved.instants.length!==1)throw new Error('La hora no existe o es ambigua en esta zona horaria. Elige otra.');
  const chosen=options.options[Number(choice)];const payload={patientId:selected.id,start:resolved.instants[0],modality:chosen.modality,locationId:chosen.location_id,allowOutsideSchedule:exception};
  const fingerprint=JSON.stringify(payload);if(operation.current.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()};
  const result=await agendaApi<Appointment>('appointment_create',{...payload,operationKey:operation.current.key},true);
  setCreated({...result,contact_name:selected.full_name});onSaved?.();
 }catch(e){setError(e instanceof Error?e.message:'No pudimos agendar la cita.');}finally{setBusy(false);}}
 return <dialog ref={dialog} aria-label="Agendar cita" aria-modal="true" className="m-auto max-h-[90dvh] w-[min(560px,calc(100vw-24px))] overflow-y-auto rounded-3xl border-0 bg-white p-5 text-[#173d36] backdrop:bg-[#102d27]/50 sm:p-7" onCancel={e=>{e.preventDefault();if(!busy)close();}}>
  <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{created?'Cita agendada':'Agendar cita'}</h2><button type="button" disabled={busy} className="nuth-button-secondary" onClick={close}>Cerrar</button></div>
  {created?<div className="mt-5"><p role="status" className="mb-4 text-sm">El horario quedó reservado. Confirma tu parte y comparte el enlace con el paciente.</p><AppointmentCard appointment={created} onChanged={()=>{setCreated({...created,professional_confirmed_at:new Date().toISOString()});onSaved?.();}}/></div>:<form onSubmit={save} className="mt-5 space-y-4">
   {patient?<p className="rounded-xl bg-[#f2f6f2] p-3 font-semibold">{patient.full_name}</p>:<PatientCombobox value={selected} onChange={setSelected} disabled={busy}/>}
   {!options?<p role="status">Cargando disponibilidad…</p>:<><p className="text-sm text-[#63796d]">Duración: {options.duration} min · Zona: {options.timezone}. Anticipación mínima: {options.minimumNoticeMinutes} min.</p>
    <label className="block text-sm font-semibold">Fecha y hora<input type="datetime-local" className="nuth-input mt-2" value={localTime} onChange={e=>setLocalTime(e.target.value)} required disabled={busy}/></label>
    <label className="block text-sm font-semibold">Modalidad y consultorio<select className="nuth-input mt-2" value={choice} onChange={e=>setChoice(e.target.value)} required disabled={busy}><option value="">Selecciona una opción</option>{options.options.map((o,i)=><option key={i} value={i}>{o.label}</option>)}</select></label>
    {!options.options.length&&<p role="alert">Configura tu modalidad y consultorio en Perfil para agendar.</p>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={exception} onChange={e=>setException(e.target.checked)} disabled={busy}/>Autorizar fuera de mi horario habitual. Se comprobarán los cruces de horario.</label>
    <button className="nuth-button w-full justify-center" disabled={busy||!selected||!localTime||choice===''}>{busy?'Agendando…':'Agendar cita'}</button></>}
  </form>}{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
 </dialog>;
}
