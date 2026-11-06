import { useEffect, useRef, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { agendaApi } from '@/src/services/agenda';
import type { Appointment, AppointmentOptions } from '@/src/services/appointments';
import { AppointmentCard } from './AppointmentCard';
import { PatientCombobox, type PatientOption } from './PatientCombobox';
import { AppointmentDatePicker } from './AppointmentDatePicker';
export function ScheduleAppointmentButton({patient,onSaved,className='nuth-button'}:{patient?:PatientOption;onSaved?:()=>void;className?:string}) {
 const [open,setOpen]=useState(false);
 return <><button type="button" className={className} onClick={()=>setOpen(true)}><CalendarPlus size={17} aria-hidden="true"/>Agendar cita</button>{open&&<ScheduleDialog patient={patient} close={()=>setOpen(false)} onSaved={onSaved}/>}</>;
}
function ScheduleDialog({patient,close,onSaved}:{patient?:PatientOption;close:()=>void;onSaved?:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),operation=useRef({fingerprint:'',key:''});
 const [options,setOptions]=useState<AppointmentOptions|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[created,setCreated]=useState<Appointment|null>(null);
 const [selected,setSelected]=useState<PatientOption|null>(patient??null),[localTime,setLocalTime]=useState(''),[choice,setChoice]=useState(''),[exception,setException]=useState(false);
 const [patientMode,setPatientMode]=useState<'registered'|'new'>('registered'),[newName,setNewName]=useState('');
 const [selectedStart,setSelectedStart]=useState('');
 const isNew = !patient && patientMode === 'new';
 const validName = newName.trim().length >= 2 && newName.trim().length <= 160 && !/[\u0000-\u001f\u007f]/u.test(newName.trim());
 const hasPatient = isNew ? validName : !!selected;
 const ready = !!options && choice !== '' && hasPatient && !!(exception ? localTime : selectedStart);
 const pending = !hasPatient ? (isNew ? 'Escribe el nombre del paciente nuevo (de 2 a 160 caracteres).' : 'Selecciona una ficha de la lista o elige «Paciente nuevo».') : choice === '' ? 'Selecciona la modalidad y el consultorio.' : !(exception ? localTime : selectedStart) ? 'Selecciona la fecha y una hora disponible para agendar.' : '';
 useEffect(()=>{const el=dialog.current!;const previous=document.activeElement as HTMLElement|null;el.showModal();return()=>{el.close();previous?.focus();};},[]);
 useEffect(()=>{let active=true;void agendaApi<AppointmentOptions>('appointment_options',{},true).then(data=>{if(active){setOptions(data);if(data.options.length===1)setChoice('0');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 async function save(event:React.FormEvent){event.preventDefault();if(busy||!options||!ready)return;setBusy(true);setError('');try{
  const resolved=exception?await agendaApi<{instants:string[]}>('resolve_time_private',{localTime},true):{instants:selectedStart?[selectedStart]:[]};
  if(resolved.instants.length!==1)throw new Error('La hora no existe o es ambigua en esta zona horaria. Elige otra.');
  const chosen=options.options[Number(choice)];const contact=isNew?{contactName:newName.trim()}:{patientId:selected!.id};const payload={...contact,start:resolved.instants[0],modality:chosen.modality,locationId:chosen.location_id,allowOutsideSchedule:exception};
  const fingerprint=JSON.stringify(payload);if(operation.current.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()};
  const result=await agendaApi<Appointment>('appointment_create',{...payload,operationKey:operation.current.key},true);
  setCreated({...result,contact_name:isNew?newName.trim():selected!.full_name});onSaved?.();
 }catch(e){setError(e instanceof Error?e.message:'No pudimos agendar la cita.');}finally{setBusy(false);}}
 return <dialog ref={dialog} aria-label="Agendar cita" aria-modal="true" className={`m-auto max-h-[90dvh] ${created?'w-[min(560px,calc(100vw-24px))]':'w-[min(820px,calc(100vw-24px))]'} overflow-y-auto rounded-3xl border-0 bg-white p-5 text-[#173d36] backdrop:bg-[#102d27]/50 sm:p-7`} onCancel={e=>{e.preventDefault();if(!busy)close();}}>
  <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{created?'Cita agendada':'Agendar cita'}</h2><button type="button" disabled={busy} className="nuth-button-secondary" onClick={close}>Cerrar</button></div>
  {created?<div className="mt-5"><p role="status" className="mb-4 text-sm">El horario quedó reservado. {isNew?'Puedes crear o vincular su ficha después desde «Vincular paciente» en esta cita. ':''}Comparte la invitación para que el paciente la añada a su calendario. El recordatorio de asistencia aparecerá 48 horas antes.</p><AppointmentCard appointment={created} onChanged={updated=>{if(updated)setCreated({...created,...updated});onSaved?.();}}/></div>:<form onSubmit={save} className="mt-5 space-y-4">
   {patient?<p className="rounded-xl bg-[#f2f6f2] p-3 font-semibold">{patient.full_name}</p>:<>
    <fieldset disabled={busy}><legend className="text-sm font-semibold">¿A quién vas a agendar?</legend><div className="mt-2 flex flex-wrap gap-3">
     <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${!isNew?'border-[#173d36] bg-[#edf4ef]':'border-[#dbe5df]'}`}><input type="radio" name="patient-mode" value="registered" checked={!isNew} onChange={()=>setPatientMode('registered')}/>Paciente registrado</label>
     <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${isNew?'border-[#173d36] bg-[#edf4ef]':'border-[#dbe5df]'}`}><input type="radio" name="patient-mode" value="new" checked={isNew} onChange={()=>setPatientMode('new')}/>Paciente nuevo</label>
    </div></fieldset>
    {isNew?<label className="block text-sm font-semibold">Nombre del paciente nuevo<input aria-label="Nombre del paciente nuevo" aria-describedby="new-patient-help" className="nuth-input mt-2" value={newName} onChange={e=>setNewName(e.target.value)} minLength={2} maxLength={160} required disabled={busy} autoComplete="off"/><span id="new-patient-help" className="mt-2 block text-xs font-normal leading-relaxed text-[#63796d]">Puedes reservar su primera cita antes de crear su ficha. Después podrás registrarlo y vincularlo desde la agenda.</span></label>:<PatientCombobox value={selected} onChange={setSelected} disabled={busy} onSearchChange={setNewName} onNewPatient={name=>{setNewName(name);setPatientMode('new');}}/>}
   </>}
   {!options?<p role="status">Cargando disponibilidad…</p>:<><p className="text-sm text-[#63796d]">Duración: {options.duration} min · Zona: {options.timezone}. Anticipación mínima: {options.minimumNoticeMinutes} min.</p>
    <label className="block text-sm font-semibold">Modalidad y consultorio<select className="nuth-input mt-2" value={choice} onChange={e=>{setChoice(e.target.value);setSelectedStart('');setLocalTime('');}} required disabled={busy}><option value="">Selecciona una opción</option>{options.options.map((o,i)=><option key={i} value={i}>{o.label}</option>)}</select></label>
    {choice!==''&&!exception&&<AppointmentDatePicker key={choice} option={options.options[Number(choice)]} value={selectedStart} onChange={setSelectedStart} disabled={busy}/>}
    {!options.options.length&&<p role="alert">Configura tu modalidad y consultorio en Perfil para agendar.</p>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={exception} onChange={e=>{setException(e.target.checked);setSelectedStart('');setLocalTime('');}} disabled={busy}/><span>Autorizar fuera de mi horario habitual (opcional)<small className="mt-1 block leading-relaxed text-[#63796d]">Úsalo solo para una hora fuera de tu horario configurado. Siempre se comprobarán los cruces de horario.</small></span></label>
    {exception&&<label className="block text-sm font-semibold">Fecha y hora fuera del horario habitual<input type="datetime-local" className="nuth-input mt-2" value={localTime} onChange={e=>setLocalTime(e.target.value)} required disabled={busy}/></label>}
    {pending&&<p id="schedule-pending" role="status" className="text-sm leading-relaxed text-[#63796d]">{pending}</p>}
    <button className="nuth-button w-full justify-center" aria-describedby={pending?'schedule-pending':undefined} disabled={busy||!ready}>{busy?'Agendando…':'Agendar cita'}</button></>}
  </form>}{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
 </dialog>;
}
