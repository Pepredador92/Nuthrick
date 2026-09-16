import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { dateInZone, type AgendaSlot } from '@/src/services/agenda';

const clock = (instant: string, timezone: string) => new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
}).format(new Date(instant));

// Calendar-date arithmetic, not a conversion of a local appointment to UTC.
function moveDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function AgendaDayPicker({ slots, timezone, from, min, max, selected, disabled, hasSchedule, onFrom, onSelect, onClear }: {
  slots: AgendaSlot[]; timezone: string; from: string; min: string; max: string;
  selected: AgendaSlot | null; disabled: boolean; hasSchedule: boolean;
  onFrom: (date: string) => void; onSelect: (slot: AgendaSlot) => void; onClear: () => void;
}) {
  const groups = slots.reduce<Record<string, AgendaSlot[]>>((out, slot) => {
    (out[dateInZone(slot.start, timezone)] ||= []).push(slot);
    return out;
  }, {});
  const days = Object.keys(groups).sort();
  const [chosenDay, setChosenDay] = useState(() => selected ? dateInZone(selected.start, timezone) : '');
  const day = days.includes(chosenDay) ? chosenDay : days[0];
  const hours = groups[day] || [];
  const changeFrom = (next: string) => {
    if (!next || next < min || next > max) return;
    onClear();
    onFrom(next);
  };
  return <div className="mt-5 min-w-0">
    <div className="flex items-end gap-2">
      <label className="min-w-0 flex-1 text-xs font-medium text-[#64786e]">
        Ver la semana a partir de
        <input type="date" value={from} min={min} max={max} disabled={disabled}
          onChange={e => changeFrom(e.target.value)}
          className="mt-2 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-[#dce4df] bg-white px-3 text-sm text-[#173d36]" />
      </label>
      <button type="button" aria-label="Semana anterior" disabled={disabled || from <= min}
        onClick={() => changeFrom(moveDate(from, -7) < min ? min : moveDate(from, -7))}
        className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#dce4df] disabled:opacity-30"><ChevronLeft size={17}/></button>
      <button type="button" aria-label="Semana siguiente" disabled={disabled || moveDate(from, 7) > max}
        onClick={() => changeFrom(moveDate(from, 7))}
        className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#dce4df] disabled:opacity-30"><ChevronRight size={17}/></button>
    </div>
    {days.length > 0 ? <>
      <div role="group" aria-label="Días disponibles" className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {days.map(date => {
          const instant = new Date(groups[date][0].start);
          return <button key={date} type="button" disabled={disabled} aria-pressed={day === date}
            aria-label={new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(instant)}
            onClick={() => { setChosenDay(date); if (date !== day) onClear(); }}
            className={`flex min-h-20 min-w-16 flex-1 shrink-0 flex-col items-center justify-center rounded-2xl border px-3 py-2 ${day === date ? 'border-[#356454] bg-[#eaf3ed] text-[#173d36] ring-1 ring-[#356454]' : 'border-[#dce4df] bg-white text-[#64786e] hover:bg-[#f6f8f5]'}`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider">{new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: timezone }).format(instant)}</span>
            <span className="mt-1 text-xl font-semibold tabular-nums">{new Intl.DateTimeFormat('es-MX', { day: 'numeric', timeZone: timezone }).format(instant)}</span>
            <span className="text-[10px]">{new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: timezone }).format(instant)}</span>
          </button>;
        })}
      </div>
      <p className="mt-4 text-xs font-semibold text-[#64786e]">Horarios disponibles</p>
      <div role="group" aria-label="Horarios disponibles" className="mt-3 grid max-h-44 grid-cols-3 gap-2 overflow-y-auto p-1">
        {hours.map(slot => <button key={slot.start} type="button" disabled={disabled}
          aria-pressed={selected?.start === slot.start} onClick={() => onSelect(slot)}
          className={`min-h-11 rounded-xl border px-2 py-3 text-sm tabular-nums ${selected?.start === slot.start ? 'border-[#173d36] bg-[#173d36] text-white' : 'border-[#dce4df] bg-white hover:bg-[#edf4ef]'}`}>
          <span className="block whitespace-nowrap">{clock(slot.start, timezone)}</span>
          {hours.some(other => other.start !== slot.start && clock(other.start, timezone) === clock(slot.start, timezone)) && <span className="mt-1 block text-[10px]">{new Intl.DateTimeFormat('es-MX', { timeZone: timezone, timeZoneName: 'shortOffset' }).formatToParts(new Date(slot.start)).find(part => part.type === 'timeZoneName')?.value}</span>}
        </button>)}
      </div>
    </> : <div className="mt-5 rounded-2xl bg-[#f6f8f5] p-4 text-sm text-[#64786e]">
      <CalendarDays size={20} className="mb-2"/>
      {hasSchedule ? 'Estos días no tienen horarios libres. Prueba otra fecha.' : 'Por el momento no hay horarios disponibles.'}
    </div>}
  </div>;
}
