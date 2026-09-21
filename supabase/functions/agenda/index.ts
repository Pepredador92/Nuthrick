import { createClient } from '@supabase/supabase-js';
import { codeHash, decrypt, encrypt, gmailMessage, normalizeEmail, overlaps, parseInstant, readFreeBusy, secretToken, sha256 } from './security.ts';
import { checkCalendarConflict } from './calendar-reconciliation.ts';
import { portalRequest } from './portal.ts';
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const env = (name: string) => { const value=Deno.env.get(name); if (!value) throw new Error('configuration_required'); return value; };
const site = Deno.env.get('AGENDA_SITE_URL') || 'https://nuthrick.vercel.app';
const senderEmail = Deno.env.get('AGENDA_SENDER_EMAIL') || 'susy.asistencia.online@gmail.com';
const adminEmail = Deno.env.get('AGENDA_MAIL_ADMIN_EMAIL') || senderEmail;
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const callback = `${env('SUPABASE_URL')}/functions/v1/agenda/oauth/callback`;
const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'Access-Control-Allow-Origin':site, 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
type Json = Record<string, unknown>;
type Slot = { start: string; end: string; modality: string; locationId: string | null };
type CalendarConnection = { professional_id: string; encrypted_refresh_token: string; active: boolean; needs_reauthorization: boolean; busy_calendar_ids: string[]; write_calendar_id: string | null; revision: number };
type Credentials = { calendar: CalendarConnection | null; sender: { email: string; encrypted_refresh_token: string } | null };
const respond = (body: unknown,status=200) => new Response(JSON.stringify(body),{status,headers});
async function rpc<T>(name: string, args: Json): Promise<T> {
  const {data,error}=await db.rpc(name,args);
  if(error) throw new Error(error.code==='23P01'?'slot_taken':error.message);
  return data as T;
}
const server = <T>(action: string,data: Json={}) => rpc<T>('agenda_server',{p_action:action,p_data:data});
const credentials = (owner?: string) => server<Credentials>('credentials',{owner});
const key = () => env('AGENDA_ENCRYPTION_KEY');
function validUUID(value: unknown): string { if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new Error('invalid_id'); return value; }
async function limit(bucket: string,max: number,seconds: number) {
  if(!await rpc<boolean>('agenda_rate_limit',{p_bucket_hash:await sha256(bucket),p_max:max,p_seconds:seconds})) throw new Error('rate_limited');
}
async function ownerFromRequest(req: Request) {
  const token=req.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!token) throw new Error('unauthorized');
  const {data,error}=await db.auth.getUser(token);
  if(error||!data.user||!data.user.email_confirmed_at) throw new Error('unauthorized');
  return data.user;
}
async function googleToken(encryptedToken: string): Promise<string> {
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(12000),body:new URLSearchParams({
    client_id:env('AGENDA_GOOGLE_CLIENT_ID'),client_secret:env('AGENDA_GOOGLE_CLIENT_SECRET'),grant_type:'refresh_token',refresh_token:await decrypt(key(),encryptedToken),
  })});
  const data=await res.json();
  if(!res.ok||!data.access_token) throw new Error('google_unavailable');
  return data.access_token;
}
async function busy(owner: string,start: string,end: string): Promise<{ranges: {start:string;end:string}[];connection:CalendarConnection|null}> {
  const {calendar}=await credentials(owner);
  if(!calendar?.active) return {ranges:[],connection:null};
  if(calendar.needs_reauthorization||!calendar.busy_calendar_ids.length||!calendar.write_calendar_id) throw new Error('google_unavailable');
  const access=await googleToken(calendar.encrypted_refresh_token);
  const response=await fetch('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({timeMin:start,timeMax:end,items:calendar.busy_calendar_ids.map(id=>({id}))})});
  if(!response.ok) throw new Error('google_unavailable');
  return {ranges:readFreeBusy(await response.json(),calendar.busy_calendar_ids),connection:calendar};
}
async function busyPermit(owner: string,start: string,end: string): Promise<string|null> {
  const {ranges,connection}=await busy(owner,start,end);
  if(ranges.some(range=>overlaps(start,end,range))) throw new Error('slot_taken');
  if(!connection) return null;
  const checked=await server<{id:string}>('busy_clear',{owner,revision:connection.revision,start,end});
  return checked.id;
}
type Context = {professionalId:string;name:string;timezone:string;duration:number;horizonDays:number;minimumNoticeMinutes:number;slots:Slot[];error?:string;[key:string]:unknown};
async function context(slug: unknown,from: unknown,days=7): Promise<Context> {
  if(typeof slug!=='string'||slug.length>100||typeof from!=='string'||!/^\d{4}-\d\d-\d\d$/.test(from)) throw new Error('invalid_input');
  const data=await rpc<Context>('agenda_context',{p_slug:slug,p_from:from,p_days:days});
  if(data.error) throw new Error(data.error);
  return data;
}
function allowRecipient(email: string) {
  // Keep initial verification deliveries within the explicitly authorized
  // test address until the real integration has been validated.
  if(Deno.env.get('AGENDA_EMAIL_MODE')!=='production'&&email!==senderEmail) throw new Error('email_test_mode');
}
async function oauthStart(owner: string,purpose: string) {
  if(!['calendar','gmail'].includes(purpose)) throw new Error('invalid_action');
  const state=secretToken(),verifier=secretToken();
  await server('oauth_begin',{owner,purpose,stateHash:await sha256(state),encryptedVerifier:await encrypt(key(),verifier)});
  const scopes=purpose==='gmail'
    ? 'openid email https://www.googleapis.com/auth/gmail.send'
    : 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.events.freebusy';
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search=new URLSearchParams({client_id:env('AGENDA_GOOGLE_CLIENT_ID'),redirect_uri:callback,response_type:'code',scope:scopes,state,
    code_challenge:await sha256(verifier),code_challenge_method:'S256',access_type:'offline',prompt:'consent',...(purpose==='gmail'?{login_hint:senderEmail}:{})}).toString();
  return {url:url.toString()};
}
async function oauthCallback(url: URL) {
  const state=url.searchParams.get('state'),code=url.searchParams.get('code');
  if(!state||!code) throw new Error('authorization_cancelled');
  const saved=await server<{professional_id:string;purpose:string;encrypted_verifier:string;error?:string}>('oauth_consume',{stateHash:await sha256(state)});
  if(saved.error) throw new Error(saved.error);
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(12000),body:new URLSearchParams({
    client_id:env('AGENDA_GOOGLE_CLIENT_ID'),client_secret:env('AGENDA_GOOGLE_CLIENT_SECRET'),redirect_uri:callback,code,grant_type:'authorization_code',code_verifier:await decrypt(key(),saved.encrypted_verifier),
  })});
  const data=await res.json();
  if(!res.ok||!data.refresh_token) throw new Error('authorization_required');
  let email: string|undefined;
  const granted=new Set(String(data.scope||'').split(' '));
  const required=saved.purpose==='gmail'?['https://www.googleapis.com/auth/gmail.send']:['https://www.googleapis.com/auth/calendar.events','https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events.freebusy'];
  if(required.some(scope=>!granted.has(scope))) throw new Error('authorization_required');
  if(saved.purpose==='gmail') {
    const identity=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${data.access_token}`},signal:AbortSignal.timeout(12000)});
    const user=await identity.json();
    if(!identity.ok||!user.email_verified||normalizeEmail(user.email)!==senderEmail) throw new Error('wrong_sender');
    email=senderEmail;
  }
  await server('oauth_save',{owner:saved.professional_id,purpose:saved.purpose,email,encryptedToken:await encrypt(key(),data.refresh_token)});
  return new Response(null,{status:303,headers:{Location:`${site}/app/agenda?connected=${saved.purpose}`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
type Entry = {id:string;contact_email:string;contact_name:string;starts_at:string;ends_at:string;timezone:string;modality:string;location_snapshot?:{name:string;address:string};status:string;source?:string;requires_confirmation?:boolean;registration_consented_at?:string};
type Job = {id:string;professional_id:string;subject_id:string;kind:string;revision:number;attempts:number;payload:Record<string,string>;entry:Entry|null;request:(Entry&{revision:number;expires_at:string})|null;professional:{name:string;slug:string}};
function logistics(entry: Entry,professionalName: string) {
  const date=new Intl.DateTimeFormat('es-MX',{dateStyle:'full',timeStyle:'short',timeZone:entry.timezone}).format(new Date(entry.starts_at));
  return `${professionalName}\n${date}\nZona horaria: ${entry.timezone}\nDuración: ${(Date.parse(entry.ends_at)-Date.parse(entry.starts_at))/60000} minutos\n${entry.modality==='online'?'Consulta en línea':`${entry.location_snapshot?.name||'Consulta presencial'}${entry.location_snapshot?.address?' · '+entry.location_snapshot.address:''}`}`;
}
async function deliverCalendar(job: Job) {
  if(!job.entry) throw new Error('missing_entry');
  const {calendar}=await credentials(job.professional_id);
  if(!calendar) throw new Error('google_unavailable');
  const access=await googleToken(calendar.encrypted_refresh_token);
  const base=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(job.payload.calendarId)}/events`;
  const eventUrl=`${base}/${encodeURIComponent(job.payload.eventId)}`;
  const auth={Authorization:`Bearer ${access}`,'Content-Type':'application/json'};
  // On recovery, retrieve by deterministic ID before trying an insert. Never
  // modify another event even if its ID happens to collide.
  const existing=await fetch(eventUrl,{headers:auth,signal:AbortSignal.timeout(12000)});
  if(existing.ok) {
    const event=await existing.json();
    if(event.extendedProperties?.private?.nuthrickAppointment!==job.entry.id) throw new Error('calendar_id_collision');
    if(job.kind==='calendar_cancel'||job.entry.status==='cancelled') {
      const removed=await fetch(`${eventUrl}?sendUpdates=all`,{method:'DELETE',headers:auth,signal:AbortSignal.timeout(12000)});
      if(!removed.ok&&removed.status!==410) throw new Error('google_unavailable');
    }
    return job.payload.eventId;
  }
  if(existing.status!==404&&existing.status!==410) throw new Error('google_unavailable');
  if(job.kind==='calendar_cancel'||job.entry.status==='cancelled') return job.payload.eventId;
  if(existing.status===410) throw new Error('calendar_event_deleted');
  const response=await fetch(`${base}?sendUpdates=all`,{method:'POST',headers:auth,signal:AbortSignal.timeout(12000),body:JSON.stringify({
    id:job.payload.eventId,summary:`Cita con ${job.professional.name}`,
    description:'Cita reservada en Nuthrick. Sin información clínica.',
    location:job.entry.modality==='online'?'En línea':job.entry.location_snapshot?.address,
    start:{dateTime:job.entry.starts_at,timeZone:job.entry.timezone},end:{dateTime:job.entry.ends_at,timeZone:job.entry.timezone},
    attendees:[{email:job.entry.contact_email}],extendedProperties:{private:{nuthrickAppointment:job.entry.id}},
  })});
  if(!response.ok) throw new Error(response.status===409?'calendar_retry':'google_unavailable');
  return job.payload.eventId;
}
async function deliverMail(job: Job): Promise<string> {
  const {sender}=await credentials();
  if(!sender) throw new Error('mail_not_connected');
  const entry=job.entry||job.request;
  const to=job.kind==='verification'?job.payload.email:entry?.contact_email;
  if(!to) throw new Error('invalid_email');
  allowRecipient(to);
  let subject='Tu cita en Nuthrick',message='';
  if(job.kind==='verification') {
    // Expired verification codes are never delivered by a delayed worker.
    const {data}=await db.rpc('agenda_server',{p_action:'verification_status',p_data:{id:job.subject_id}});
    if(!data?.valid) throw new Error('verification_expired');
    subject='Verifica tu correo para agendar';
    message=`Tu código de verificación es: ${await decrypt(key(),job.payload.encryptedCode)}\nVence en 10 minutos. Si no solicitaste una cita, ignora este correo.`;
  } else if(entry) {
    const details=logistics(entry,job.professional.name);
    if(job.kind==='proposal') {
      if(job.request?.status!=='pending_requester'||job.request.revision!==job.revision) throw new Error('proposal_superseded');
      subject='Te proponen otro horario';
      message=`${details}\n\nEste horario no está reservado todavía. Revisa y responde antes de ${job.request.expires_at}:\n${site}/agenda/responder#${await decrypt(key(),job.payload.encryptedToken)}`;
    } else if(job.kind==='request') message=`Recibimos tu solicitud. Necesita confirmación del profesional; todavía no es una cita.\n\n${details}`;
    else if(job.kind==='rejection') message=`El profesional no pudo aceptar tu solicitud. Puedes elegir otro horario desde su perfil público.\n\n${details}`;
    else if(job.kind==='cancellation') message=`Tu cita fue cancelada.\n\n${details}`;
    else {
      if(entry.status!=='confirmed') throw new Error('appointment_cancelled');
      if (entry.source === 'public' && entry.registration_consented_at && !entry.requires_confirmation && job.revision === 1) throw new Error('reservation_superseded');
      if(entry.requires_confirmation) {
        subject='Tu reserva se registró correctamente';
        message=`Gracias por agendar tu cita. Tu nutriólogo se pondrá en contacto contigo para confirmar tu reserva.\n\n${details}`;
      } else { subject='Tu cita quedó agendada'; message=`Tu cita quedó agendada en Nuthrick.\n\n${details}`; }
    }
  }
  return sendPortalMail(to,subject,message,job.id);
}
async function sendPortalMail(to: string, subject: string, message: string, id: string): Promise<string> {
  allowRecipient(to);
  const {sender}=await credentials();
  if(!sender) throw new Error('mail_not_connected');
  const token=await googleToken(sender.encrypted_refresh_token);
  let res: Response;
  try { res=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({raw:gmailMessage(sender.email,to,subject,message,id)})}); }
  catch { throw new Error('mail_delivery_unknown'); }
  if(res.status>=500) throw new Error('mail_delivery_unknown');
  if(!res.ok) throw new Error('mail_send_failed');
  try { const body=await res.json(); if(!body.id) throw new Error(); return body.id; }
  catch { throw new Error('mail_delivery_unknown'); }
}
async function work(owner?: string,subject?: string,max=2) {
  const results: {kind:string;status:string}[]=[];
  for(let i=0;i<max;i++) {
    const job=await server<Job|null>('claim_job',{owner,subject});
    if(!job) break;
    try {
      const providerId=job.kind.startsWith('calendar_')?await deliverCalendar(job):await deliverMail(job);
      await server('complete_job',{id:job.id,attempt:job.attempts,status:'sent',providerId});
      results.push({kind:job.kind,status:'sent'});
    } catch(error) {
      const errorCode=error instanceof Error?error.message:'provider_error';
      const status=errorCode==='mail_delivery_unknown'?'unknown':job.kind.startsWith('calendar_')&&job.attempts<5?'pending':'failed';
      await server('complete_job',{id:job.id,attempt:job.attempts,status,errorCode});
      results.push({kind:job.kind,status});
    }
  }
  return results;
}

async function reconcileCalendar() {
  const job=await server<{entry:Entry&{professional_id:string;calendar_checked_at:string};target:{calendarId:string;eventId:string};revision:number}|null>('claim_calendar_check');
  if(!job) return;
  const result:Json={id:job.entry.id,checkedAt:job.entry.calendar_checked_at,revision:job.revision};
  try {
    const {calendar}=await credentials(job.entry.professional_id);
    if(!calendar?.active||calendar.needs_reauthorization) throw new Error('google_unavailable');
    result.conflict=await checkCalendarConflict({appointmentId:job.entry.id,eventId:job.target.eventId,calendarId:job.target.calendarId,
      busyCalendarIds:calendar.busy_calendar_ids,start:job.entry.starts_at,end:job.entry.ends_at},await googleToken(calendar.encrypted_refresh_token));
  } catch { result.error='google_unavailable'; }
  await server('complete_calendar_check',result);
}

Deno.serve(async req => {
  if(req.method==='OPTIONS') return new Response(null,{headers});
  try {
    const url=new URL(req.url);
    if(req.method==='GET'&&url.pathname.endsWith('/oauth/callback')) return await oauthCallback(url);
    if(req.method!=='POST') return respond({error:'method_not_allowed'},405);
    const origin=req.headers.get('origin');
    if(origin&&origin!==site) throw new Error('unauthorized');
    if(Number(req.headers.get('content-length')||0)>120000) throw new Error('invalid_input');
    const text=await req.text(); if(text.length>120000) throw new Error('invalid_input');
    const body=JSON.parse(text) as Json;
    const op=String(body.op||'');
    if(!op.startsWith('portal_')&&text.length>16000) throw new Error('invalid_input');
    if(op==='worker') {
      if(req.headers.get('authorization')!==`Bearer ${env('AGENDA_WORKER_SECRET')}`) throw new Error('unauthorized');
      await server('expire');
      const jobs=await work(undefined,undefined,2);
      await reconcileCalendar();
      return respond({jobs});
    }
    // Forwarded identity is only an abuse signal; proof/JWT checks authorize
    // mutations. Also limit each email globally to prevent multi-IP mail abuse.
    const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
    await limit(`agenda:ip:${ip}`,120,60);
    if(op.startsWith('portal_')) {
      try { return respond(await portalRequest(req,body,{rpc:args=>rpc('patient_portal',args),owner:async req=>(await ownerFromRequest(req)).id,limit,mail:sendPortalMail,key:key()})); }
      catch(error) {
        const code=error instanceof Error?error.message:'';
        const safe=['portal_unavailable','email_required','stale_revision','invalid_consultation','invalid_plan','identity_confirmation_required','invalid_input','invalid_code','invalid_action','unauthorized','rate_limited','note_limit','idempotency_mismatch','mail_not_connected','mail_send_failed','mail_delivery_unknown','email_test_mode'];
        return respond({error:safe.includes(code)?code:'temporarily_unavailable'},400);
      }
    }
    if(op==='availability') {
      const ctx=await context(body.slug,body.from);
      let connectionError=false;
      if(ctx.slots.length) try {
        const {ranges}=await busy(ctx.professionalId,ctx.slots[0].start,ctx.slots.at(-1)!.end);
        ctx.slots=ctx.slots.filter(s=>!ranges.some(r=>overlaps(s.start,s.end,r)));
      } catch { ctx.slots=[];connectionError=true; }
      const {professionalId:_,...publicData}=ctx;
      return respond({...publicData,connectionError});
    }
    if(op==='resolve_time') {
      const localTime=String(body.localTime||'');
      if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(localTime)) throw new Error('invalid_time');
      const ctx=await context(body.slug,localTime.slice(0,10),1);
      return respond(await server('resolve_local',{owner:ctx.professionalId,localTime}));
    }
    if(op==='send_code') {
      const email=normalizeEmail(body.email); allowRecipient(email);
      await limit(`agenda:email:${email}`,3,900);
      await limit(`agenda:all-mail`,60,3600);
      const ctx=await context(body.slug,new Date().toISOString().slice(0,10),1);
      if(!(await credentials()).sender) throw new Error('mail_not_connected');
      const id=crypto.randomUUID();
      // Rejection sampling avoids modulo bias in six-digit codes.
      let n: number; do { n=crypto.getRandomValues(new Uint32Array(1))[0]; } while(n>=4294000000);
      const code=String(n%1000000).padStart(6,'0');
      await server('create_verification',{owner:ctx.professionalId,id,email,codeHash:await codeHash(key(),id,code),encryptedCode:await encrypt(key(),code)});
      const jobs=await work(ctx.professionalId,id,1);
      return respond({id,delivery:jobs[0]?.status||'pending'});
    }
    if(op==='verify_code') {
      const id=validUUID(body.id),code=String(body.code||'');
      if(!/^\d{6}$/.test(code)) throw new Error('invalid_code');
      const proof=secretToken();
      const result=await rpc<{error?:string}>('agenda_check_code',{p_id:id,p_code_hash:await codeHash(key(),id,code),p_proof_hash:await sha256(proof)});
      if(result.error) throw new Error(result.error);
      return respond({proof});
    }
    if(op==='book') {
      const payload=body.payload as Json;
      if(!payload||!['appointment','request'].includes(String(payload.kind))) throw new Error('invalid_input');
      const operationKey=validUUID(body.operationKey),proof=String(body.proof||'');
      if(!/^[A-Za-z0-9_-]{43}$/.test(proof)) throw new Error('verification_required');
      // Recover committed operations before checking new availability (including
      // Google seeing the event created by our own previous attempt).
      const replay=await server<{result?:unknown;error?:string}>('replay',{slug:body.slug,key:operationKey,proof:await sha256(proof),payload});
      if(replay.error) throw new Error(replay.error);
      if(replay.result) return respond(replay.result);
      const start=parseInstant(payload.start),ctx=await context(body.slug,start.slice(0,10),1);
      const end=new Date(Date.parse(start)+ctx.duration*60000).toISOString();
      const permit=payload.kind==='appointment'?await busyPermit(ctx.professionalId,start,end):null;
      const result=await rpc<Json>('agenda_book_registered',{p_slug:body.slug,p_proof_hash:await sha256(proof),p_operation_key:operationKey,p_payload:payload,p_busy_check:permit});
      // Booking success never depends on the subsequent notification network call.
      EdgeRuntime.waitUntil(work(ctx.professionalId,String(result.id)).catch(()=>undefined));
      return respond(result);
    }
    if(op==='response_info'||op==='respond') {
      const hash=await sha256(String(body.token||''));
      const info=await server<{error?:string;result?:unknown;professionalId:string;start:string;end:string}>('response_info',{tokenHash:hash});
      if(info.error) throw new Error(info.error);
      if(op==='response_info') { const {professionalId:_,...safe}=info; return respond(safe); }
      const permit=body.decision==='accept'&&!info.result?await busyPermit(info.professionalId,info.start,info.end):null;
      const result=await rpc('agenda_respond',{p_token_hash:hash,p_decision:body.decision,p_busy_check:permit});
      if(info.professionalId) EdgeRuntime.waitUntil(work(info.professionalId).catch(()=>undefined));
      return respond(result);
    }
    const user=await ownerFromRequest(req);
    if(op==='resolve_time_private') {
      const localTime=String(body.localTime||'');
      if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(localTime)) throw new Error('invalid_time');
      // The trusted actor is the owner, even when their public page is disabled.
      return respond(await server('resolve_local',{owner:user.id,localTime}));
    }
    if(op==='connection') {
      const c=await credentials(user.id);
      return respond({calendarConnected:!!c.calendar,calendarActive:!!c.calendar?.active,busyCalendars:c.calendar?.busy_calendar_ids||[],writeCalendar:c.calendar?.write_calendar_id||'',mailConnected:!!c.sender,canConnectMail:user.email===adminEmail});
    }
    if(op==='oauth_start') {
      if(body.purpose==='gmail'&&user.email!==adminEmail) throw new Error('unauthorized');
      return respond(await oauthStart(user.id,String(body.purpose)));
    }
    if(op==='calendar_list'||op==='calendar_save') {
      const {calendar}=await credentials(user.id);
      if(!calendar) throw new Error('google_unavailable');
      const access=await googleToken(calendar.encrypted_refresh_token);
      const list: {id:string;summary:string;accessRole:string}[]=[];
      let pageToken='';
      do {
        const url=new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
        if(pageToken) url.searchParams.set('pageToken',pageToken);
        const res=await fetch(url,{headers:{Authorization:`Bearer ${access}`},signal:AbortSignal.timeout(12000)});
        if(!res.ok) throw new Error('google_unavailable');
        const data=await res.json(); list.push(...(data.items||[])); pageToken=data.nextPageToken||'';
      } while(pageToken&&list.length<500);
      if(op==='calendar_list') return respond({calendars:list.map(({id,summary,accessRole})=>({id,name:summary,writable:['writer','owner'].includes(accessRole)}))});
      const selected=body.busy as string[];
      if(!Array.isArray(selected)||selected.length>20||!selected.includes(String(body.write))||selected.some(id=>!list.some(c=>c.id===id))||!list.some(c=>c.id===body.write&&['writer','owner'].includes(c.accessRole))) throw new Error('invalid_calendars');
      await server('calendars',{owner:user.id,busy:selected,write:body.write}); return respond({saved:true});
    }
    if(op==='manage') {
      const payload={...body.payload as Json};
      const operationKey=validUUID(body.operationKey);
      const replay=await server<{result?:unknown;error?:string}>('replay_manage',{owner:user.id,key:operationKey,payload});
      if(replay.error) throw new Error(replay.error);
      if(replay.result) return respond(replay.result);
      let permit: string|null=null;
      if(payload.action==='confirm_reservation') {
        const {data:entry,error}=await db.from('agenda_entries').select('starts_at,ends_at').eq('id',validUUID(payload.id)).eq('professional_id',user.id).single();
        if(error||!entry) throw new Error('not_found');
        permit=await busyPermit(user.id,entry.starts_at,entry.ends_at);
      }
      if(['accept','propose'].includes(String(payload.action))) {
        const {data:request,error}=await db.from('agenda_requests').select('*').eq('id',validUUID(payload.id)).eq('professional_id',user.id).single();
        if(error||!request) throw new Error('not_found');
        const start=payload.action==='propose'?parseInstant(payload.start):request.starts_at;
        const {data:settings}=await db.from('availability_settings').select('default_duration_minutes').eq('professional_id',user.id).single();
        if(!settings) throw new Error('booking_unavailable');
        permit=await busyPermit(user.id,start,new Date(Date.parse(start)+settings.default_duration_minutes*60000).toISOString());
        if(payload.action==='propose') { const token=secretToken(); payload.tokenHash=await sha256(token);payload.encryptedToken=await encrypt(key(),token); }
      }
      const result=await rpc(payload.action==='confirm_reservation'?'agenda_confirm_reservation':'agenda_manage',{p_actor:user.id,p_operation_key:operationKey,p_payload:payload,p_busy_check:permit});
      EdgeRuntime.waitUntil(work(user.id).catch(()=>undefined)); return respond(result);
    }
    if(op==='retry_sync') { await server('retry_sync',{owner:user.id,id:validUUID(body.id)});return respond({jobs:await work(user.id,String(body.id))}); }
    throw new Error('invalid_action');
  } catch(error) {
    // Never log request bodies, OAuth codes, contact details, tokens or provider
    // responses. Return only a controlled vocabulary, not raw SQL/provider errors.
    const message=error instanceof Error?error.message:'';
    const known=['invalid_email','invalid_time','invalid_input','invalid_id','invalid_code','invalid_action','invalid_option','invalid_patient','invalid_calendars','invalid_request','invalid_transition','outside_schedule','not_found','slot_taken','google_unavailable','configuration_required','mail_not_connected','email_test_mode','rate_limited','unauthorized','profile_unavailable','booking_unavailable','verification_required','idempotency_mismatch','invalid_token','token_used','request_expired','authorization_required','authorization_cancelled','invalid_oauth_state','wrong_sender'];
    const code=[...known,'registration_required','invalid_birth_date','invalid_phone'].includes(message)?message:'temporarily_unavailable';
    return respond({error:code},code==='unauthorized'?401:code==='rate_limited'?429:code==='slot_taken'?409:400);
  }
});
