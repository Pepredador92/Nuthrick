-- LIVE-1B: reviewed drafts and real email infrastructure, disabled by default.
-- No approval, effective date, Live Stripe secret, charge or OpenAI activation.
begin;

alter table private.support_settings add column privacy_email text;
alter table private.support_settings add column contacts_verified_at timestamptz;
alter table private.support_settings add column contacts_verified_by uuid references auth.users(id);
alter table private.support_settings alter column support_email set default '';
update private.support_settings set support_email='',enabled=false;
create index support_settings_verified_by on private.support_settings(contacts_verified_by);

create table public.operational_contact_public (
 id boolean primary key default true check(id), support_email text, privacy_email text
);
alter table public.operational_contact_public enable row level security;
create policy contact_public_read on public.operational_contact_public for select to anon,authenticated using(true);
revoke all on public.operational_contact_public from public,anon,authenticated,service_role;
grant select on public.operational_contact_public to anon,authenticated;
insert into public.operational_contact_public(id) values(true);
create function private.sync_operational_contact() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.operational_contact_public set support_email=case when new.contacts_verified_at is not null then new.support_email end,privacy_email=case when new.contacts_verified_at is not null then new.privacy_email end where id;
 return new;
end $$;
revoke all on function private.sync_operational_contact() from public,anon,authenticated,service_role;
create trigger operational_contact_public_sync after update on private.support_settings for each row execute function private.sync_operational_contact();

alter table private.legal_documents add column body text not null default '' check(length(body)<=60000);
alter table private.legal_documents add column revision integer not null default 1;
alter table private.legal_documents add column approved_by uuid references auth.users(id);
alter table private.legal_documents add column approved_at timestamptz;
alter table private.legal_documents add column published_at timestamptz;
alter table private.legal_documents add column requires_acceptance boolean not null default false;
create index legal_documents_approved_by on private.legal_documents(approved_by);
create table private.legal_document_versions (
 document_key text not null references private.legal_documents(key),version integer not null,
 title text not null,body text not null,review_status text not null check(review_status in ('draft','pending_review','approved')),
 revision integer not null,effective_at timestamptz,published_at timestamptz,approved_at timestamptz,
 approved_by uuid references auth.users(id),requires_acceptance boolean not null,
 content_hash text not null,updated_at timestamptz not null,primary key(document_key,version)
);
create index legal_document_versions_approved_by on private.legal_document_versions(approved_by);
alter table private.legal_document_versions enable row level security;
create policy legal_versions_private on private.legal_document_versions for all to anon,authenticated using(false) with check(false);
revoke all on private.legal_document_versions from public,anon,authenticated,service_role;

-- Existing v1 has no accepted content. Fail rather than replace accepted history.
do $$ begin
 if exists(select 1 from private.legal_acceptances) or exists(select 1 from private.legal_documents where review_status='approved') then raise exception 'legal_history_requires_review';end if;
end $$;

update private.legal_documents set body=$draft$# Términos de uso de Nuthrick

## Servicio y partes
Nuthrick es un servicio de software para profesionales de nutrición. Ofrece herramientas para gestionar su cuenta, pacientes, consultas, registros y planes nutricionales, así como funciones de Agenda, Superlink y mensajería cuando estén disponibles en su cuenta. No es un servicio de urgencias ni presta por sí mismo atención clínica.
[PENDIENTE: IDENTIDAD_Y_DOMICILIO_DEL_PRESTADOR]

## Cuenta y uso profesional
Cada persona debe proporcionar información veraz, proteger sus credenciales y utilizar únicamente información que esté autorizada a tratar. El profesional decide a quién invita o qué información comparte mediante las funciones disponibles. Debe revisar sus configuraciones de acceso y mantener actualizados sus datos de contacto. No se permite acceder a cuentas o expedientes ajenos sin autorización ni usar el servicio para enviar contenido ilícito o abusivo.
[PENDIENTE: EDAD_MINIMA_Y_REPRESENTACION_DE_MENORES]

## Planes, Beta y accesos especiales
Los planes comerciales se denominan Esencial y Profesional. Sus límites, beneficios y precios vigentes se muestran en Nuthrick antes de contratar. Beta tiene la duración y condiciones de la invitación o código aplicado y no exige tarjeta mientras siga vigente. Founder y Full Access son concesiones especiales administradas por Nuthrick; no son promesas generales de acceso perpetuo ni se adquieren automáticamente con una promoción. Los permisos administrativos son distintos de los beneficios de un plan.

## Suscripciones y pagos
La infraestructura contempla suscripciones mensuales o anuales, renovaciones, comprobantes y gestión de pagos mediante Stripe. Actualmente Stripe funciona en TEST: una prueba no es un cargo real ni una suscripción comercial cobrada. La habilitación de pagos reales se comunicará en el flujo de contratación. Antes de una contratación se mostrarán plan, intervalo, moneda, importe y promoción aplicable. Una suscripción recurrente autorizada se renueva según el intervalo contratado mientras no se cancele conforme a las condiciones aplicables.
[PENDIENTE: POLITICA_FISCAL_Y_COMPROBANTES]

## Cancelación, falta de pago y acceso
La cancelación ordinaria está preparada para aplicarse al terminar el período pagado; solicitarla no significa obtener automáticamente un reembolso. Las fechas y el estado se consultan en Mi plan. Ante una renovación fallida puede existir un período de gracia configurado, seguido de suspensión de acciones que requieren acceso activo. La confirmación del pago puede recuperar el acceso. Los accesos Beta o internos protegidos no se convierten automáticamente en suscripciones pagadas.
La suspensión no equivale al cierre de cuenta ni a la eliminación automática de información. El alcance de conservación y acceso posterior debe revisarse junto con el Aviso de privacidad.
[PENDIENTE: CONDICIONES_DE_SUSPENSION_Y_CIERRE]

## Promociones y créditos
Las promociones pueden limitarse por profesional, plan, intervalo, vigencia o número de usos. Se aplican solo cuando se cumplen las condiciones mostradas; al finalizar un beneficio de precio rige el precio normal contratado según lo informado. Las plantillas TEST no constituyen ofertas Live.
Las funciones de IA pueden estar sujetas a plan, disponibilidad y créditos. Los créditos incluidos se asignan por mes, también en planes anuales, según la configuración aplicable. Los créditos comprados se registran por separado. Las recargas actuales y sus precios son TEST y provisionales; no se ofrece su compra Live en esta fase. Los ajustes por reembolso se registran en el historial y se describen en la política correspondiente.

## Asistencia de IA y responsabilidad profesional
Las funciones reales de OpenAI permanecen deshabilitadas. Si se habilitan funciones de IA, su disponibilidad dependerá del plan y configuración y podrá cambiar. La IA es una asistencia: los resultados pueden contener errores y deben revisarse antes de utilizarse. No reemplaza el juicio clínico ni la evaluación del paciente. El profesional conserva la responsabilidad sobre sus decisiones clínicas y sobre la información que incorpora o comunica. Esta cláusula no elimina obligaciones que correspondan legalmente a Nuthrick.
[PENDIENTE: ALCANCE_DE_RESPONSABILIDAD_Y_DISPONIBILIDAD]

## Información, proveedores y disponibilidad
El profesional debe contar con la autorización y fundamentos necesarios para tratar información de sus pacientes. El Aviso de privacidad diferencia esa información de los datos de la cuenta profesional. Nuthrick utiliza Supabase para autenticación, base de datos y almacenamiento; Vercel para alojar la aplicación; Stripe para la infraestructura de facturación; y Google Calendar/Gmail para las funciones de Agenda conectadas. El proveedor de correo comercial se identificará antes de su activación. OpenAI solo intervendrá si se habilita expresamente su uso.
El servicio puede requerir mantenimiento y depender de terceros. No se ofrece en este borrador una garantía de disponibilidad continua ni un nivel de servicio no acordado. El cierre, las solicitudes sobre información y los incidentes se atienden por los contactos publicados.

## Contacto y cambios
Soporte: {{support_email}}. Privacidad: {{privacy_email}}. Cada versión publicada conserva su fecha efectiva e historial. Una nueva versión puede requerir una aceptación nueva, sin alterar las aceptaciones anteriores.
[PENDIENTE: LEY_APLICABLE_JURISDICCION_Y_RESOLUCION_DE_CONTROVERSIAS]
$draft$,review_status='pending_review',effective_at=null,updated_at=now() where key='terms';

update private.legal_documents set body=$draft$# Aviso de privacidad de Nuthrick

## Identidad y contacto
Este aviso describe el tratamiento de información en Nuthrick, una aplicación para profesionales de nutrición. La identidad y domicilio de la persona física o moral responsable deben completarse antes de aprobarlo.
[PENDIENTE: IDENTIDAD_Y_DOMICILIO_DEL_RESPONSABLE]
Contacto de privacidad: {{privacy_email}}. Soporte: {{support_email}}.

## Datos de la persona profesional
La cuenta puede incluir nombre, correo, datos de perfil profesional y contacto, identidad de acceso, preferencias, imagen o marca y configuración de servicios conectados. La operación comercial mantiene plan, suscripción, promociones, movimientos de créditos, referencias de pago y comprobantes. También se registran eventos de acceso, aceptación de documentos y operaciones necesarias para seguridad y soporte.
Nuthrick no solicita almacenar el número completo de tarjeta ni su código de seguridad. Los formularios de pago y gestión de medios de pago se alojan en Stripe cuando se utilizan; Nuthrick conserva referencias y estados comerciales recibidos del proveedor.

## Información de pacientes
El profesional puede registrar datos de identificación y contacto de sus pacientes, antecedentes e información relacionada con salud, consultas, mediciones, laboratorios, cuestionarios, notas, archivos, planes nutricionales y mensajes según las funciones utilizadas. La información de salud requiere un tratamiento especialmente cuidadoso y puede ser sensible conforme a la normativa aplicable.
Esta información es distinta de los datos de la cuenta profesional. El profesional decide qué datos recoge y con qué finalidad clínica, y debe informar a sus pacientes y obtener las autorizaciones que correspondan. El uso del software no sustituye sus deberes profesionales ni el aviso que deba proporcionar a sus pacientes.
[PENDIENTE: ROLES_Y_ACUERDOS_PARA_DATOS_DE_PACIENTES]

## Finalidades y funciones de comunicación
Los datos se utilizan para crear y proteger la cuenta, prestar las funciones solicitadas, guardar y consultar registros, elaborar y compartir planes, gestionar solicitudes de Agenda y Superlink, permitir mensajes y gestionar soporte, suscripciones, cobros y créditos cuando esas funciones estén habilitadas.
Superlink y el espacio del paciente facilitan el acceso a la información que el profesional pone a disposición mediante sus controles. No son un canal de emergencias. El profesional debe revisar qué información comparte y con quién.
Los correos comerciales y operativos de esta fase se limitan a datos de cuenta y transacción; no deben incluir diagnósticos, laboratorios, planes clínicos ni información de pacientes. No se habilitan campañas masivas con este sistema.
[PENDIENTE: FINALIDADES_ADICIONALES_Y_MECANISMOS_DE_CONSENTIMIENTO]

## Proveedores y circulación de datos
Supabase participa en autenticación, base de datos y almacenamiento. Vercel aloja la aplicación. Stripe participa en la infraestructura de facturación, actualmente TEST. Google Calendar y Gmail intervienen en funciones de Agenda o comunicaciones conectadas mediante autorización. Las funciones de estos terceros tienen condiciones y configuraciones propias.
[PENDIENTE: PROVEEDOR_DE_CORREO_COMERCIAL]
[PENDIENTE: UBICACIONES_TRANSFERENCIAS_Y_ACUERDOS_CON_PROVEEDORES]
No se describe a estos proveedores como receptores de toda la información indiscriminadamente: cada integración debe recibir solo lo necesario para la función solicitada.

## IA opcional
OpenAI permanece deshabilitado en esta fase. Si se habilita IA, se informará de su uso y del tratamiento correspondiente antes de enviar información. Las funciones preparadas buscan minimizar el contexto que se transmite; ese filtrado no constituye una garantía de anonimización perfecta. El profesional debe revisar el contenido que utiliza y los resultados. La asistencia de IA no sustituye criterio ni responsabilidad clínica y puede depender de plan, créditos y configuración.

## Seguridad y acceso
Nuthrick utiliza autenticación y controles de acceso por cuenta/profesional. Estos controles reducen riesgos, pero no constituyen una garantía absoluta de seguridad. Se debe proteger la cuenta, evitar compartir credenciales y comunicar incidentes por los canales publicados. Los registros operativos se limitan a la información necesaria; no deben guardar secretos ni datos de tarjeta completos.

## Conservación y cierre
La suspensión de un plan no provoca por sí sola la eliminación de los expedientes. Los plazos de conservación, bloqueo y eliminación deben considerar las finalidades, las solicitudes de las personas y las obligaciones aplicables. No se promete conservar datos indefinidamente ni eliminarlos de inmediato en todos los supuestos.
[PENDIENTE: RETENCION_CIERRE_RESPALDOS_Y_LOGS]

## Derechos y solicitudes
La persona puede solicitar información sobre el tratamiento, acceso, rectificación, cancelación u oposición, así como comunicar revocación de consentimiento o limitación de uso cuando corresponda. Contacto: {{privacy_email}}. La solicitud debe permitir identificar a quien la presenta y localizar la información, con verificación de identidad proporcionada al caso. Evite enviar información clínica innecesaria por correo.
Cuando la solicitud se refiera a un expediente gestionado por un profesional, será necesario determinar su intervención y la de Nuthrick conforme a los roles y obligaciones aplicables. No se promete una eliminación automática que ignore obligaciones de conservación o derechos de otras personas.
[PENDIENTE: PROCEDIMIENTO_ARCO_PLAZOS_Y_ATENCION_A_MENORES]

## Actualizaciones
Las versiones aprobadas se publican con su fecha efectiva y conservan su historial. Las aceptaciones se registran por persona, documento y versión. Los cambios que requieran aceptación nueva no reemplazan los registros anteriores.
$draft$,review_status='pending_review',effective_at=null,updated_at=now() where key='privacy';

update private.legal_documents set body=$draft$# Política de reembolsos y cancelaciones de Nuthrick

## Alcance y situación actual
Nuthrick es software como servicio para profesionales de nutrición. Esta política contempla suscripciones y recargas digitales cuando se ofrezcan. Stripe permanece en TEST: los pagos de prueba no son cobros reales. Las recargas IA Live y las funciones reales de OpenAI no están habilitadas.
Esta propuesta no establece todavía un plazo, porcentaje o derecho económico adicional de reembolso. Debe completarse y aprobarse antes de cobrar.
[PENDIENTE: CRITERIOS_PLAZO_Y_ALCANCE_DE_REEMBOLSOS]

## Cancelar una suscripción
La cancelación ordinaria está preparada para evitar la siguiente renovación al finalizar el período pagado. El acceso continúa hasta la fecha que figure en Mi plan, sujeto al estado aplicable de la cuenta. Cancelar no equivale automáticamente a reembolsar el período en curso. Una cancelación inmediata excepcional requiere una intervención administrativa autorizada y no implica por sí misma un reembolso.
Los intervalos mensual y anual, sus precios y cualquier promoción deben revisarse antes de contratar. No se debe asumir un prorrateo o devolución proporcional si no se ha informado y aprobado esa condición.
[PENDIENTE: CAMBIOS_DE_PLAN_PRORRATEOS_Y_EXCEPCIONES]

## Solicitar revisión de un cobro
Contacto: {{support_email}}. La solicitud debe incluir correo de la cuenta y referencia de la transacción, sin números completos de tarjeta, código de seguridad ni información clínica. Se revisarán el pago, el plan, su estado y las condiciones aplicables. Los derechos que resulten de la normativa aplicable se evaluarán independientemente de las condiciones adicionales que finalmente se aprueben.
Cuando se autorice un reembolso, su ejecución y estado se comprobarán con Stripe. El tiempo de reflejo puede depender del proveedor y de la entidad de pago; no se promete aquí un plazo de acreditación no verificado.
[PENDIENTE: RESPONSABLE_CONTACTO_Y_PROCEDIMIENTO_DE_ATENCION]

## Recargas y créditos de IA
Los créditos incluidos en el plan y los créditos adquiridos son conceptos distintos. El sistema registra las recargas y los ajustes por reembolso sin borrar su historial. Un reembolso total o parcial de una recarga puede revertir los créditos asociados de forma proporcional. Si hubo consumo o una discrepancia, la operación puede requerir revisión y limitar temporalmente nuevos usos hasta resolver su estado.
No se establece en este borrador que todos los créditos sean reembolsables ni que no lo sean. Los precios de paquetes TEST son provisionales y no constituyen una oferta comercial Live.
[PENDIENTE: TRATAMIENTO_ECONOMICO_DE_CREDITOS_CONSUMIDOS]

## Promociones y accesos especiales
Las promociones se rigen por las condiciones mostradas al aplicarlas y no generan automáticamente derecho a devolver importes que no se pagaron. Beta sin tarjeta y concesiones Founder o Full Access no son cobros ni se convierten automáticamente en suscripciones pagadas. Sus efectos al terminar se rigen por su concesión y por los términos aplicables.

## Suspensión y conservación
Un fallo de renovación puede originar gracia y posteriormente suspensión; recuperarse de una suspensión requiere la verificación del estado correspondiente. Cancelar o reembolsar no elimina automáticamente la cuenta ni los datos. Para conservación y solicitudes sobre información consulte el Aviso de privacidad; las decisiones de retención deben completarse antes de publicar esta política.

## Versiones y contacto
Esta política se publica únicamente tras aprobación humana y con fecha efectiva. Soporte: {{support_email}}. Privacidad: {{privacy_email}}. La revisión de pagos no requiere acceder al expediente clínico del paciente.
[PENDIENTE: POLITICA_FISCAL_Y_JURISDICCION]
$draft$,review_status='pending_review',effective_at=null,updated_at=now() where key='refunds';
insert into private.legal_document_versions
select key,version,title,body,review_status,revision,effective_at,published_at,approved_at,approved_by,requires_acceptance,encode(extensions.digest(body,'sha256'),'hex'),updated_at from private.legal_documents;
alter table private.legal_acceptances add constraint legal_acceptance_version_fk foreign key(document_key,document_version) references private.legal_document_versions(document_key,version);
create index legal_acceptances_document_version on private.legal_acceptances(document_key,document_version);

create function private.preserve_legal_version() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'legal_history_immutable';end if;
 if new.version=old.version and old.review_status='approved' then raise exception 'legal_version_immutable';end if;
 if new.version<>old.version and (new.version<>old.version+1 or new.review_status='approved' or new.effective_at is not null or new.approved_at is not null or new.published_at is not null or new.approved_by is not null) then raise exception 'invalid_legal_version';end if;
 if new.review_status='approved' and (current_setting('nuthrick.legal_approval',true) is distinct from 'confirmed' or new.approved_by is distinct from auth.uid() or new.approved_at is null or new.effective_at is null or new.published_at is null) then raise exception 'legal_approval_required';end if;
 new.revision:=old.revision+1;new.updated_at:=now();
 return new;
end $$;
create function private.save_legal_history() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into private.legal_document_versions values(new.key,new.version,new.title,new.body,new.review_status,new.revision,new.effective_at,new.published_at,new.approved_at,new.approved_by,new.requires_acceptance,encode(extensions.digest(new.body,'sha256'),'hex'),new.updated_at)
 on conflict(document_key,version) do update set title=excluded.title,body=excluded.body,review_status=excluded.review_status,revision=excluded.revision,effective_at=excluded.effective_at,published_at=excluded.published_at,approved_at=excluded.approved_at,approved_by=excluded.approved_by,requires_acceptance=excluded.requires_acceptance,content_hash=excluded.content_hash,updated_at=excluded.updated_at;
 return new;
end $$;
revoke all on function private.preserve_legal_version(),private.save_legal_history() from public,anon,authenticated,service_role;
create trigger legal_version_guard before update or delete on private.legal_documents for each row execute function private.preserve_legal_version();
create trigger legal_version_history after update on private.legal_documents for each row execute function private.save_legal_history();

-- The public projection contains approved versions only. Drafts stay private.
drop trigger legal_documents_public_sync on private.legal_documents;
delete from public.legal_documents_public where review_status<>'approved';
alter table public.legal_documents_public drop constraint legal_documents_public_pkey;
alter table public.legal_documents_public add primary key(key,version);
alter table public.legal_documents_public add column body text not null default '';
alter table public.legal_documents_public add column published_at timestamptz;
alter table public.legal_documents_public add column requires_acceptance boolean not null default false;
drop policy legal_documents_public_read on public.legal_documents_public;
create policy legal_documents_public_read on public.legal_documents_public for select to anon,authenticated using(review_status='approved' and published_at<=now() and effective_at<=now());
create or replace function private.sync_legal_documents_public() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.review_status='approved' then
  insert into public.legal_documents_public(key,title,version,effective_at,review_status,content_ref,updated_at,body,published_at,requires_acceptance)
  values(new.key,new.title,new.version,new.effective_at,new.review_status,new.content_ref,new.updated_at,new.body,new.published_at,new.requires_acceptance);
 end if;
 return new;
end $$;
create trigger legal_documents_public_sync after update on private.legal_documents for each row execute function private.sync_legal_documents_public();
create or replace function public.legal_document(p_document_key text) returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(d) from public.legal_documents_public d where key=p_document_key and review_status='approved' and effective_at<=now() and published_at<=now() order by version desc limit 1
$$;

create function private.legal_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_platform_admin();d private.legal_documents;v private.legal_document_versions;c private.support_settings;resolved text;
begin
 if p_action='list' then return coalesce((select jsonb_agg(to_jsonb(x)-'body') from private.legal_documents x),'[]');end if;
 select * into d from private.legal_documents where key=p_data->>'key' for update;
 if d.key is null then raise exception 'not_found';end if;
 if p_action='get' then
  select * into v from private.legal_document_versions where document_key=d.key and version=coalesce((p_data->>'version')::integer,d.version);
  if v.document_key is null then raise exception 'not_found';end if;
  select * into c from private.support_settings where id;
  resolved:=replace(replace(v.body,'{{support_email}}',case when c.contacts_verified_at is not null then c.support_email else '{{support_email}}' end),'{{privacy_email}}',case when c.contacts_verified_at is not null then c.privacy_email else '{{privacy_email}}' end);
  return to_jsonb(v)||jsonb_build_object('key',d.key,'preview_body',resolved,'preview_hash',encode(extensions.digest(resolved,'sha256'),'hex'),'current_version',d.version,'acceptances',(select count(*) from private.legal_acceptances where document_key=d.key and document_version=v.version),'history',(select jsonb_agg(jsonb_build_object('version',version,'status',review_status,'approved_at',approved_at,'effective_at',effective_at) order by version desc) from private.legal_document_versions where document_key=d.key));
 end if;
 if (p_data->>'revision')::integer is distinct from d.revision or (p_data->>'version')::integer is distinct from d.version then raise exception 'legal_version_changed';end if;
 if p_action='new_version' then
  if d.review_status<>'approved' then raise exception 'legal_draft_exists';end if;
  update private.legal_documents set version=version+1,review_status='draft',effective_at=null,approved_at=null,approved_by=null,published_at=null where key=d.key;
 elsif p_action='save' then
  if d.review_status='approved' then raise exception 'legal_version_immutable';end if;
  if length(btrim(coalesce(p_data->>'body','')))<100 or length(p_data->>'body')>60000 or coalesce(p_data->>'status','') not in ('draft','pending_review') then raise exception 'invalid_legal_document';end if;
  update private.legal_documents set body=p_data->>'body',review_status=p_data->>'status',requires_acceptance=coalesce((p_data->>'requires_acceptance')::boolean,false) where key=d.key;
 elsif p_action='approve' then
  if p_data->>'confirmation' is distinct from 'Confirmo que este documento fue revisado y aprobado.' then raise exception 'confirmation_required';end if;
  if d.review_status<>'pending_review' then raise exception 'legal_review_required';end if;
  select * into c from private.support_settings where id;
  if c.contacts_verified_at is null then raise exception 'legal_contact_required';end if;
  resolved:=replace(replace(d.body,'{{support_email}}',c.support_email),'{{privacy_email}}',c.privacy_email);
  if p_data->>'preview_hash' is distinct from encode(extensions.digest(resolved,'sha256'),'hex') then raise exception 'legal_version_changed';end if;
  if resolved ~ '\[PENDIENTE:' or resolved ~ '\{\{' then raise exception 'legal_decisions_required';end if;
  if nullif(p_data->>'effective_at','') is null then raise exception 'legal_effective_date_required';end if;
  perform set_config('nuthrick.legal_approval','confirmed',true);
  update private.legal_documents set body=resolved,review_status='approved',effective_at=(p_data->>'effective_at')::timestamptz,published_at=now(),approved_at=now(),approved_by=actor where key=d.key;
 else raise exception 'invalid_action';end if;
 perform private.billing_audit('legal_'||p_action,null,null,jsonb_build_object('document',d.key,'version',(select version from private.legal_documents where key=d.key),'content_hash',(select encode(extensions.digest(body,'sha256'),'hex') from private.legal_documents where key=d.key)),actor);
 return private.legal_admin_api('get',jsonb_build_object('key',d.key));
end $$;
create function public.legal_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.legal_admin_api(p_action,p_data)$$;
revoke all on function private.legal_admin_api(text,jsonb),public.legal_admin_api(text,jsonb) from public,anon,service_role;
grant execute on function private.legal_admin_api(text,jsonb),public.legal_admin_api(text,jsonb) to authenticated;

create or replace function private.billing_legal_ready() returns boolean language sql stable security definer set search_path='' as $$
 select count(distinct key)=3 from public.legal_documents_public where key in ('terms','privacy','refunds') and review_status='approved' and effective_at<=now() and published_at<=now()
$$;
create function private.record_legal_acceptance(p_document_key text,p_version integer,p_source text) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid();published jsonb;begin
 if owner is null then raise exception 'unauthorized' using errcode='42501';end if;
 if p_source not in ('onboarding','checkout','settings','admin') then raise exception 'invalid_input';end if;
 published:=public.legal_document(p_document_key);
 if published is null or (published->>'version')::integer<>p_version then raise exception 'legal_not_published';end if;
 insert into private.legal_acceptances(professional_id,document_key,document_version,source) values(owner,p_document_key,p_version,p_source) on conflict do nothing;
 return jsonb_build_object('accepted',true,'document_key',p_document_key,'version',p_version);
end $$;
create or replace function public.record_legal_acceptance(p_document_key text,p_version integer,p_source text) returns jsonb language sql security invoker set search_path='' as $$select private.record_legal_acceptance(p_document_key,p_version,p_source)$$;
revoke all on function private.record_legal_acceptance(text,integer,text),public.record_legal_acceptance(text,integer,text) from public,anon,service_role;
grant execute on function private.record_legal_acceptance(text,integer,text),public.record_legal_acceptance(text,integer,text) to authenticated;
create function private.my_legal_acceptances() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception 'unauthorized';end if;
 return jsonb_build_object('accepted',coalesce((select jsonb_agg(jsonb_build_object('document',document_key,'version',document_version,'accepted_at',accepted_at)) from private.legal_acceptances where professional_id=auth.uid()),'[]'),'required',coalesce((select jsonb_agg(jsonb_build_object('document',d.key,'version',d.version)) from (select distinct on(key) * from public.legal_documents_public where review_status='approved' and effective_at<=now() and published_at<=now() order by key,version desc)d where requires_acceptance and not exists(select 1 from private.legal_acceptances a where a.professional_id=auth.uid() and a.document_key=d.key and a.document_version=d.version)),'[]'));
end $$;
create function public.my_legal_acceptances() returns jsonb language sql security invoker set search_path='' as $$select private.my_legal_acceptances()$$;
revoke all on function private.my_legal_acceptances(),public.my_legal_acceptances() from public,anon,service_role;
grant execute on function private.my_legal_acceptances(),public.my_legal_acceptances() to authenticated;

-- Existing outbox, templates, retries and job are extended, not replaced.
alter table private.transactional_email_settings alter column from_email set default '';
alter table private.transactional_email_settings alter column reply_to set default '';
update private.transactional_email_settings set from_email='',reply_to='';
alter table private.transactional_email_settings add column configuration_revision integer not null default 1;
alter table private.transactional_email_settings add column delivery_mode text not null default 'simulated' check(delivery_mode in ('simulated','controlled'));
alter table private.transactional_email_settings add column domain_id uuid;
alter table private.transactional_email_settings add column domain_name text;
alter table private.transactional_email_settings add column domain_evidence jsonb not null default '{}';
alter table private.transactional_email_settings add column verified_at timestamptz;
alter table private.transactional_email_settings add column runtime_verified_at timestamptz;
alter table private.transactional_email_settings add column webhook_verified_at timestamptz;
alter table private.transactional_email_settings add column last_worker_at timestamptz;
create table private.transactional_email_test_recipients (
 email text primary key check(email=lower(email) and email ~ '^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$'),
 authorized_by uuid not null references auth.users(id),authorized_at timestamptz not null default now()
);
create index transactional_email_recipients_actor on private.transactional_email_test_recipients(authorized_by);
alter table private.transactional_email_test_recipients enable row level security;
create policy email_recipients_private on private.transactional_email_test_recipients for all to anon,authenticated using(false) with check(false);
revoke all on private.transactional_email_test_recipients from public,anon,authenticated,service_role;
alter table private.transactional_email_outbox add column delivery_status text not null default 'pending' check(delivery_status in ('pending','simulated','accepted','delivered','bounced','failed','unknown'));
alter table private.transactional_email_outbox add column is_test_delivery boolean not null default false;
alter table private.transactional_email_outbox add column provider_message_id text unique;
alter table private.transactional_email_outbox add column first_attempt_at timestamptz;
alter table private.transactional_email_outbox add column lease_key uuid;
alter table private.transactional_email_outbox add column lease_until timestamptz;
alter table private.transactional_email_outbox add column delivery_snapshot jsonb;
alter table private.transactional_email_outbox add column prepared_message jsonb;
alter table private.transactional_email_outbox add column configuration_revision integer;
alter table private.transactional_email_outbox add column delivered_at timestamptz;
alter table private.transactional_email_outbox add column observed_at timestamptz;
alter table private.transactional_email_outbox add column observed_by uuid references auth.users(id);
alter table private.transactional_email_outbox add column observation_note text;
create index transactional_email_outbox_observed_by on private.transactional_email_outbox(observed_by);
update private.transactional_email_outbox set delivery_status='simulated' where status='sent';
create table private.transactional_email_provider_events (
 event_id text primary key,provider_message_id text not null,event_type text not null,occurred_at timestamptz not null,received_at timestamptz not null default now()
);
create index transactional_email_provider_message on private.transactional_email_provider_events(provider_message_id,occurred_at);
alter table private.transactional_email_provider_events enable row level security;
create policy email_events_private on private.transactional_email_provider_events for all to anon,authenticated using(false) with check(false);
revoke all on private.transactional_email_provider_events from public,anon,authenticated,service_role;

-- Only commercial scalar fields are retained. No copied raw audit/provider payloads.
create or replace function private.enqueue_transactional_email(p_event_key text,p_owner uuid,p_template_key text,p_payload jsonb default '{}',p_recipient_email text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;safe jsonb;recipient text;env text;begin
 if p_event_key is null or p_event_key !~ '^[A-Za-z0-9_:.\-]{3,180}$' then raise exception 'invalid_email_event';end if;
 if not exists(select 1 from private.transactional_email_templates where key=p_template_key and active) then raise exception 'email_template_unavailable';end if;
 env:=coalesce(p_payload->'metadata'->>'mode','test');
 safe:=jsonb_strip_nulls(jsonb_build_object('mode',env,'ends_at',p_payload->>'ends_at','ended_at',p_payload->>'ended_at','audit_id',p_payload->>'audit_id','event',p_template_key));
 recipient:=coalesce(p_recipient_email,(select email from auth.users where id=p_owner));
 insert into private.transactional_email_outbox(event_key,professional_id,recipient_email,template_key,payload,mode) values(p_event_key,p_owner,recipient,p_template_key,safe,env) on conflict(event_key) do nothing returning id into result_id;
 return result_id;
end $$;

create function private.transactional_email_ready() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.transactional_email_settings s where id and provider='resend' and delivery_mode='controlled' and enabled and verified_at>now()-interval '7 days' and runtime_verified_at is not null and webhook_verified_at is not null and last_worker_at is not null
  and domain_evidence->>'spf'='true' and domain_evidence->>'dkim'='true' and domain_evidence->>'dmarc'='true')
 and (select count(*)=15 from private.transactional_email_templates where active)
 and (select contacts_verified_at is not null from private.support_settings where id)
 and (select count(distinct template_key)=5 from private.transactional_email_outbox where configuration_revision=(select configuration_revision from private.transactional_email_settings where id) and is_test_delivery and provider_message_id is not null and observed_at is not null and delivery_status in ('accepted','delivered') and template_key in ('welcome','payment_confirmed','payment_failed','credits_purchased','credits_refunded'))
 and not exists(select 1 from private.transactional_email_outbox where configuration_revision=(select configuration_revision from private.transactional_email_settings where id) and is_test_delivery and status='failed')
$$;
revoke all on function private.transactional_email_ready() from public,anon,authenticated,service_role;

create function private.email_delivery_overview() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ready',private.transactional_email_ready(),'settings',(select to_jsonb(s) from private.transactional_email_settings s),'contacts',(select jsonb_build_object('support_email',case when contacts_verified_at is not null then support_email end,'privacy_email',case when contacts_verified_at is not null then privacy_email end,'verified_at',contacts_verified_at) from private.support_settings where id),'test_recipients',coalesce((select jsonb_agg(email) from private.transactional_email_test_recipients),'[]'),
 'counts',jsonb_build_object('pending',(select count(*) from private.transactional_email_outbox where status='pending'),'accepted',(select count(*) from private.transactional_email_outbox where delivery_status='accepted'),'delivered',(select count(*) from private.transactional_email_outbox where delivery_status='delivered'),'observed',(select count(*) from private.transactional_email_outbox where observed_at is not null),'failed',(select count(*) from private.transactional_email_outbox where status='failed'),'simulated',(select count(*) from private.transactional_email_outbox where delivery_status='simulated')),
 'messages',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,template_key,mode,status,delivery_status,attempts,last_error,next_attempt_at,provider_message_id,observed_at,delivered_at,is_test_delivery,created_at from private.transactional_email_outbox order by created_at desc limit 50)x),'[]'))
$$;
revoke all on function private.email_delivery_overview() from public,anon,authenticated,service_role;

create function private.email_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_platform_admin();s private.transactional_email_settings;recipient_address text;k text;run_id uuid;item private.transactional_email_outbox;begin
 if p_action='overview' then return private.email_delivery_overview();end if;
 if p_action='contacts' then
  if p_data->>'confirmation' is distinct from 'CONFIRMAR CONTACTOS REALES' then raise exception 'confirmation_required';end if;
  if coalesce(p_data->>'support_email','') !~ '^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$' or coalesce(p_data->>'privacy_email','') !~ '^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$' then raise exception 'invalid_email';end if;
  update private.support_settings set support_email=lower(p_data->>'support_email'),privacy_email=lower(p_data->>'privacy_email'),contacts_verified_at=now(),contacts_verified_by=actor,enabled=true,updated_at=now() where id;
 update private.transactional_email_settings set configuration_revision=configuration_revision+1,reply_to=lower(p_data->>'support_email'),verified_at=null,runtime_verified_at=null,webhook_verified_at=null,last_worker_at=null where id;
 elsif p_action='configure' then
  if p_data->>'confirmation' is distinct from 'SOLO CORREOS DE PRUEBA CONTROLADOS' then raise exception 'confirmation_required';end if;
  if coalesce(p_data->>'domain_name','') !~ '^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$' or coalesce(p_data->>'from_email','') !~ '^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$' or split_part(lower(p_data->>'from_email'),'@',2)<>p_data->>'domain_name' then raise exception 'invalid_sender';end if;
  if (select contacts_verified_at is null from private.support_settings where id) then raise exception 'legal_contact_required';end if;
  update private.transactional_email_settings set configuration_revision=configuration_revision+1,last_worker_at=null,provider='resend',delivery_mode='controlled',domain_id=(p_data->>'domain_id')::uuid,domain_name=p_data->>'domain_name',from_email=lower(p_data->>'from_email'),reply_to=(select support_email from private.support_settings where id),verified_at=null,runtime_verified_at=null,webhook_verified_at=null,domain_evidence='{}',updated_at=now() where id;
 elsif p_action='authorize_recipient' then
  recipient_address:=lower(btrim(p_data->>'email'));
  if p_data->>'confirmation' is distinct from 'CONTROLO ESTA BANDEJA Y AUTORIZO LAS PRUEBAS' then raise exception 'confirmation_required';end if;
  if coalesce(recipient_address,'') !~ '^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$' then raise exception 'invalid_email';end if;
  if (select count(*) from private.transactional_email_test_recipients)>=2 and not exists(select 1 from private.transactional_email_test_recipients r where r.email=recipient_address) then raise exception 'test_recipient_limit';end if;
  insert into private.transactional_email_test_recipients(email,authorized_by) values(recipient_address,actor) on conflict do nothing;
 elsif p_action='queue_tests' then
  recipient_address:=lower(btrim(p_data->>'email'));run_id:=(p_data->>'operation_key')::uuid;
  if run_id is null or not exists(select 1 from private.transactional_email_test_recipients r where r.email=recipient_address) then raise exception 'test_recipient_required';end if;
  select * into s from private.transactional_email_settings where id;
  if s.verified_at is null or s.runtime_verified_at is null or s.provider<>'resend' or s.delivery_mode<>'controlled' then raise exception 'email_configuration_required';end if;
  foreach k in array array['welcome','payment_confirmed','payment_failed','credits_purchased','credits_refunded'] loop
   insert into private.transactional_email_outbox(event_key,recipient_email,template_key,payload,mode,is_test_delivery,configuration_revision) values('live1b:'||run_id::text||':'||k,recipient_address,k,jsonb_build_object('mode','test','controlled_test',true),'test',true,s.configuration_revision) on conflict(event_key) do nothing;
  end loop;
 elsif p_action='observed' then
  if p_data->>'confirmation' is distinct from 'Confirmo que recibí y revisé este correo.' or length(btrim(coalesce(p_data->>'note','')))<12 then raise exception 'confirmation_required';end if;
  update private.transactional_email_outbox set observed_at=now(),observed_by=actor,observation_note=left(p_data->>'note',500) where id=(p_data->>'id')::uuid and is_test_delivery and provider_message_id is not null and delivery_status in ('accepted','delivered');
  if not found then raise exception 'email_not_observable';end if;
 elsif p_action='retry' then
  select * into item from private.transactional_email_outbox where id=(p_data->>'id')::uuid for update;
  if item.status is distinct from 'failed' or item.provider_message_id is not null or item.delivery_status='bounced' then raise exception 'email_not_retryable';end if;
  -- Resend's idempotency window is 24 h. Never resend an ambiguous old send.
  if item.first_attempt_at<now()-interval '23 hours' then raise exception 'email_delivery_requires_reconciliation';end if;
  update private.transactional_email_outbox set status='pending',attempts=0,next_attempt_at=now(),last_error=null,lease_key=null,lease_until=null where id=item.id;
 else raise exception 'invalid_action';end if;
 perform private.billing_audit('email_'||p_action,null,null,jsonb_build_object('message_id',p_data->>'id','controlled',true),actor);
 return private.email_delivery_overview();
end $$;
create function public.email_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.email_admin_api(p_action,p_data)$$;
revoke all on function private.email_admin_api(text,jsonb),public.email_admin_api(text,jsonb) from public,anon,service_role;
grant execute on function private.email_admin_api(text,jsonb),public.email_admin_api(text,jsonb) to authenticated;

-- A signed provider event can arrive before the send response; retain its ID
-- independently and reconcile it again when the send response is persisted.
create function private.apply_email_delivery(p_provider_id text) returns void language plpgsql security definer set search_path='' as $$
declare e private.transactional_email_provider_events;begin
 select * into e from private.transactional_email_provider_events where provider_message_id=p_provider_id order by case when event_type in ('email.bounced','email.complained','email.failed','email.suppressed') then 0 when event_type='email.delivered' then 1 else 2 end,occurred_at desc limit 1;
 if e.event_id is null then return;end if;
 if e.event_type in ('email.bounced','email.complained','email.failed','email.suppressed') then
  update private.transactional_email_outbox set status='failed',delivery_status=case when e.event_type='email.bounced' then 'bounced' else 'failed' end,last_error=replace(e.event_type,'.','_'),updated_at=now() where provider_message_id=p_provider_id;
 elsif e.event_type='email.delivered' then
  update private.transactional_email_outbox set status='sent',delivery_status='delivered',delivered_at=e.occurred_at,last_error=null,updated_at=now() where provider_message_id=p_provider_id and delivery_status not in ('failed','bounced');
 end if;
end $$;
revoke all on function private.apply_email_delivery(text) from public,anon,authenticated,service_role;

create function private.transactional_email_server(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.transactional_email_settings;item private.transactional_email_outbox;t private.transactional_email_templates;lk uuid;result jsonb;run_id bigint;begin
 if p_action='authorize_admin' then
  if not exists(select 1 from private.platform_admins where user_id=(p_data->>'actor')::uuid and enabled) then raise exception 'admin_required';end if;return '{"authorized":true}';
 end if;
 select * into s from private.transactional_email_settings where id;
 if p_action='configuration' then return to_jsonb(s);end if;
 if p_action='verified' then
  if (p_data->>'configuration_revision')::integer is distinct from s.configuration_revision or p_data->>'domain_id' is distinct from s.domain_id::text or p_data->>'domain_name' is distinct from s.domain_name then raise exception 'email_configuration_changed';end if;
  update private.transactional_email_settings set domain_evidence=p_data->'evidence',runtime_verified_at=case when coalesce((p_data->>'runtime_ready')::boolean,false) then now() end,verified_at=case when p_data->'evidence'->>'spf'='true' and p_data->'evidence'->>'dkim'='true' and p_data->'evidence'->>'dmarc'='true' then now() end where id;
  return private.email_delivery_overview();
 end if;
 if p_action='delivery_event' then
  if coalesce(p_data->>'event_id','') !~ '^[A-Za-z0-9_-]{5,200}$' or p_data->>'type' not in ('email.sent','email.delivered','email.bounced','email.failed','email.complained','email.delivery_delayed','email.suppressed') or coalesce(p_data->>'provider_message_id','') !~ '^[A-Za-z0-9_-]{5,200}$' then raise exception 'invalid_email_event';end if;
  insert into private.transactional_email_provider_events(event_id,provider_message_id,event_type,occurred_at) values(p_data->>'event_id',p_data->>'provider_message_id',p_data->>'type',(p_data->>'occurred_at')::timestamptz) on conflict(event_id) do nothing;
  update private.transactional_email_settings set webhook_verified_at=now() where id;
  perform private.apply_email_delivery(p_data->>'provider_message_id');return '{"received":true}';
 end if;
 if p_action='claim' then
  if not s.enabled or s.delivery_mode<>'controlled' or s.provider<>'resend' or s.verified_at<now()-interval '7 days' or s.verified_at is null or s.runtime_verified_at is null then raise exception 'email_configuration_required';end if;
  lk:=(p_data->>'lease_key')::uuid;if lk is null then raise exception 'invalid_input';end if;
  select * into item from private.transactional_email_outbox o where o.configuration_revision=s.configuration_revision and is_test_delivery and mode='test' and provider_message_id is null and status in ('pending','failed') and attempts<5 and next_attempt_at<=now() and (lease_until is null or lease_until<now()) and exists(select 1 from private.transactional_email_test_recipients r where r.email=o.recipient_email) order by created_at for update skip locked limit 1;
  if item.id is null then return null;end if;
  if item.first_attempt_at<now()-interval '23 hours' then
   update private.transactional_email_outbox set status='failed',attempts=5,last_error='email_delivery_requires_reconciliation',delivery_status='unknown' where id=item.id;return null;
  end if;
  select * into t from private.transactional_email_templates where key=item.template_key and active;
  if t.key is null then raise exception 'email_template_unavailable';end if;
  update private.transactional_email_outbox set lease_key=lk,lease_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),delivery_snapshot=coalesce(delivery_snapshot,jsonb_build_object('id',id,'recipient',recipient_email,'template_key',template_key,'subject',t.subject,'body',t.body,'mode',mode,'controlled_test',is_test_delivery,'from_email',s.from_email,'reply_to',s.reply_to,'support_email',(select support_email from private.support_settings where id),'privacy_email',(select privacy_email from private.support_settings where id))),updated_at=now() where id=item.id returning * into item;
  return item.delivery_snapshot||jsonb_build_object('attempts',item.attempts,'first_attempt_at',item.first_attempt_at,'prepared_message',item.prepared_message);
 end if;
 if p_action='prepare' then
  update private.transactional_email_outbox set prepared_message=coalesce(prepared_message,p_data->'message') where id=(p_data->>'id')::uuid and lease_key=(p_data->>'lease_key')::uuid returning prepared_message into result;
  if not found then raise exception 'email_lease_expired';end if;return result;
 end if;
 if p_action='complete' then
  select * into item from private.transactional_email_outbox where id=(p_data->>'id')::uuid and lease_key=(p_data->>'lease_key')::uuid for update;
  if item.id is null then raise exception 'email_lease_expired';end if;
  if nullif(p_data->>'provider_message_id','') is not null then
   update private.transactional_email_outbox set provider_message_id=p_data->>'provider_message_id',status='sent',delivery_status='accepted',sent_at=now(),last_error=null,lease_key=null,lease_until=null,updated_at=now() where id=item.id;
   perform private.apply_email_delivery(p_data->>'provider_message_id');
  else
   if coalesce(p_data->>'code','') !~ '^[a-z_]{3,80}$' then raise exception 'invalid_input';end if;
   update private.transactional_email_outbox set status=case when attempts>=5 or not coalesce((p_data->>'retryable')::boolean,false) then 'failed' else 'pending' end,attempts=case when not coalesce((p_data->>'retryable')::boolean,false) then 5 else attempts end,delivery_status=case when p_data->>'code'='email_delivery_unknown' then 'unknown' else 'failed' end,last_error=p_data->>'code',next_attempt_at=now()+make_interval(mins=>least(60,power(2,attempts)::integer)),lease_key=null,lease_until=null,updated_at=now() where id=item.id;
  end if;
  return '{"saved":true}';
 end if;
 if p_action='worker_done' then
  update private.transactional_email_settings set last_worker_at=now() where id;
  insert into private.operational_job_runs(job_key,started_at,finished_at,status,result) values('transactional_email_real_worker',now(),now(),case when (p_data->>'failed')::integer>0 then 'failed' else 'succeeded' end,jsonb_build_object('accepted',p_data->'accepted','failed',p_data->'failed')) returning id into run_id;
  return jsonb_build_object('run_id',run_id);
 end if;
 raise exception 'invalid_action';
end $$;
create function public.transactional_email_server(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.transactional_email_server(p_action,p_data)$$;
revoke all on function private.transactional_email_server(text,jsonb),public.transactional_email_server(text,jsonb) from public,anon,authenticated;
grant execute on function private.transactional_email_server(text,jsonb),public.transactional_email_server(text,jsonb) to service_role;

alter function private.process_transactional_email_outbox(integer) rename to process_simulated_email_outbox;
revoke all on function private.process_simulated_email_outbox(integer) from public,anon,authenticated,service_role;
create function private.process_transactional_email_outbox(p_limit integer default 50) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if (select delivery_mode from private.transactional_email_settings where id)<>'simulated' then return '{"accepted":0,"worker_required":true}';end if;
 result:=private.process_simulated_email_outbox(p_limit);
 update private.transactional_email_outbox set delivery_status='simulated' where status='sent' and provider_message_id is null and not is_test_delivery;
 return result;
end $$;
revoke all on function private.process_transactional_email_outbox(integer) from public,anon,authenticated,service_role;
create or replace function private.email_job_entrypoint() returns jsonb language plpgsql security definer set search_path='' as $$
declare token text;request_id bigint;begin
 if (select delivery_mode from private.transactional_email_settings where id)='simulated' then return private.process_transactional_email_outbox(50);end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='nuthrick_transactional_email_worker_secret';
 if token is null or length(token)<32 then raise exception 'email_worker_configuration_required';end if;
 select net.http_post(url:='https://qlsqhvyrslclmlstlemn.supabase.co/functions/v1/transactional-email',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=120000) into request_id;
 return jsonb_build_object('dispatched',true,'request_id',request_id);
end $$;

-- Close legacy mutation paths: all approvals and retries use the new guards.
alter function private.operations_admin_api(text,jsonb) rename to operations_admin_before_live1b;
revoke all on function private.operations_admin_before_live1b(text,jsonb) from public,anon,authenticated,service_role;
create function private.operations_admin_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.require_platform_admin();
 if p_action='legal_status' then raise exception 'use_legal_approval_flow';end if;
 if p_action='retry_email' then return private.email_admin_api('retry',p_data);end if;
 if p_action='support_settings' then raise exception 'use_verified_contact_settings';end if;
 return private.operations_admin_before_live1b(p_action,p_data);
end $$;
revoke all on function private.operations_admin_api(text,jsonb) from public,anon,service_role;
grant execute on function private.operations_admin_api(text,jsonb) to authenticated;
alter function private.operations_overview() rename to operations_before_live1b;
revoke all on function private.operations_before_live1b() from public,anon,authenticated,service_role;
create function private.operations_overview() returns jsonb language sql stable security definer set search_path='' as $$select private.operations_before_live1b()||jsonb_build_object('real_email',private.email_delivery_overview())$$;
revoke all on function private.operations_overview() from public,anon,authenticated,service_role;

-- Replace only the email evidence calculation in the existing 15 checks.
do $$declare definition text;start_at integer;end_at integer;begin
 definition:=pg_get_functiondef('private.pre_live_evidence()'::regprocedure);
 start_at:=position('  email_ready :=' in definition);end_at:=position('  support_ready :=' in definition);
 if start_at=0 or end_at<=start_at then raise exception 'readiness_patch_missing';end if;
 definition:=substring(definition from 1 for start_at-1)||'  email_ready := private.transactional_email_ready();'||chr(10)||chr(10)||substring(definition from end_at);
 definition:=replace(definition,'15 plantillas, outbox TEST, idempotencia y entrega sintética verificadas; no se enviaron correos reales.','Proveedor real, DNS, remitente y cinco correos recibidos verificados; outbox y monitoring disponibles.');
 definition:=replace(definition,'Falta proveedor TEST, plantillas, prueba de entrega o hay fallos en el outbox.','Falta verificar proveedor real, SPF/DKIM/DMARC y recepción de cinco pruebas controladas.');
 definition:=replace(definition,'s.enabled and s.channel in', 's.enabled and s.contacts_verified_at is not null and s.channel in');
 execute definition;
end $$;
commit;
