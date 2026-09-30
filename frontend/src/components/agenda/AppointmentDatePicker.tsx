import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { agendaApi } from '@/src/services/agenda';
import type { AppointmentAvailability, AppointmentOptions } from '@/src/services/appointments';

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const dateLabel = (day: string, monthOnly = false) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric', ...(monthOnly ? {} : { day: 'numeric' as const }) });
function shiftMonth(day: string, amount: number) {
  const date = new Date(`${monthStart(day)}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return dateKey(date);
}

export function AppointmentDatePicker({ option, value, onChange, disabled }: {
  option: AppointmentOptions['options'][number]; value: string; onChange: (instant: string) => void; disabled?: boolean;
}) {
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [result, setResult] = useState<{ day: string | null; revision: number; data?: AppointmentAvailability; error?: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const latestSelection = useRef({ value, onChange });
  useEffect(() => { latestSelection.current = { value, onChange }; }, [value, onChange]);
  useEffect(() => {
    let active = true;
    void agendaApi<AppointmentAvailability>('appointment_availability', { day, modality: option.modality, locationId: option.location_id }, true)
      .then(data => {
        if (!active) return;
        setResult({ day, revision, data });
        if (latestSelection.current.value && !data.slots.some(slot => slot.start === latestSelection.current.value)) latestSelection.current.onChange('');
      }).catch(error => { if (active) setResult({ day, revision, error: error instanceof Error ? error.message : 'No pudimos cargar los horarios.' }); });
    return () => { active = false; };
  }, [day, revision, option.modality, option.location_id]);
  const data = result?.data;
  const current = result?.day === day && result?.revision === revision;
  const visibleMonth = month ?? (data ? monthStart(data.day) : null);
  const selectedDay = day ?? data?.day;
  const dates: (string | null)[] = [];
  if (visibleMonth) {
    const start = new Date(`${visibleMonth}T12:00:00Z`);
    for (let i = 0; i < (start.getUTCDay() + 6) % 7; i++) dates.push(null);
    for (let date = new Date(start); date.getUTCMonth() === start.getUTCMonth(); date.setUTCDate(date.getUTCDate() + 1)) dates.push(dateKey(date));
  }
  return <section aria-label="Fecha y hora disponibles" className="rounded-2xl border border-[#dbe5df] bg-[#f8faf8] p-3 sm:p-5">
    <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-semibold">Elige fecha y hora</h3><button type="button" disabled={disabled || !current} className="nuth-button-secondary" onClick={() => { onChange(''); setRevision(n => n + 1); }} aria-label="Actualizar horarios"><RefreshCw size={16}/></button></div>
    {!data && !current && <p role="status" className="text-sm">Cargando calendario…</p>}
    {data && visibleMonth && <div className="grid gap-5 sm:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" aria-label="Mes anterior" className="rounded-lg p-2 hover:bg-white disabled:opacity-30" disabled={disabled || visibleMonth <= monthStart(data.today)} onClick={() => setMonth(shiftMonth(visibleMonth, -1))}><ChevronLeft size={20}/></button>
          <p className="text-center font-semibold capitalize" aria-live="polite">{dateLabel(visibleMonth, true)}</p>
          <button type="button" aria-label="Mes siguiente" className="rounded-lg p-2 hover:bg-white disabled:opacity-30" disabled={disabled || shiftMonth(visibleMonth, 1) > monthStart(data.lastDay)} onClick={() => setMonth(shiftMonth(visibleMonth, 1))}><ChevronRight size={20}/></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(d => <span key={d} className="pb-2 text-xs text-[#63796d]">{d}</span>)}
          {dates.map((date, i) => {
            if (!date) return <span key={`blank-${i}`}/>;
            const available = data.weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay());
            const selected = date === selectedDay;
            return <button key={date} type="button" aria-label={`${dateLabel(date)}${available ? ', horario configurado' : ', sin horario'}`} aria-pressed={selected}
              disabled={disabled || date < data.today || date > data.lastDay || !available}
              className={`min-h-10 rounded-lg text-sm font-medium disabled:opacity-30 sm:min-h-11 ${selected ? 'bg-[#173d36] text-white' : available ? 'bg-[#e2eee7] text-[#173d36] hover:bg-[#cadfd1]' : 'text-[#63796d]'}`}
              onClick={() => { onChange(''); setDay(date); }}>{Number(date.slice(8))}</button>;
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[#63796d]"><span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-[#a9ceba]"/>Días con horario configurado. Elige uno para consultar las horas libres.</p>
      </div>
      <div className="min-w-0 border-t border-[#dbe5df] pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        <h4 className="font-semibold">{selectedDay && dateLabel(selectedDay)}</h4><p className="mb-3 text-xs text-[#63796d]">Hora de {data.timezone}</p>
        {!current ? <p role="status" className="text-sm">Consultando horarios libres…</p> : data.connectionError ? <p role="alert" className="text-sm text-amber-800">No pudimos comprobar Google Calendar. Actualiza los horarios para reintentar.</p> : !data.slots.length ? <p role="status" className="text-sm text-[#63796d]">No hay horarios libres este día. Elige otra fecha.</p> : <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto p-1">
          {data.slots.map(slot => <button key={slot.start} type="button" disabled={disabled} aria-pressed={value === slot.start}
            className={`min-h-11 rounded-xl border px-2 py-2 text-sm ${value === slot.start ? 'border-[#173d36] bg-[#173d36] text-white' : 'border-[#dbe5df] bg-white hover:border-[#6c9c86]'}`}
            onClick={() => onChange(slot.start)}>{new Date(slot.start).toLocaleTimeString('es-MX', { timeZone: data.timezone, hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' })}</button>)}
        </div>}
      </div>
    </div>}
    {current && result?.error && <p role="alert" className="mt-2 text-sm text-red-700">{result.error} Usa «Actualizar horarios» para reintentar.</p>}
  </section>;
}
