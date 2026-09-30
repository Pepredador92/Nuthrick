import { agendaApi, type AgendaEntry } from './agenda';
export type Appointment = Pick<AgendaEntry,'id'|'starts_at'|'ends_at'|'timezone'|'modality'|'location_snapshot'|'status'|'patient_confirmed_at'|'professional_confirmed_at'|'patient_attendance_at'|'professional_attendance_at'|'requires_confirmation'> & {
 professional_name: string; contact_name?: string | null; contact_phone?: string | null; patient_id?: string | null;
};
export type AppointmentOptions = { timezone:string; duration:number; minimumNoticeMinutes:number; horizonDays:number; options:{modality:string;location_id:string|null;label:string}[] };
export type AppointmentAvailability = { day:string; today:string; lastDay:string; timezone:string; weekdays:number[]; slots:{start:string;end:string}[]; connectionError:boolean };
export const listAppointments = (patientId?:string) => agendaApi<{appointments:Appointment[]}>('appointment_list',patientId?{patientId}:{},true);
export const confirmAppointment = (id:string) => agendaApi<Appointment>('appointment_confirm_attendance',{id},true);
export const acceptReservation = (id:string,operationKey:string) => agendaApi('manage',{operationKey,payload:{action:'confirm_reservation',id}},true);
export const confirmationOpensAt = (appointment:Pick<Appointment,'starts_at'>) => Date.parse(appointment.starts_at)-48*60*60*1000;
export const canConfirmAttendance = (appointment:Pick<Appointment,'starts_at'|'status'|'requires_confirmation'>,now:number) => appointment.status==='confirmed'&&!appointment.requires_confirmation&&now>=confirmationOpensAt(appointment)&&now<Date.parse(appointment.starts_at);
export const patientAppointments = (session:string) => agendaApi<{appointments:Appointment[]}>('portal_appointments',{session});
export const patientConfirmAppointment = (session:string,id:string) => agendaApi<Appointment>('portal_confirm_appointment',{session,id});
export function whatsappAppointmentUrl(phone:string,url:string,requestConfirmation=false) {
 const digits=phone.replace(/\D/g,'');
 if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
 const message=requestConfirmation?'Tu cita en Nuthrick se acerca. Por favor, confirma tu asistencia desde este enlace:':'Tu cita en Nuthrick quedó agendada. Aquí puedes revisar la fecha y hora y añadirla a tu calendario. Te pediremos confirmar tu asistencia cuando se acerque la cita:';
 return `https://wa.me/${digits}?text=${encodeURIComponent(`${message} ${url}`)}`;
}
const calendarDate=(s:string)=>new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const calendarTitle=(a:Appointment)=>`Cita con ${a.professional_name}`;
const calendarPlace=(a:Appointment)=>a.modality==='online'?'En línea':a.location_snapshot?.address||a.location_snapshot?.name||'';
export function googleCalendarUrl(a:Appointment) {
 return `https://calendar.google.com/calendar/render?${new URLSearchParams({action:'TEMPLATE',text:calendarTitle(a),dates:`${calendarDate(a.starts_at)}/${calendarDate(a.ends_at)}`,location:calendarPlace(a),details:'Cita en Nuthrick.',ctz:a.timezone})}`;
}
export function appointmentIcs(a:Appointment) {
 const escape=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Nuthrick//Agenda//ES','BEGIN:VEVENT',`UID:${a.id}@nuthrick.com`,`DTSTAMP:${calendarDate(new Date().toISOString())}`,`DTSTART:${calendarDate(a.starts_at)}`,`DTEND:${calendarDate(a.ends_at)}`,`SUMMARY:${escape(calendarTitle(a))}`,`LOCATION:${escape(calendarPlace(a))}`,'END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
