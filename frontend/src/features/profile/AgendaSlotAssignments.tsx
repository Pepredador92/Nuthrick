import { useState } from 'react';
import { supabase } from '@/src/lib/supabase';
import type { ProfileWorkspace } from '@/src/types/domain';

export function AgendaSlotAssignments({workspace,onSaved}:{workspace:ProfileWorkspace;onSaved:(message:string)=>Promise<void>}) {
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const modes=workspace.profile.care_modalities;
  const choices=[...(modes.some(m=>m==='online'||m==='hybrid')?[{value:'online|',label:'En línea'}]:[]),
    ...(modes.some(m=>m==='in_person'||m==='hybrid')?workspace.locations.filter(l=>l.is_active).map(l=>({value:`in_person|${l.id}`,label:l.name})):[])];
  if(!workspace.slots.length)return null;
  const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  return <section className="rounded-2xl border border-[#dfe5e1] p-5"><h3 className="font-semibold">Dónde atiendes en cada horario</h3><p className="mt-2 text-sm text-[#74817d]">{choices.length===1?'Tu única modalidad se asigna automáticamente.':'Asigna una modalidad o consultorio a cada intervalo para habilitar sus reservas.'}</p><div className="mt-4 space-y-3">{workspace.slots.map(slot=>{const assignment=slot as typeof slot&{booking_modality?:string|null;booking_location_id?:string|null};return <label key={slot.id} className="grid items-center gap-2 text-sm sm:grid-cols-2"><span>{days[slot.weekday]} · {slot.start_time.slice(0,5)}–{slot.end_time.slice(0,5)}</span><select className="nuth-input min-w-0" disabled={busy} aria-label={`Modalidad de ${days[slot.weekday]} ${slot.start_time.slice(0,5)}`} value={assignment.booking_modality?`${assignment.booking_modality}|${assignment.booking_location_id||''}`:''} onChange={async e=>{const [modality,location]=e.target.value.split('|');setBusy(true);setError('');try{const {error}=await supabase.from('availability_slots').update({booking_modality:modality||null,booking_location_id:location||null}).eq('id',slot.id).select().single();if(error)throw error;await onSaved('Modalidad del horario guardada.');}catch{setError('No pudimos guardar la modalidad. Intenta de nuevo.');}finally{setBusy(false);}}}><option value="">{choices.length===1?`Automática · ${choices[0].label}`:'Sin asignar'}</option>{choices.map(c=><option value={c.value} key={c.value}>{c.label}</option>)}</select></label>;})}</div>{error&&<p role="alert" className="mt-3 text-sm text-[#963f34]">{error}</p>}</section>;
}
