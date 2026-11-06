/** The editable patient fields accepted at registration, never ownership or IDs. */
export type PatientRegistrationInput = {
  full_name: string;
  email: string | null;
  country_code: string | null;
  phone: string | null;
  timezone: string;
  weight_kg: number | null;
  height_cm: number | null;
  gender: 'female' | 'male' | 'non_binary' | 'prefer_not_to_say' | 'other' | null;
  equation_sex: 'male' | 'female' | null;
  birth_date: string | null;
  portal_access_enabled: boolean;
};

export const patientRegistrationMessages: Record<string,string> = {
  invalid_patient_registration: 'Revisa los datos del paciente antes de guardar.',
  invalid_contact_name: 'Escribe el nombre completo del paciente (de 2 a 160 caracteres).',
  invalid_patient_email: 'Escribe un correo electrónico válido.',
  patient_portal_requires_email: 'Para activar el portal necesitas un correo.',
  invalid_patient_phone: 'Revisa el teléfono y su lada internacional.',
  invalid_patient_birth: 'Revisa la fecha de nacimiento. No puede estar en el futuro.',
  invalid_patient_measurements: 'Revisa el peso (0.1–1000 kg) y la estatura (20–300 cm).',
  invalid_patient_timezone: 'Selecciona una zona horaria válida.',
  patient_duplicate: 'Ya existe una ficha con ese correo, teléfono o nombre y fecha de nacimiento. Revisa Pacientes o elige «Paciente registrado».',
};

export function readPatientRegistration(value: unknown, today=new Date().toISOString().slice(0,10)): PatientRegistrationInput {
  if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error('invalid_patient_registration');
  const input=value as Record<string,unknown>;
  const optionalText=(key:string):string|null=>{
    if(input[key]==null || input[key]==='') return null;
    if(typeof input[key]!=='string') throw new Error('invalid_patient_registration');
    return input[key].trim() || null;
  };
  const full_name=optionalText('full_name')??'';
  if(full_name.length<2 || full_name.length>160 || /[\u0000-\u001f\u007f]/u.test(full_name)) throw new Error('invalid_contact_name');
  const email=optionalText('email');
  if(email && (email.length>320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(email))) throw new Error('invalid_patient_email');
  const phone=optionalText('phone'),country_code=optionalText('country_code');
  if(phone && (!/^\+[1-9]\d{7,14}$/u.test(phone) || !country_code || !/^\+[1-9]\d{0,2}$/u.test(country_code) || !phone.startsWith(country_code))) throw new Error('invalid_patient_phone');
  const timezone=optionalText('timezone')??'';
  try { if(!timezone.includes('/'))throw new Error();new Intl.DateTimeFormat('es-MX',{timeZone:timezone}); } catch { throw new Error('invalid_patient_timezone'); }
  const number=(key:string,min:number,max:number)=>{
    const n=input[key];if(n==null)return null;
    if(typeof n!=='number' || !Number.isFinite(n) || n<min || n>max)throw new Error('invalid_patient_measurements');
    return n;
  };
  const weight_kg=number('weight_kg',0.1,1000),height_cm=number('height_cm',20,300);
  const gender=optionalText('gender'),equation_sex=optionalText('equation_sex');
  if(gender && !['female','male','non_binary','prefer_not_to_say','other'].includes(gender))throw new Error('invalid_patient_registration');
  if(equation_sex && !['male','female'].includes(equation_sex))throw new Error('invalid_patient_registration');
  const birth_date=optionalText('birth_date');
  if(birth_date && (!/^\d{4}-\d{2}-\d{2}$/u.test(birth_date) || !Number.isFinite(Date.parse(birth_date+'T00:00:00Z')) || new Date(birth_date+'T00:00:00Z').toISOString().slice(0,10)!==birth_date || birth_date>today))throw new Error('invalid_patient_birth');
  if(typeof input.portal_access_enabled!=='boolean')throw new Error('invalid_patient_registration');
  if(input.portal_access_enabled && !email)throw new Error('patient_portal_requires_email');
  return {full_name,email,phone,country_code:phone?country_code:null,timezone,weight_kg,height_cm,
    gender:gender as PatientRegistrationInput['gender'],equation_sex:equation_sex as PatientRegistrationInput['equation_sex'],birth_date,portal_access_enabled:input.portal_access_enabled};
}
