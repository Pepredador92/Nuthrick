import { useRef, useState } from 'react';
import { agendaApi, agendaDate, agendaConfirmationLabel, agendaConfirmationState } from '@/src/services/agenda';
import { appointmentIcs, confirmAppointment, googleCalendarUrl, whatsappAppointmentUrl, type Appointment } from '@/src/services/appointments';
export function AppointmentStatus({appointment}:{appointment:Parameters<typeof agendaConfirmationState>[0]}) {
 const state=agendaConfirmationState(appointment);
 const color=state==='both'?'border-green-200 bg-green-50 text-green-900':state==='patient'?'border-amber-200 bg-amber-50 text-amber-900':'border-blue-200 bg-blue-50 text-blue-900';
 return <span aria-label={`Confirmación: ${agendaConfirmationLabel(state)}`} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${color}`}><span aria-hidden="true">{state==='both'?'🟢':state==='patient'?'🟡':'🔵'}</span>{agendaConfirmationLabel(state)}</span>;
}
export function AppointmentCalendar({appointment}:{appointment:Appointment}) {
 function download() {
  const url=URL.createObjectURL(new Blob([appointmentIcs(appointment)],{type:'text/calendar;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='cita-nuthrick.ics';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <div className="mt-3 flex flex-wrap gap-3 text-sm"><a className="underline" target="_blank" rel="noreferrer" href={googleCalendarUrl(appointment)}>Añadir a Google Calendar</a><button type="button" className="underline" onClick={download}>Apple / Outlook (.ics)</button></div>;
}
export function AppointmentActions({appointment,onChanged,confirmPatient}:{appointment:Appointment;onChanged:()=>void;confirmPatient?:()=>Promise<unknown>}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[link,setLink]=useState<{url:string;phone:string|null}|null>(null),[notice,setNotice]=useState('');
 const operation=useRef(crypto.randomUUID());
 const [now]=useState(()=>Date.now());
 async function run(task:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await task();}catch(e){setError(e instanceof Error?e.message:'Intenta de nuevo.');}finally{setBusy(false);}}
 if(appointment.status!=='confirmed'||Date.parse(appointment.starts_at)<=now)return null;
 const pending=confirmPatient?!appointment.patient_confirmed_at:!appointment.professional_confirmed_at;
 const whatsapp=link?.phone?whatsappAppointmentUrl(link.phone,link.url):null;
 return <div className="mt-3">
  <div className="flex flex-wrap gap-2">
   {pending&&<button type="button" className="nuth-button !text-sm" disabled={busy} onClick={()=>void run(async()=>{if(confirmPatient)await confirmPatient();else await confirmAppointment(appointment.id,operation.current);setNotice('Confirmación guardada.');onChanged();})}>{busy?'Guardando…':confirmPatient?'Confirmar mi asistencia':'Confirmar mi parte'}</button>}
   {!confirmPatient&&<button type="button" className="nuth-button-secondary !text-sm" disabled={busy} onClick={()=>void run(async()=>setLink(await agendaApi('appointment_link',{id:appointment.id},true)))}>Compartir confirmación</button>}
  </div>
  {link&&<div className="mt-3 rounded-xl bg-[#f0f6f1] p-3 text-sm"><p>El paciente confirma desde este enlace; vence al iniciar la cita.</p><div className="mt-2 flex flex-wrap gap-3">{whatsapp?<a className="font-semibold underline" target="_blank" rel="noreferrer" href={whatsapp}>WhatsApp · {link.phone}</a>:<p>Agrega su teléfono con lada en la ficha para abrir WhatsApp.</p>}<button type="button" className="underline" onClick={()=>void run(async()=>{await navigator.clipboard.writeText(link.url);setNotice('Enlace copiado.');})}>Copiar enlace</button></div></div>}
  {notice&&<p role="status" className="mt-2 text-sm">{notice}</p>}{error&&<p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
 </div>;
}
export function AppointmentCard({appointment,onChanged,confirmPatient}:{appointment:Appointment;onChanged:()=>void;confirmPatient?:()=>Promise<unknown>}) {
 return <article className="rounded-2xl border border-[#dfe7e1] bg-white p-4 text-[#173d36]">
  <AppointmentStatus appointment={appointment}/><h3 className="mt-3 font-semibold">{appointment.contact_name||`Cita con ${appointment.professional_name}`}</h3>
  <p className="mt-2 text-sm">{agendaDate(appointment.starts_at,appointment.timezone)}</p><p className="mt-1 text-xs text-[#63796d]">{(Date.parse(appointment.ends_at)-Date.parse(appointment.starts_at))/60000} min · {appointment.timezone} · {appointment.modality==='online'?'En línea':appointment.location_snapshot?.name}</p>
  <AppointmentActions appointment={appointment} onChanged={onChanged} confirmPatient={confirmPatient}/>
  {confirmPatient&&appointment.patient_confirmed_at&&<AppointmentCalendar appointment={appointment}/>}
 </article>;
}
