-- Legal Final v1: complete the reviewable drafts without approving or publishing them.
-- The Supabase CLI is not installed in this worktree, so this migration is kept as
-- a timestamped migration file and applied through the Supabase migration API.
do $$
declare
  v_terms text := $terms$
# Términos de uso de Nuthrick

## Servicio y partes
Nuthrick es el nombre comercial de un servicio de software para profesionales de nutrición. El servicio es prestado por José Antonio Olmedo Cisneros, persona física con actividades empresariales y profesionales, con domicilio en Cerrada/Privada 15 de Mayo No. 9, Colonia Centro, Ojocaliente, Zacatecas, C.P. 98700, México. Nuthrick ofrece herramientas para gestionar cuentas, pacientes, consultas, registros y planes nutricionales, además de Agenda, Superlink y mensajería cuando estén disponibles en la cuenta. Nuthrick no es un servicio de urgencias ni presta por sí mismo atención clínica.

## Cuenta y uso profesional
Las cuentas profesionales están destinadas a personas de 18 años o más. Cada persona debe proporcionar información veraz, proteger sus credenciales y utilizar únicamente información que esté autorizada a tratar. El profesional decide a quién invita y qué información comparte mediante las funciones disponibles, revisa sus permisos y mantiene actualizados sus datos de contacto. No se permite acceder a cuentas o expedientes ajenos sin autorización ni usar el servicio para enviar contenido ilícito o abusivo.
Los datos de una persona menor de edad pueden registrarse como información de paciente por un profesional. En ese caso el profesional debe obtener y conservar las autorizaciones o consentimientos que correspondan y mantiene la relación clínica, el criterio y la responsabilidad profesional. Nuthrick no obtiene directamente el consentimiento clínico del paciente ni sustituye las obligaciones del profesional.

## Planes, Beta y accesos especiales
Los planes comerciales se denominan Esencial y Profesional. Sus límites, beneficios y precios vigentes se muestran en Nuthrick antes de contratar. Beta tiene la duración y condiciones de la invitación o código aplicado y no exige tarjeta mientras siga vigente. Full Access es una concesión especial administrada por Nuthrick; no es una promesa general de acceso perpetuo ni se adquiere automáticamente con una promoción. Los permisos administrativos son distintos de los beneficios de un plan.

## Suscripciones y pagos
La infraestructura contempla suscripciones mensuales o anuales, renovaciones, comprobantes y gestión de pagos mediante Stripe. Actualmente Stripe funciona en TEST: una prueba no es un cargo real ni una suscripción comercial cobrada. La habilitación de pagos reales se comunicará en el flujo de contratación. Antes de una contratación se muestran plan, intervalo, moneda, importe y promoción aplicable. Una suscripción recurrente autorizada se renueva según el intervalo contratado mientras no se cancele conforme a estos términos.
Nuthrick no promete la emisión automática de CFDI. Los comprobantes y obligaciones fiscales se atenderán conforme a la normativa aplicable y al mecanismo que se habilite para cada operación.

## Cancelación, falta de pago y acceso
La cancelación ordinaria evita la siguiente renovación y respeta el período pagado. Solicitarla no significa obtener automáticamente un reembolso. Ante una renovación fallida puede existir el período de gracia configurado, seguido de suspensión de acciones que requieren acceso activo; la confirmación del pago puede recuperar el acceso.
Nuthrick puede limitar o suspender temporalmente el acceso cuando exista falta de pago, uso no autorizado, riesgo de seguridad, incumplimiento de estos términos, requerimiento legal o necesidad de proteger el servicio. Cuando sea razonable se comunicará la causa y la forma de resolverla. La suspensión no equivale al cierre de la cuenta ni a la eliminación automática de información. El cierre, la conservación y las solicitudes sobre información se atienden conforme al Aviso de privacidad y a la normativa aplicable.

## Promociones y créditos
Las promociones pueden limitarse por profesional, plan, intervalo, vigencia o número de usos. Se aplican solo cuando se cumplen las condiciones mostradas; al finalizar un beneficio de precio rige el precio normal contratado según lo informado. Las plantillas TEST no constituyen ofertas Live.
Las funciones de IA pueden estar sujetas a plan, disponibilidad y créditos. Los créditos incluidos se asignan por mes, también en planes anuales, según la configuración aplicable. Los créditos comprados se registran por separado. Las recargas actuales y sus precios son TEST y provisionales; no se ofrece su compra Live en esta fase. Los ajustes por reembolso se registran en el historial y se describen en la política correspondiente.

## Asistencia de IA y responsabilidad profesional
Las funciones reales de OpenAI permanecen deshabilitadas. Si se habilitan funciones de IA, su disponibilidad dependerá del plan, créditos y configuración y podrá cambiar o desactivarse. La IA es una asistencia: puede redactar propuestas o apoyar tareas, pero sus resultados pueden contener errores y deben revisarse antes de utilizarse. No reemplaza el juicio clínico ni la evaluación del paciente. El profesional conserva la responsabilidad sobre sus decisiones clínicas y sobre la información que incorpora o comunica.
Nuthrick mantiene medidas razonables para operar el servicio, pero puede requerir mantenimiento, presentar interrupciones o depender de terceros. No se ofrece un nivel de servicio ni disponibilidad continua que no se haya pactado expresamente. Esta cláusula no elimina obligaciones que correspondan legalmente a Nuthrick ni derechos que no puedan renunciarse.

## Información, proveedores y disponibilidad
El profesional debe contar con la autorización y fundamentos necesarios para tratar información de sus pacientes. El Aviso de privacidad diferencia esa información de los datos de la cuenta profesional. Nuthrick utiliza Supabase para autenticación, base de datos y almacenamiento; Vercel para alojar la aplicación; Stripe para la infraestructura de facturación; y Google Calendar y Gmail para las funciones de Agenda conectadas. La autenticación y los correos de cuenta se gestionan con Supabase Auth y, durante esta etapa, un SMTP de Gmail; los correos comerciales permanecen simulados. OpenAI solo intervendrá si se habilita expresamente su uso.
Los proveedores reciben únicamente la información necesaria para la función solicitada, conforme a sus condiciones y a la configuración aplicable. El servicio puede requerir mantenimiento y depender de terceros.

## Contacto y cambios
Soporte: {{support_email}}. Privacidad: {{privacy_email}}. El correo operativo actual es susy.asistencia.online@gmail.com y queda documentado como correo institucional temporal pendiente de migración futura. Cada versión publicada conserva su fecha efectiva e historial. Una nueva versión puede requerir una aceptación nueva, sin alterar las aceptaciones anteriores.
[PENDIENTE: CONFIRMAR LEY APLICABLE Y JURISDICCIÓN COMPETENTE]
$terms$;
  v_privacy text := $privacy$
# Aviso de privacidad de Nuthrick

## Identidad y contacto
Este aviso describe el tratamiento de información en Nuthrick, nombre comercial del servicio prestado por José Antonio Olmedo Cisneros, persona física con actividades empresariales y profesionales, con domicilio en Cerrada/Privada 15 de Mayo No. 9, Colonia Centro, Ojocaliente, Zacatecas, C.P. 98700, México.
Contacto de privacidad: {{privacy_email}}. Soporte: {{support_email}}. El correo operativo actual es susy.asistencia.online@gmail.com y queda documentado como correo institucional temporal pendiente de migración futura.

## Datos de la persona profesional
La cuenta puede incluir nombre, correo, datos de perfil profesional y contacto, identidad de acceso, preferencias, imagen o marca y configuración de servicios conectados. La operación comercial mantiene plan, suscripción, promociones, movimientos de créditos, referencias de pago y comprobantes. También se registran eventos de acceso, aceptación de documentos y operaciones necesarias para seguridad y soporte.
Nuthrick no solicita almacenar el número completo de tarjeta ni su código de seguridad. Los formularios de pago y gestión de medios de pago se alojan en Stripe cuando se utilizan; Nuthrick conserva referencias y estados comerciales recibidos del proveedor.

## Información de pacientes
El profesional puede registrar datos de identificación y contacto de sus pacientes, antecedentes e información relacionada con salud, incluyendo antropometría, historiales, consultas, laboratorios, cuestionarios, notas, diagnósticos nutricionales, objetivos, seguimiento, planes nutricionales, archivos y mensajes según las funciones utilizadas. Esta información puede ser sensible conforme a la normativa aplicable.
La información de pacientes es distinta de los datos de la cuenta profesional. El profesional conserva la relación clínica, decide qué datos recoge y con qué finalidad, determina el contenido que comparte y mantiene el criterio y la responsabilidad profesional. Nuthrick proporciona infraestructura y funciones de software; la asignación concreta de roles y las obligaciones entre el profesional y Nuthrick se interpretan conforme a la función utilizada, la normativa aplicable y los acuerdos que correspondan.
El profesional debe informar a sus pacientes y obtener las autorizaciones o consentimientos necesarios, incluida la representación de una persona menor de edad cuando corresponda. Nuthrick no obtiene directamente el consentimiento clínico del paciente.

## Finalidades y funciones de comunicación
Los datos se utilizan para crear y proteger la cuenta, prestar las funciones solicitadas, guardar y consultar registros, elaborar y compartir planes, gestionar solicitudes de Agenda y Superlink, permitir mensajes, gestionar soporte, suscripciones, cobros y créditos cuando esas funciones estén habilitadas, cumplir obligaciones legales y atender seguridad, auditoría y controversias.
Superlink y el espacio del paciente facilitan el acceso a la información que el profesional pone a disposición mediante sus controles. No son un canal de emergencias. El profesional debe revisar qué información comparte y con quién.
Los correos de cuenta, seguridad y transacción se limitan a la finalidad correspondiente; no deben incluir diagnósticos, laboratorios, planes clínicos ni información de pacientes. Los avisos comerciales solo se enviarán cuando exista una base legal o consentimiento aplicable y la configuración los habilite. No se habilitan campañas masivas con el sistema transaccional de esta fase.

## Proveedores y circulación de datos
Supabase participa en autenticación, base de datos y almacenamiento. Vercel aloja la aplicación. Stripe participa en la infraestructura de facturación, actualmente TEST. Google Calendar y Gmail intervienen en funciones de Agenda, autenticación SMTP de cuenta o comunicaciones conectadas mediante autorización. Un proveedor futuro de IA solo recibirá información cuando esa función se habilite expresamente y el envío sea procedente. No hay un proveedor comercial de correo Live activo en esta fase; los envíos comerciales permanecen simulados.
Las ubicaciones, transferencias y medidas contractuales pueden depender de la región, producto y configuración de cada proveedor. Nuthrick no afirma una ubicación concreta ni una transferencia adicional que no esté verificada; se aplican los términos del proveedor, la configuración vigente y las obligaciones legales correspondientes. Cada integración debe recibir solo lo necesario para la función solicitada.

## IA opcional
OpenAI permanece deshabilitado en esta fase. Si se habilita IA, se informará de su uso y del tratamiento correspondiente antes de enviar información. Las funciones preparadas buscan minimizar el contexto que se transmite; ese filtrado no constituye una garantía de anonimización perfecta. El profesional debe revisar el contenido que utiliza y los resultados. La asistencia de IA no sustituye criterio ni responsabilidad clínica y puede depender de plan, créditos y configuración.

## Seguridad y acceso
Nuthrick utiliza autenticación y controles de acceso por cuenta y profesional. Estos controles reducen riesgos, pero no constituyen una garantía absoluta de seguridad. Se debe proteger la cuenta, evitar compartir credenciales y comunicar incidentes por los canales publicados. Los registros operativos se limitan a la información necesaria; no deben guardar secretos ni datos de tarjeta completos.

## Conservación y cierre
La suspensión o cancelación de un plan no provoca por sí sola la eliminación de los expedientes. La conservación, bloqueo y eliminación se determinan según la finalidad, el estado de la cuenta, las solicitudes de las personas, obligaciones profesionales y legales, seguridad, auditoría y atención de controversias. Los respaldos técnicos pueden conservarse durante el ciclo razonable de rotación y recuperación. No se promete conservar datos indefinidamente ni eliminarlos de inmediato en todos los supuestos. Las solicitudes de eliminación se evalúan junto con obligaciones de conservación y los derechos de otras personas.

## Derechos y solicitudes
La persona puede solicitar información sobre el tratamiento, acceso, rectificación, cancelación u oposición, así como comunicar revocación de consentimiento o limitación de uso cuando corresponda. Contacto: {{privacy_email}}. La solicitud debe incluir datos suficientes para identificar a quien la presenta, describir el derecho que ejerce y localizar la información; se podrá solicitar una verificación de identidad proporcionada al caso. Evite enviar información clínica innecesaria por correo.
Las solicitudes se atienden conforme a los plazos y requisitos de la normativa aplicable. Cuando se refieran a un expediente gestionado por un profesional, se determinará la intervención de cada parte conforme a los roles y obligaciones aplicables. Las solicitudes de personas menores de edad se presentan por quien tenga representación o legitimación conforme a la ley. No se promete una eliminación automática que ignore obligaciones de conservación o derechos de otras personas.

## Actualizaciones
Las versiones aprobadas se publican con su fecha efectiva y conservan su historial. Las aceptaciones se registran por persona, documento y versión. Los cambios que requieran aceptación nueva no reemplazan los registros anteriores.
$privacy$;
  v_refunds text := $refunds$
# Política de reembolsos y cancelaciones de Nuthrick

## Alcance y situación actual
Nuthrick es software como servicio para profesionales de nutrición. Esta política contempla suscripciones y recargas digitales cuando se ofrezcan. Stripe permanece en TEST: los pagos de prueba no son cobros reales. Las recargas de IA Live y las funciones reales de OpenAI no están habilitadas. Las condiciones de precio y cobro que se muestren antes de una operación forman parte de la revisión correspondiente.

## Solicitar y revisar un reembolso
No existe un reembolso general automático para toda suscripción o recarga. Nuthrick revisará cada solicitud considerando, entre otros elementos, un cobro duplicado o incorrecto, un error comprobable del servicio, una obligación legal, una operación no autorizada que deba investigarse o un caso excepcional de soporte. La revisión no limita derechos irrenunciables previstos por la normativa aplicable.
La solicitud debe presentarse tan pronto como sea razonablemente posible a {{support_email}} e incluir el correo de la cuenta, la referencia de la transacción, el motivo y la información necesaria para revisarla, sin números completos de tarjeta, código de seguridad ni información clínica. Nuthrick verificará el pago, el plan, su estado y las condiciones mostradas al contratar. Cuando se autorice un reembolso, su ejecución y estado se comprobarán con Stripe. El tiempo de reflejo puede depender del proveedor y de la entidad de pago; no se promete aquí un plazo de acreditación no verificado.

## Cancelar una suscripción
La cancelación ordinaria evita la siguiente renovación y respeta el período pagado. Cancelar no equivale automáticamente a reembolsar el período en curso. Una cancelación inmediata excepcional requiere una intervención administrativa autorizada y se revisa con los criterios anteriores.

## Cambios de plan, prorrateos y excepciones
Las mejoras a otro plan dentro de la misma modalidad se solicitan de inmediato y Stripe calcula el prorrateo cuando la operación está habilitada. Las reducciones y los cambios entre modalidad mensual y anual se programan para el final del período pagado. La pantalla de contratación o cambio muestra el importe y el momento aplicable antes de confirmar. Si una excepción no está habilitada o no está mostrada, se revisará por soporte antes de ejecutarse.

## Recargas y créditos de IA
Los créditos incluidos en el plan y los créditos adquiridos son conceptos distintos. El sistema registra las recargas y los ajustes por reembolso sin borrar su historial. Un reembolso total o parcial de una recarga puede revertir los créditos asociados de forma proporcional. Si hubo consumo o una discrepancia, la operación puede requerir revisión y limitar temporalmente nuevos usos hasta resolver su estado.
Los créditos consumidos no generan un reembolso automático. Cuando exista un error del servicio, cobro incorrecto, obligación legal o circunstancia excepcional, Nuthrick revisará el consumo, la trazabilidad de la operación y el ajuste que corresponda. Los precios de paquetes TEST son provisionales y no constituyen una oferta comercial Live.

## Promociones y accesos especiales
Las promociones se rigen por las condiciones mostradas al aplicarlas y no generan automáticamente derecho a devolver importes que no se pagaron. Beta sin tarjeta y concesiones Full Access no son cobros ni se convierten automáticamente en suscripciones pagadas. Sus efectos al terminar se rigen por su concesión y por los términos aplicables.

## Suspensión y conservación
Un fallo de renovación puede originar gracia y posteriormente suspensión; recuperarse de una suspensión requiere la verificación del estado correspondiente. Cancelar o reembolsar no elimina automáticamente la cuenta ni los datos. Para conservación y solicitudes sobre información consulte el Aviso de privacidad. Las decisiones administrativas conservan el historial necesario para conciliar pagos y atender solicitudes.

## Fiscalidad, versiones y contacto
Nuthrick no promete la emisión automática de CFDI. Los comprobantes y obligaciones fiscales se atenderán conforme a la normativa aplicable y al mecanismo que se habilite para cada operación. Esta política se publica únicamente tras aprobación humana y con fecha efectiva.
Soporte: {{support_email}}. Privacidad: {{privacy_email}}. El correo operativo actual es susy.asistencia.online@gmail.com y queda documentado como correo institucional temporal pendiente de migración futura. La revisión de pagos no requiere acceder al expediente clínico del paciente.
$refunds$;
begin
  update private.legal_documents
  set body = case key when 'terms' then v_terms when 'privacy' then v_privacy when 'refunds' then v_refunds end,
      review_status = 'pending_review',
      effective_at = null,
      published_at = null,
      approved_at = null,
      approved_by = null,
      requires_acceptance = case when key in ('terms','privacy') then true else false end,
      updated_at = now()
  where key in ('terms','privacy','refunds') and version = 1;
end $$;
