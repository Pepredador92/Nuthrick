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
it('binds a new contact to the verified owner and preserves schedule and retry checks',async()=>{
 const call=vi.fn(async(action)=>action==='options'?{duration:30}:action==='replay_create'?null:{id}),busy=vi.fn(async()=>null);
 await appointmentRequest(new Request('https://example.invalid'),{op:'appointment_create',owner:'forged',contactName:'  Persona nueva  ',operationKey:id,start:'2099-10-01T16:00:00Z',modality:'online',contactEmail:'ignored@example.test'},{call,busy,owner:async()=>id,key:secretToken(),site:'https://nuthrick.com'});
 expect(call).toHaveBeenLastCalledWith('create',{owner:id,contactName:'Persona nueva',start:'2099-10-01T16:00:00.000Z',modality:'online',locationId:null,allowOutsideSchedule:false,operationKey:id,busyCheck:null});
 expect(busy).toHaveBeenCalledWith(id,'2099-10-01T16:00:00.000Z','2099-10-01T16:30:00.000Z');
});
it('whitelists patient registration and binds its atomic creation to the same trusted owner and retry receipt',async()=>{
 const call=vi.fn(async(action)=>action==='options'?{duration:30}:action==='replay_create'?null:{id,patient_id:id}),busy=vi.fn(async()=>null);
 await appointmentRequest(new Request('https://example.invalid'),{op:'appointment_create',owner:'forged',newPatient:{full_name:' Persona nueva ',timezone:'America/Mexico_City',portal_access_enabled:false,professional_id:'forged',id:'forged'},operationKey:id,start:'2099-10-01T16:00:00Z',modality:'online'},{call,busy,owner:async()=>id,key:secretToken(),site:'https://nuthrick.com'});
 expect(call).toHaveBeenLastCalledWith('create',expect.objectContaining({owner:id,newPatient:{full_name:'Persona nueva',timezone:'America/Mexico_City',portal_access_enabled:false,email:null,phone:null,country_code:null,weight_kg:null,height_cm:null,gender:null,equation_sex:null,birth_date:null},operationKey:id,allowOutsideSchedule:false}));
});
it.each([{patientId:id},{contactName:'Persona nueva'}])('does not accept a patient registration mixed with another appointment identity: %j',async extra=>{
 const call=vi.fn();
 await expect(appointmentRequest(new Request('https://example.invalid'),{op:'appointment_create',...extra,newPatient:{full_name:'Nueva persona',timezone:'America/Mexico_City',portal_access_enabled:false},operationKey:id,start:'2099-10-01T16:00:00Z',modality:'online'},{call,busy:vi.fn(),owner:async()=>id,key:secretToken(),site:'https://nuthrick.com'})).rejects.toThrow('invalid_input');
 expect(call).not.toHaveBeenCalled();
});
it.each([{}, {contactName:''}, {contactName:'A'}, {contactName:'A'.repeat(161)}, {contactName:'Nombre\ncontrol'}, {contactName:42}, {patientId:id,contactName:'Persona nueva'}])('rejects a missing, invalid or ambiguous patient before database writes: %j',async contact=>{
 const call=vi.fn(),busy=vi.fn();
 await expect(appointmentRequest(new Request('https://example.invalid'),{op:'appointment_create',...contact,operationKey:id,start:'2099-10-01T16:00:00Z',modality:'online'},{call,busy,owner:async()=>id,key:secretToken(),site:'https://nuthrick.com'})).rejects.toThrow(/invalid_(contact_name|input)/);
 expect(call).not.toHaveBeenCalled();expect(busy).not.toHaveBeenCalled();
});
it('hashes a patient token and whitelists the payload without accepting a forged owner',async()=>{
 const token=secretToken(),call=vi.fn(async()=>({id}));const deps={call,busy:vi.fn(),owner:vi.fn(),key:secretToken(),site:'https://nuthrick.com'};
 await appointmentRequest(new Request('https://example.invalid'),{op:'appointment_confirm',token,owner:id,id},deps);expect(call).toHaveBeenCalledWith('patient_confirm',{tokenHash:await sha256(token)});expect(deps.owner).not.toHaveBeenCalled();
 await expect(appointmentRequest(new Request('https://example.invalid'),{op:'appointment_confirm',token:'guess'},deps)).rejects.toThrow('invalid_token');
});
it('shares the patient-specific preview URL and keeps the invitation secret in the fragment',async()=>{
 const call=vi.fn(async(_action,data)=>({encryptedToken:data.encryptedToken,phone:null}));
 const deps={call,busy:vi.fn(),owner:async()=>id,key:secretToken(),site:'https://nuthrick.com'};
 const result=await appointmentRequest(new Request('https://example.invalid'),{op:'appointment_link',id},deps) as {url:string};
 const url=new URL(result.url);
 expect(url.pathname).toBe('/agenda/tu-cita');expect(url.search).toBe('');expect(url.hash).toMatch(/^#[A-Za-z0-9_-]{43}$/);
 expect(call).toHaveBeenCalledWith('link',expect.objectContaining({owner:id,id,tokenHash:await sha256(url.hash.slice(1))}));
});
