import { supabase } from '@/src/lib/supabase';
export const supportTopics = { agenda:'Agenda y citas',patients:'Pacientes y Super Link',diet:'Taller de dietas',billing:'Pagos y suscripción',account:'Acceso a mi cuenta',technical:'Problema técnico',other:'Otra duda' };
export const supportStatuses = { new:'Nueva',in_progress:'En atención',waiting:'Esperando al nutriólogo',resolved:'Resuelta' };
export type SupportStatus = keyof typeof supportStatuses;
export type SupportThread = { id:string; professional_id:string; topic:keyof typeof supportTopics; source:string; status:SupportStatus; revision:number; last_seq:number; professional_unread:number; admin_unread:number; preview:string; created_at:string; updated_at:string; first_response_at:string|null; resolved_at:string|null; professional_name?:string; email?:string };
export type SupportMessage = { seq:number; body:string; sender:'professional'|'admin'; created_at:string };
export type SupportDetail = { thread:SupportThread; messages:SupportMessage[] };
const errors:Record<string,string>={ unauthorized:'Inicia sesión para contactar a soporte.',admin_required:'Sólo administración puede realizar esta acción.',not_found:'Esta conversación ya no está disponible.',conversation_resolved:'Administración resolvió este caso. Puedes iniciar una nueva consulta.',stale_revision:'Hay un mensaje o cambio nuevo. Revísalo antes de resolver el caso.',active_conversation_exists:'Este nutriólogo ya tiene otra conversación abierta. Atiéndela antes de reabrir este caso.',rate_limited:'Has enviado varios mensajes seguidos. Espera un momento para continuar.',invalid_message:'Escribe un mensaje de hasta 8,000 caracteres.',idempotency_conflict:'El mensaje cambió. Revisa el texto y vuelve a enviarlo.' };
export async function supportRequest<T>(action:string,data:Record<string,unknown>={},admin=false):Promise<T>{
 const {data:result,error}=await supabase.rpc('support_api',{p_action:action,p_data:{...data,admin}});
 if(error)throw new Error(errors[error.message]||'No pudimos conectar con soporte. Tu mensaje permanece aquí para reintentar.');
 return result as T;
}
export function subscribeSupport(userId:string,admin:boolean,refresh:()=>void){
 const channel=supabase.channel(`support:${userId}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'support_threads',...(admin?{}:{filter:`professional_id=eq.${userId}`})},refresh).subscribe();
 return ()=>{void supabase.removeChannel(channel);};
}
export function supportSource(path:string){
 if(path.includes('/consultations/'))return 'Consulta';
 if(path.includes('/portal'))return 'Super Link';
 if(path.startsWith('/app/patients'))return 'Pacientes';
 if(path.startsWith('/app/agenda'))return 'Agenda';
 if(path.startsWith('/app/diet-workshop'))return 'Taller de dietas';
 if(path.startsWith('/app/my-plan'))return 'Mi plan';
 if(path.startsWith('/app/credits'))return 'Créditos IA';
 if(path.startsWith('/app/profile'))return 'Perfil';
 return 'Espacio profesional';
}
export const supportDate=(value:string)=>new Date(value).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'});
