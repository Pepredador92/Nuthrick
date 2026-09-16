// Only loaded by the isolated visual preview config. No Supabase/Google calls.
import type { AgendaAvailability } from '../../src/services/agenda';
import type { PublicProfileContent } from '../../src/types/domain';

export const dateInZone = (instant: string, timezone: string) => new Intl.DateTimeFormat('en-CA', {
  year:'numeric',month:'2-digit',day:'2-digit',timeZone:timezone,
}).format(new Date(instant));
export const agendaDate = (instant: string, timezone: string) => new Intl.DateTimeFormat('es-MX', {
  dateStyle:'full',timeStyle:'short',timeZone:timezone,
}).format(new Date(instant));
export class AgendaError extends Error { constructor(public code: string) { super(code); } }

export async function getPublicProfile(): Promise<PublicProfileContent> {
  return {slug:'prueba',name:'Valeria Torres',professionalTitle:'Licenciada en Nutrición',licenseNumber:'0000000',
    biography:'Un plan que se adapta a ti.\n\nTe acompaño a construir hábitos que puedas disfrutar y mantener, con atención cercana y objetivos claros en cada consulta.',
    specialties:['Nutrición clínica','Educación alimentaria','Salud digestiva'],careModalities:['online','in_person'],
    spokenLanguages:['Español'],approximateFee:550,currency:'MXN',country:'México',conditions:['Salud metabólica'],
    populations:['Adultos'],contacts:[{type:'phone',countryCode:'+52',value:'4920000001'}],education:[{degree:'Licenciatura en Nutrición',institution:'Institución de ejemplo',graduationYear:2020}],
    business:{name:'Consultorio de nutrición',type:'Atención presencial'},locations:[{name:'Consultorio Centro',address:'Dirección de ejemplo, Zacatecas, México'}],
    links:[{type:'instagram',title:'Instagram',url:'https://instagram.com/example'},{type:'facebook',title:'Facebook',url:'https://facebook.com/example'},{type:'tiktok',title:'TikTok',url:'https://tiktok.com/@example'},{type:'youtube',title:'YouTube',url:'https://youtube.com/@example'},{type:'custom',title:'Mi sitio web',url:'https://example.com'}],gallery:[]};
}
export async function agendaApi<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  if(op==='availability') {
    const start = new Date(`${args.from || dateInZone(new Date().toISOString(),'America/Mexico_City')}T12:00:00Z`);
    const slots = [1,2,3,4,5].flatMap(day => {
      const date = new Date(start); date.setUTCDate(date.getUTCDate()+day);
      return ['online','in_person'].flatMap(modality => [15,16,17,18,19,20,21,22].map(hour => ({
        start:`${date.toISOString().slice(0,10)}T${hour}:00:00Z`, end:`${date.toISOString().slice(0,10)}T${hour}:30:00Z`,
        modality:modality as 'online'|'in_person',locationId:modality==='online'?null:'clinic',
      })));
    });
    return {name:'Valeria Torres',slug:'prueba',timezone:'America/Mexico_City',duration:30,horizonDays:60,
      minimumNoticeMinutes:120,hasSchedule:true,requestsEnabled:true,connectionError:false,
      locations:[{id:'clinic',name:'Consultorio Centro',address:'Dirección de ejemplo, Zacatecas, México'}],
      options:[{modality:'online',location_id:null},{modality:'in_person',location_id:'clinic'}],slots,
    } satisfies AgendaAvailability as T;
  }
  if(op==='send_code') return {id:'preview',delivery:'sent'} as T;
  if(op==='verify_code') return {proof:'preview-only'} as T;
  if(op==='book') return {id:'preview',status:'pending_confirmation',start:(args.payload as {start:string}).start} as T;
  throw new Error('Operación no disponible en esta vista previa sintética.');
}
