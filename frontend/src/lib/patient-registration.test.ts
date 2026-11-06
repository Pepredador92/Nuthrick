import { expect, it } from 'vitest';
import { readPatientRegistration } from '../../../supabase/functions/_shared/patient-registration';
import { createPatientRegistrationDraft, patientRegistrationInput } from '../features/patients/PatientRegistrationFields';
const input={full_name:'Persona de prueba',timezone:'America/Mexico_City',portal_access_enabled:false};
it('preserves an international phone without adding the country prefix twice',()=>{
 const draft={...createPatientRegistrationDraft({name:input.full_name}),phone:'+52 55 1234 5678'};
 expect(patientRegistrationInput(draft).phone).toBe('+525512345678');
 expect(patientRegistrationInput({...draft,phone:'5512345678'}).phone).toBe('+525512345678');
});
it('accepts the optional chart fields without inferring missing patient data or trusting identity fields',()=>{
 expect(readPatientRegistration({...input,id:'forged',professional_id:'forged',status:'archived'})).toEqual({
  ...input,email:null,country_code:null,phone:null,weight_kg:null,height_cm:null,gender:null,equation_sex:null,birth_date:null,
 });
});
it.each([
 [{full_name:'A'},'invalid_contact_name'],
 [{email:'bad'},'invalid_patient_email'],
 [{phone:'+525512345678'},'invalid_patient_phone'],
 [{weight_kg:'60'},'invalid_patient_measurements'],
 [{height_cm:301},'invalid_patient_measurements'],
 [{birth_date:'2020-02-30'},'invalid_patient_birth'],
 [{birth_date:'2999-01-01'},'invalid_patient_birth'],
 [{portal_access_enabled:true},'patient_portal_requires_email'],
 [{portal_access_enabled:'true'},'invalid_patient_registration'],
 [{timezone:'not-a-zone'},'invalid_patient_timezone'],
 [{gender:'invented'},'invalid_patient_registration'],
])('rejects invalid registration before creating a chart: %j',(patch,code)=>{
 expect(()=>readPatientRegistration({...input,...patch})).toThrow(code);
});
