import { useEffect, useState } from 'react';
import { agendaApi, agendaConfirmationState, agendaDate } from '@/src/services/agenda';
import { canConfirmAttendance, confirmationOpensAt, type Appointment } from '@/src/services/appointments';
import { AppointmentCalendar, AppointmentStatus } from '@/src/components/agenda/AppointmentCard';
import { useAppointmentClock } from '@/src/components/agenda/useAppointmentClock';

export function AppointmentConfirmationPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useAppointmentClock();
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    let active = true;
    void agendaApi<Appointment>('appointment_info', { token }).then(a => { if (active) setAppointment(a); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [token]);
  async function confirm() {
    if (busy) return;
    setBusy(true); setError('');
    try { setAppointment(await agendaApi<Appointment>('appointment_confirm', { token })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Intenta de nuevo.'); }
    finally { setBusy(false); }
  }
  const state = appointment ? agendaConfirmationState(appointment) : 'none';
  const confirmed = state === 'patient' || state === 'both';
  return <main className="min-h-screen bg-[#f3f6f1] px-4 py-10 text-[#173d36]">
    <div className="mx-auto max-w-lg rounded-3xl border border-[#dfe7e1] bg-white p-6 sm:p-8">
      <p className="nuth-eyebrow">Nuthrick · Tu cita</p><h1 className="mt-3 text-2xl font-semibold">Tu próxima cita</h1>
      {appointment ? <>
        <p className="mt-5 text-lg">Con {appointment.professional_name}</p>
        <p className="mt-2">{agendaDate(appointment.starts_at, appointment.timezone)}</p>
        <p className="mt-2 text-sm">{appointment.timezone} · {appointment.modality === 'online' ? 'En línea' : appointment.location_snapshot?.name}</p>
        {appointment.location_snapshot?.address && <p className="mt-1 text-sm">{appointment.location_snapshot.address}</p>}
        <div className="mt-5"><AppointmentStatus appointment={appointment}/></div>
        {!appointment.requires_confirmation && <div className="mt-5 rounded-2xl bg-[#f0f6f1] p-4">
          <h2 className="font-semibold">Guarda la cita en tu calendario</h2>
          <p className="mt-2 text-sm">Añadir el evento te ayuda a recordarlo. La asistencia se confirma por separado, cuando se acerque la fecha.</p>
          <AppointmentCalendar appointment={appointment}/>
          <p className="mt-3 text-xs text-[#63796d]">Si ya recibiste la invitación de Google, úsala para evitar añadir el evento dos veces.</p>
        </div>}
        {confirmed ? <p role="status" className="mt-5 font-semibold">Tu asistencia está confirmada.</p>
          : canConfirmAttendance(appointment, now) ? <button className="nuth-button mt-6 w-full justify-center" disabled={busy} onClick={() => void confirm()}>{busy ? 'Confirmando…' : 'Confirmar mi asistencia'}</button>
          : <p className="mt-5 text-sm text-[#63796d]">{appointment.requires_confirmation ? 'Tu nutriólogo está revisando la reserva.' : now >= Date.parse(appointment.starts_at) ? 'La hora de esta cita ya pasó.' : 'Podrás confirmar tu asistencia desde ' + agendaDate(new Date(confirmationOpensAt(appointment)).toISOString(), appointment.timezone) + ', 48 horas antes de la cita.'}</p>}
        <p className="mt-5 text-sm text-[#63796d]">Si necesitas cambiar o cancelar el horario, contacta a tu nutriólogo.</p>
      </> : !error && <p role="status" className="mt-5">Cargando la cita…</p>}
      {error && <p role="alert" className="mt-5 text-red-700">{error}</p>}
    </div>
  </main>;
}
