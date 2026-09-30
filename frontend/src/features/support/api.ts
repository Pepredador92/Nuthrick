import { supabase } from '@/src/lib/supabase';
export const supportTopics = { agenda:'Agenda y citas',patients:'Pacientes y Super Link',diet:'Taller de dietas',billing:'Pagos y suscripción',account:'Acceso a mi cuenta',technical:'Problema técnico',other:'Otra duda' };
export const supportStatuses = { new:'Nueva',in_progress:'En atención',waiting:'Esperando al nutriólogo',resolved:'Resuelta' };
export type SupportStatus = keyof typeof supportStatuses;
export type SupportThread = { id:string; professional_id:string; topic:keyof typeof supportTopics; source:string; status:SupportStatus; revision:number; last_seq:number; professional_unread:number; admin_unread:number; preview:string; created_at:string; updated_at:string; first_response_at:string|null; resolved_at:string|null; professional_name?:string; email?:string };
export type SupportAttachment = {id:string;path:string;file_name:string};
export type SupportMessage = { seq:number; body:string; sender:'professional'|'admin'; created_at:string;attachment?:SupportAttachment|null };
export type SupportDetail = { thread:SupportThread; messages:SupportMessage[] };
export type SupportSettings = {starts_at:string;ends_at:string;timezone:string;revision:number};
export type SupportAnswer = {id:string;kind:'faq'|'macro';topic:keyof typeof supportTopics;title:string;body:string;active:boolean;position:number;revision:number};
export type SupportContent = {settings:SupportSettings;answers:SupportAnswer[]};
export async function supportContentRequest<T>(action:string,data:Record<string,unknown>={},admin=false):Promise<T>{
 const {data:result,error}=await supabase.rpc('support_content',{p_action:action,p_data:{...data,admin}});
 if(error)throw new Error(({stale_content:'Otra persona actualizó esta información. Recarga antes de guardar.',invalid_schedule:'Revisa las horas y la zona horaria.',invalid_answer:'Revisa el título, la respuesta y su orden.',answer_limit:'Se alcanzó el límite de 100 respuestas. Edita una existente.'} as Record<string,string>)[error.message]||'No pudimos cargar o guardar la ayuda. Intenta de nuevo.');
 return result as T;
}
const errors:Record<string,string>={ unauthorized:'Inicia sesión para contactar a soporte.',admin_required:'Sólo administración puede realizar esta acción.',not_found:'Esta conversación ya no está disponible.',conversation_resolved:'Administración resolvió este caso. Puedes iniciar una nueva consulta.',stale_revision:'Hay un mensaje o cambio nuevo. Revísalo antes de resolver el caso.',active_conversation_exists:'Este nutriólogo ya tiene otra conversación abierta. Atiéndela antes de reabrir este caso.',rate_limited:'Has enviado varios mensajes seguidos. Espera un momento para continuar.',invalid_message:'Escribe un mensaje de hasta 8,000 caracteres.',idempotency_conflict:'El mensaje cambió. Revisa el texto y vuelve a enviarlo.' };
export async function supportRequest<T>(action:string,data:Record<string,unknown>={},admin=false):Promise<T>{
 const {data:result,error}=await supabase.rpc('support_api',{p_action:action,p_data:{...data,admin}});
 if(error)throw new Error(errors[error.message]||({invalid_attachment:'Adjunta una imagen PNG, JPG o WebP de hasta 5 MB.',attachment_not_uploaded:'La captura no terminó de cargarse. Intenta enviarla de nuevo.',attachment_expired:'La carga venció. Quita la captura y adjúntala nuevamente.',attachment_rate_limited:'Alcanzaste el límite de capturas por hora. Puedes continuar escribiendo.'} as Record<string,string>)[error.message]||'No pudimos conectar con soporte. Tu mensaje permanece aquí para reintentar.');
 return result as T;
}
export const supportFiles=()=>supabase.storage.from('support-screenshots');
export function validateSupportFile(file:File){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<1||file.size>5242880)throw new Error('Adjunta una imagen PNG, JPG o WebP de hasta 5 MB.');
}
export function supportUploadAlreadyExists(error:{statusCode?:string|number;message?:string;error?:string}){
 const status=String(error.statusCode);
 return status==='409'||(status==='400'&&(/already exists/i.test(error.message??'')||error.error==='Duplicate'));
}
export async function cleanupPendingSupportFiles(admin=false){
 const pending=await supportRequest<{path:string}[]>('pending_assets',{},admin);
 if(pending.length)await supportFiles().remove(pending.map(p=>p.path));
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
