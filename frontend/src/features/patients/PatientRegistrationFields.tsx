import { Field, Input } from '@/src/components/ui/FormField';
import { normalizePhone } from './patientUtils';
import { patientRegistrationMessages, readPatientRegistration } from '../../../../supabase/functions/_shared/patient-registration';

const countries = [
  ["+52", "México (+52)"],
  ["+1", "Estados Unidos / Canadá (+1)"],
  ["+34", "España (+34)"],
  ["+57", "Colombia (+57)"],
  ["+54", "Argentina (+54)"],
] as const;
const timezones = [
  "America/Mexico_City",
  "America/Bogota",
  "America/Santiago",
  "Europe/Madrid",
  "America/New_York",
];

export type PatientRegistrationDraft = {
 name:string; email:string; country:string; phone:string; timezone:string;
 weight:string; height:string; gender:string; equationSex:string; birth:string; portal:boolean;
};
export function createPatientRegistrationDraft(contact?:{name?:string;email?:string;timezone?:string}):PatientRegistrationDraft {
 return {name:contact?.name??'',email:contact?.email??'',country:'+52',phone:'',timezone:contact?.timezone??'America/Mexico_City',weight:'',height:'',gender:'',equationSex:'',birth:'',portal:false};
}
export function patientRegistrationInput(draft:PatientRegistrationDraft) {
 const rawPhone=draft.phone.trim();
 const phone=rawPhone?(rawPhone.startsWith('+')?`+${rawPhone.replace(/\D/g,'')}`:normalizePhone(draft.country,rawPhone)):null;
 return readPatientRegistration({full_name:draft.name,email:draft.email,country_code:phone?draft.country:null,phone,timezone:draft.timezone,
  weight_kg:draft.weight?Number(draft.weight):null,height_cm:draft.height?Number(draft.height):null,
  gender:draft.gender||null,equation_sex:draft.equationSex||null,birth_date:draft.birth||null,portal_access_enabled:draft.portal});
}
export function patientRegistrationError(error:unknown) {
 return error instanceof Error ? patientRegistrationMessages[error.message]??error.message : 'No se pudo guardar el paciente.';
}
export function PatientRegistrationFields({draft,setDraft,disabled=false}:{draft:PatientRegistrationDraft;setDraft:(value:PatientRegistrationDraft)=>void;disabled?:boolean}) {
 return <fieldset disabled={disabled} className="contents">
          <div className="sm:col-span-2">
            <Field label="Nombre completo" name="patient-name">
              <Input
                id="patient-name"
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
                maxLength={160}
                minLength={2}
              />
            </Field>
          </div>
          <Field label="Correo electrónico (opcional)" name="patient-email">
            <Input
              id="patient-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="paciente@correo.com"
            />
          </Field>
          <Field label="Zona horaria" name="patient-timezone">
            <select
              id="patient-timezone"
              className="nuth-input"
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            >
              {timezones.map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </select>
          </Field>
          <Field label="Lada" name="patient-country">
            <select
              id="patient-country"
              className="nuth-input"
              value={draft.country}
              onChange={(e) => setDraft({ ...draft, country: e.target.value })}
            >
              {countries.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Teléfono (opcional)"
            name="patient-phone"
            hint="Se guarda en formato internacional E.164."
          >
            <Input
              id="patient-phone"
              type="tel"
              inputMode="numeric"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="5512345678"
            />
          </Field>
          <Field label="Peso inicial (kg)" name="patient-weight">
            <Input
              id="patient-weight"
              type="number"
              min="0.1"
              max="1000"
              step="0.01"
              value={draft.weight}
              onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
            />
          </Field>
          <Field label="Estatura (cm)" name="patient-height">
            <Input
              id="patient-height"
              type="number"
              min="20"
              max="300"
              step="0.01"
              value={draft.height}
              onChange={(e) => setDraft({ ...draft, height: e.target.value })}
            />
          </Field>
          <Field label="Género (opcional)" name="patient-gender">
            <select
              id="patient-gender"
              className="nuth-input"
              value={draft.gender}
              onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
            >
              <option value="">Prefiero no indicarlo</option>
              <option value="female">Mujer</option>
              <option value="male">Hombre</option>
              <option value="non_binary">No binario</option>
              <option value="other">Otro</option>
            </select>
          </Field>
          <Field
            label="Sexo requerido por ecuaciones (opcional)"
            name="patient-equation-sex"
          >
            <select
              id="patient-equation-sex"
              className="nuth-input"
              value={draft.equationSex}
              onChange={(e) =>
                setDraft({ ...draft, equationSex: e.target.value })
              }
            >
              <option value="">Sin registrar</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
          </Field>
          <Field label="Fecha de nacimiento" name="patient-birth">
            <Input
              id="patient-birth"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={draft.birth}
              onChange={(e) => setDraft({ ...draft, birth: e.target.value })}
            />
          </Field>
          <label className="flex items-start gap-3 rounded-2xl bg-[#f3f7f3] p-4 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.portal}
              onChange={(e) => setDraft({ ...draft, portal: e.target.checked })}
            />
            <span>
              <span className="block font-semibold">
                Permitir acceso al portal/app
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#75827d]">
                Podrás invitarle cuando el portal esté habilitado. Requiere
                correo.
              </span>
            </span>
          </label>
 </fieldset>;
}
