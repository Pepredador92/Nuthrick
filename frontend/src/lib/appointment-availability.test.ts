// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { appointmentAvailability } from '../../../supabase/functions/agenda/appointment-availability';
const id='10000000-0000-0000-0000-000000000001';
const slots=[{start:'2099-10-01T16:00:00Z',end:'2099-10-01T17:00:00Z'},{start:'2099-10-01T17:00:00Z',end:'2099-10-01T18:00:00Z'}];
const data={day:'2099-10-01',today:'2099-10-01',lastDay:'2099-12-31',timezone:'America/Mexico_City',weekdays:[4],slots};
it('uses the verified owner and removes Google conflicts without removing adjacent slots',async()=>{
  const load=vi.fn(async()=>data),busy=vi.fn(async()=>({ranges:[slots[0]]}));
  const result=await appointmentAvailability(new Request('https://example.test'),{owner:'forged',modality:'online',day:'2099-10-01'},{owner:async()=>id,load,busy});
  expect(load).toHaveBeenCalledWith(id,'2099-10-01','online',null);
  expect(result.slots).toEqual([slots[1]]);
});
it('fails closed when Google is unavailable',async()=>{
  const result=await appointmentAvailability(new Request('https://example.test'),{modality:'online'},{owner:async()=>id,load:async()=>data,busy:async()=>{throw new Error('offline');}});
  expect(result.slots).toEqual([]);expect(result.connectionError).toBe(true);
});
