// @vitest-environment node
import { expect,it,vi } from 'vitest';
import { appointmentRequest } from '../../../supabase/functions/agenda/appointments';
import { secretToken, sha256 } from '../../../supabase/functions/agenda/security';
const id='10000000-0000-0000-0000-000000000001';
it('binds manual creation to the verified professional, validates UUIDs and checks availability',async()=>{
 const call=vi.fn(async(action)=>action==='options'?{duration:60}:action==='replay_create'?null:{id}),busy=vi.fn(async()=>null),owner=vi.fn(async()=>id);
 const body={op:'appointment_create',owner:'forged',patientId:id,operationKey:id,start:'2099-10-01T16:00:00Z',modality:'online'};
 await appointmentRequest(new Request('https://example.invalid'),body,{call,busy,owner,key:secretToken(),site:'https://nuthrick.com'});
 expect(busy).toHaveBeenCalledWith(id,'2099-10-01T16:00:00.000Z','2099-10-01T17:00:00.000Z');expect(call).toHaveBeenLastCalledWith('create',expect.objectContaining({owner:id,patientId:id,allowOutsideSchedule:false}));
});
it('recovers a committed operation before contacting Google again',async()=>{
 const call=vi.fn(async()=>({id})),busy=vi.fn();await appointmentRequest(new Request('https://example.invalid'),{op:'appointment_create',patientId:id,operationKey:id,start:'2099-10-01T16:00:00Z',modality:'online'},{call,busy,owner:async()=>id,key:secretToken(),site:'https://nuthrick.com'});expect(busy).not.toHaveBeenCalled();
});
it('hashes a patient token and whitelists the payload without accepting a forged owner',async()=>{
 const token=secretToken(),call=vi.fn(async()=>({id}));const deps={call,busy:vi.fn(),owner:vi.fn(),key:secretToken(),site:'https://nuthrick.com'};
 await appointmentRequest(new Request('https://example.invalid'),{op:'appointment_confirm',token,owner:id,id},deps);expect(call).toHaveBeenCalledWith('patient_confirm',{tokenHash:await sha256(token)});expect(deps.owner).not.toHaveBeenCalled();
 await expect(appointmentRequest(new Request('https://example.invalid'),{op:'appointment_confirm',token:'guess'},deps)).rejects.toThrow('invalid_token');
});
