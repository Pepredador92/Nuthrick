# Agenda — checkpoint de implementación (15 septiembre 2026)

## Actualización vigente: reserva, datos básicos y confirmación profesional

Esta sección sustituye las reglas anteriores de alta manual y confirmación inmediata para **nuevas reservas públicas**. Los checkpoints inferiores conservan la evidencia histórica.

- Migración aplicada `20260916015845_agenda_patient_registration.sql`; Edge `agenda` v2 ACTIVE, mismo proyecto `qlsqhvyrslclmlstlemn`. Se conserva autenticación personalizada, verificaciones, permisos y modo de correo de prueba.
- Perfil: eliminado el enlace duplicado «Agendar cita»; costo en un bloque compacto. Días/horas visibles al cargar, con modalidad disponible preseleccionada, pero sin seleccionar una hora por el visitante.
- «Reservar» abre `/p/:slug/agendar/datos`. El estado de navegación contiene únicamente horario/modalidad, nunca información personal, códigos o pruebas. Los datos de formulario permanecen en memoria; cambiar el horario dentro del paso conserva contacto/verificación. No se almacena información personal en localStorage.
- Nombre, nacimiento, correo verificado y WhatsApp con lada. Edad reutiliza `calculateAge`; zona del profesional automática. Sin peso/estatura/sexo ni activación de cuenta/portal. Consentimiento explícito para registrar los datos básicos.
- `agenda_book_registered` envuelve el motor existente dentro de la misma transacción/lock. Crea el paciente con correo verificado y datos básicos; no consultas ni mediciones. Si existe posible coincidencia por correo, teléfono o nombre+nacimiento del mismo profesional, incluso archivada/eliminada, deja `registration_status=review` y **no crea ni vincula automáticamente**. El resultado público no revela la coincidencia ni IDs de pacientes. Una familia puede compartir correo: verificarlo no autoriza acceso al expediente de otra persona.
- Duplicados prevenidos entre reservas serializadas de Agenda. El alta manual de otros módulos no toma este lock; no se promete unicidad global por correo/teléfono, pues pueden compartirse legítimamente.
- Una nueva reserva ocupa horario (`status=confirmed` representa asignación durable para exclusión, `requires_confirmation=true` representa aprobación pendiente). Respuesta pública `pending_confirmation`. La invitación de Google espera la confirmación explícita del dueño; `agenda_confirm_reservation` exige comprobación fresca de Google, es idempotente y no admite otro dueño.
- Agenda privada: distintivo pendiente, enlace WhatsApp, revisión de posible expediente y diálogo «Confirmar y notificar». Confirmar elimina la marca pendiente, encola correo final revisión 2 e invitación Google. Las solicitudes alternativas siguen **sin ocupar horario** hasta aceptación; el registro básico pasa a la cita aceptada.
- Mensaje de reserva: «Tu reserva se registró correctamente» y «Gracias por agendar tu cita. Tu nutriólogo se pondrá en contacto contigo para confirmar tu reserva.» Resumen logístico, confeti CSS breve, sin emojis, desactivado con `prefers-reduced-motion`. El mismo texto se usa en el correo inicial.
- Se serializan correos inicial/final por reserva; un resultado viejo no cambia el estado de la notificación final. Cancelar antes de confirmar no genera invitaciones de Google. Corregida además la variable ambigua `id` de la aceptación directa de solicitudes, encontrada al probar el traslado del registro.
- Verificación: 519 pruebas frontend de regresión correctas, luego 2 pruebas adicionales de registro/modalidad correctas (16 pruebas dirigidas). Typecheck, lint, compilación y Deno check correctos. `test-agenda-registration.mjs` ejecuta regresión SQL + alta/revisión/confirmación/traslado/permisos en transacción revertida. `test-agenda-concurrency.mjs --registration`: dos conexiones reales, un ganador, un solo paciente; reintento y siguiente reserva del mismo correo sin duplicado/vinculación automática. Fixtures exclusivamente locales, no pacientes reales creados.
- Navegador con servicio ficticio aislado: perfil, datos, edad calculada, correo simulado, éxito y confeti verificados. Captura de escritorio sin desbordamientos. El override móvil no cambió el viewport observado; no se declara verificación móvil nueva. Advisors remotos sin nuevas incidencias de seguridad ni FK sin índice; los dos índices nuevos aún no tienen uso, esperable antes de datos.
- Pendiente: repetir el flujo nuevo contra Gmail/Google reales con una prueba autorizada. No se enviaron correos ni se crearon pacientes reales durante esta iteración. Las validaciones reales documentadas abajo corresponden a la versión anterior.

## Estado: publicado para pruebas; reserva y cancelación verificadas; iteración visual del perfil

Aplicadas al proyecto correcto las migraciones `20260916004238_agenda_booking_core.sql`, `20260916004248_agenda_worker_schedule.sql` y `20260916004412_agenda_slot_location_index.sql`. Archivos locales alineados con las versiones asignadas por Supabase remoto. Función `agenda` desplegada, versión 1. Pantallas publicadas con autorización expresa en `https://nuthrick.vercel.app`; versión anterior al ajuste visual `b1b9b5c` (despliegue `dpl_D2xTcCP5SywGFN1bKdWwoJSUEuDa`, READY), incluye fecha inicial IANA. Se publica una copia aislada del commit, sin cambios ajenos de Landing. Verificados HTTP 200 en login/agenda, inicio de sesión original de Google, carga autenticada de Agenda/Configuración y guardado de modalidades. Reserva, correo, evento de Google, reconciliación y cancelación reales verificados con un único contacto ficticio autorizado; el horario quedó libre y no se creó ningún expediente clínico.

El usuario confirmó **susy.asistencia.online@gmail.com** como dirección correcta y destinatario de prueba. Sin dominio propio: sitio `https://nuthrick.vercel.app`, proyecto Supabase **qlsqhvyrslclmlstlemn**. No usar Charry Mary.

Se conservan cambios ajenos previos en `LandingPage.tsx`, `LandingPage.test.tsx` y `output/`; no incluirlos inadvertidamente en un commit/despliegue de Agenda.

## Preparado en código

- Entrada `/p/:slug/agendar` desde el perfil existente y navegación privada `/app/agenda`.
- Selección de horarios, contacto mínimo, código de correo, resumen y confirmación. Sin cuenta de paciente ni datos clínicos. La verificación no utiliza Supabase Auth ni crea usuarios.
- Agenda privada: citas/bloqueos, solicitudes, aceptar/rechazar/contraproponer, vincular explícitamente un paciente propio, cancelar conservando registro, estado independiente de correo y Google.
- Asignación explícita de modalidad/consultorio por intervalo semanal. Solo una opción inequívoca se resuelve automáticamente; un perfil híbrido/multiconsultorio debe asignar sus intervalos.
- Reutiliza disponibilidad, duración y zona IANA. Horizonte máximo separado de anticipación mínima (120 minutos predeterminados, editable). Horarios ofrecidos con separación de una duración de cita, anclados al inicio del intervalo semanal.
- SQL único para confirmar reservas y solicitudes: exclusión GiST `[inicio,fin)` para citas y bloqueos; serialización por profesional; verificaciones y claves de idempotencia durables; sin retenciones al abrir el formulario.
- Datos de contacto originales preservados. `patient_id` nulo por defecto y FK compuesta para impedir vinculación a expedientes de otro profesional. No se consulta el correo para identificar pacientes.
- Solicitudes no ocupan tiempo. Verificación: 10 minutos y máximo 6 intentos. Prueba de correo: 15 minutos, un uso. Solicitudes: 72 horas o inicio, lo primero. Contrapropuestas: 48 horas o inicio, lo primero; revisión invalida enlaces anteriores.
- Tokens de respuesta aleatorios de 256 bits, hash en BD, fragmento de URL eliminado al abrir, POST explícito para decidir. Apertura sin efectos de aceptación; reintento de la misma decisión devuelve resultado previo.
- OAuth separado para Gmail (solo enviar + identidad del remitente) y Calendar (lista, eventos y libre/ocupado). PKCE, estado de un uso/10 minutos y credenciales cifradas AES-GCM en esquema privado.
- Google libre/ocupado falla de forma cerrada, incluidos errores por calendario dentro de respuestas HTTP 200. Autorización de confirmación dura 30 segundos y queda vinculada a la revisión de conexión.
- Outbox transaccional. ID de evento determinista válido para Google (`n` + UUID sin guiones); invitaciones `sendUpdates=all`, contenido logístico, ningún expediente o token privado. Recuperación por ID; no modifica eventos cuya marca de propiedad no coincide.
- Gmail no ofrece idempotencia de envío: una respuesta perdida/5xx queda `unknown`, sin reenvío automático que pudiera duplicarlo. Las citas se conservan aunque la notificación falle. Este límite es deliberado, no una promesa de entrega exactamente una vez.
- RLS en todas las tablas nuevas. Navegador autenticado solo lee filas propias; visitantes sin acceso directo. RPC de mutación y acceso privado solo `service_role`, `SECURITY INVOKER`; la función obtiene el actor con `Auth.getUser`, nunca del cuerpo del navegador.
- Límites de API por IP, de correo por dirección y global; no se registran cuerpos, códigos, tokens o respuestas privadas de proveedores.
- Resolución autenticada de horas para bloqueos y contrapropuestas, incluso con perfil privado. Corregida ambigüedad SQL de la variable del generador de horas; validación temprana de consultorios propios mediante FK compuesta.
- Recuperación de trabajos interrumpidos con número de intento: una respuesta antigua no sobrescribe un intento nuevo; inserción/cancelación de un mismo evento se procesan en orden. Incertidumbre de envío de correo preservada.
- Reconciliación de citas futuras con Google: detecta eventos movidos/eliminados y cruces externos sin modificar eventos ajenos ni leer títulos/asistentes. Revisión asociada a la versión de conexión, tiempo máximo compartido entre páginas/calendarios y aviso visible al profesional. Worker periódico activo y verificado.
- Diálogos nativos con Escape y restauración de foco. Alta de paciente reutiliza el formulario existente con contacto precargado; crear el expediente no lo vincula automáticamente: requiere pulsar Vincular.

## Estados

| Registro/estado | Actor siguiente | Ocupa tiempo |
| --- | --- | --- |
| Verificación pendiente | Contacto: código válido; sistema: expira | No |
| Solicitud pendiente del profesional | Dueño: acepta, rechaza o propone | No |
| Pendiente del solicitante | Token vigente: acepta o rechaza; dueño: sustituye/rechaza | No |
| Confirmada | Dueño: cancela/vincula expediente | Sí |
| Rechazada/cancelada/vencida | No se puede aceptar | No |

Las expiraciones se validan al ejecutar, aunque el trabajo de limpieza esté retrasado. Aceptar una solicitud fuera del horario semanal requiere una excepción explícita del dueño; una contrapropuesta del dueño autoriza ese horario concreto. Nunca omite la protección contra solapamientos ni Google.

## Dependencias externas y activación pendiente

1. **Google Cloud:** el usuario proporcionó el ID y secreto del nuevo cliente de Agenda. El 16 septiembre 2026, 00:18 UTC se guardaron `AGENDA_GOOGLE_CLIENT_ID` y `AGENDA_GOOGLE_CLIENT_SECRET` en Edge Function Secrets del proyecto **qlsqhvyrslclmlstlemn**; se verificaron ambas filas y la fecha de actualización en Supabase. No se guardaron valores en el repositorio. La credencial fue compartida por el usuario en el chat: se recomendó reemplazar el secreto antes de activar producción. No modificar/eliminar los dos secretos ni el callback del cliente existente **Nuthrick Web** que usa Supabase Auth. Mantener las pestañas abiertas.
2. Redirect preparado: `https://qlsqhvyrslclmlstlemn.supabase.co/functions/v1/agenda/oauth/callback`.
3. ID/secreto de Agenda ya están almacenados en secretos de Edge Functions, nunca en `VITE_*`, código o frontend. Gmail API y Google Calendar API habilitadas y verificadas en Google Cloud; el usuario aprobó ambas y aceptó expresamente los términos de Calendar. Agregada y verificada únicamente **susy.asistencia.online@gmail.com** como usuario de prueba tras su autorización. Google continúa en modo Prueba y muestra configuración de marca pendiente; no se publicó la aplicación OAuth. Callback verificado en el campo URI del cliente **Nuthrick Agenda**. Usuario aprobó continuar tras aviso de app no verificada y conceder separadamente gmail.send y permisos de Calendar; ambos consentimientos ya completados.
4. Guardadas y verificadas `AGENDA_ENCRYPTION_KEY` y `AGENDA_WORKER_SECRET` en Edge Secrets el 16 septiembre a las 00:40:18 UTC, generadas con 32 bytes criptográficos cada una tras autorización explícita. Copia de la clave worker guardada como `agenda_worker_secret` en Vault; valores nunca impresos ni escritos en archivos. Variables temporales retiradas tras verificar. Sitio/remitente/admin usan sus valores predeterminados correctos. `AGENDA_EMAIL_MODE` ausente mantiene modo de prueba: **solo** permite enviar al remitente autorizado. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` son exclusivamente de servidor.
5. La conexión de correo está restringida al usuario autenticado cuyo correo verificado coincide con `AGENDA_MAIL_ADMIN_EMAIL`. Comprobar que sea la cuenta administradora correcta antes de la autorización. Para otra cuenta administradora se necesita elección explícita, no usar metadata editable como autorización.
6. Migraciones aplicadas y función desplegada con autenticación propia: código/prueba/token para mutaciones públicas, JWT comprobado para operaciones del profesional y secreto para worker. Verificación real: todas las tablas nuevas con RLS; anon no puede ejecutar reservas directamente, authenticated no puede ejecutar gestión directamente ni leer Vault. Ambas rutas privadas sin autorización devuelven HTTP 401. Advisors sin nuevas advertencias de seguridad de Agenda; nueve avisos informativos de RLS sin políticas en tablas privadas son deliberados (solo servidor). Corregido el índice de la FK compuesta y confirmado que desapareció el aviso.
7. Gmail conectado tras consentimiento explícito del usuario y de Google; verificado token cifrado y mensaje «Remitente conectado». Calendar conectado tras aprobación explícita de lista/disponibilidad/gestión de eventos. Seleccionado exclusivamente el calendario principal de susy, llamado **NUTRI-ACTIVIDADES**, para consultar ocupación y crear citas; verificado `active=true`. No se seleccionaron calendarios secundarios. No confundir esto con el acceso con Gmail existente.
8. Programación durable instalada con pg_cron/pg_net y secreto desde Vault. Trabajo `nuthrick-agenda-worker` **activo cada minuto** después de verificar el flujo real de reserva y cancelación. Primera ejecución programada verificada el 16 septiembre 2026 a las 01:06 UTC: `succeeded`, respuesta HTTP 200, sin timeout ni error. Invocación manual previa también verificó la reconciliación de la cita real de prueba contra Google. `waitUntil` acelera envíos; no sustituye la tarea periódica.
9. Completar pruebas reales únicamente con datos ficticios y **susy.asistencia.online@gmail.com**. No pasar `AGENDA_EMAIL_MODE` a producción sin verificar los envíos y permisos. El botón y formulario están publicados para pruebas con esa restricción de correo.

## Último punto del flujo real

El perfil `/p/jose-olmedo` tiene dos modalidades y sus intervalos semanales estaban sin asignar; por eso no ofrecía horarios. El usuario eligió **Nutrición Clínica** para viernes 09:00–19:00 y sábado 09:00–14:00, conservando citas de 30 minutos. Asignaciones guardadas mediante UI y verificadas en BD. Formulario público muestra horarios reales del 18 y 19 de septiembre.

Completado el flujo de reserva ficticia **viernes 18 septiembre 2026, 09:00–09:30 America/Mexico_City**, contacto **Prueba técnica de Agenda — no es paciente**, correo autorizado. El usuario proporcionó el código, se verificó y se confirmó mediante UI. La pantalla pública mostró «Tu cita quedó agendada» y la privada mostró correo enviado y Google sincronizado. Registro `a1a233ad-16c5-4bb5-a870-b90a9d178ef8`, `patient_id=null`: no se creó ni vinculó expediente clínico. Gmail y Google aceptaron respectivamente confirmación e inserción, ambos en un intento, sin errores. La reconciliación posterior confirmó el evento sin conflictos (`calendar_checked_at=2026-09-16T01:04:56.50084Z`).

Después se canceló exclusivamente esa cita ficticia mediante el diálogo de Agenda, conservando su registro. Google aceptó la cancelación y Gmail aceptó el aviso, ambos en un intento y sin errores. Estado final `cancelled`, `patient_id=null`; ya no aparece como cita activa. Al recargar el formulario público, **viernes 18 a las 09:00 vuelve a estar disponible**. No se guardó el código de verificación en archivos. Aceptación por Gmail no equivale a garantizar entrega en bandeja de entrada; no se leyó el buzón.

Corregida y publicada la fecha inicial de la vista pública: después de conocer la zona IANA se inicia en el día del profesional, no en UTC; nunca sobrescribe fechas elegidas después por el visitante. Prueba específica correcta, typecheck y lint correctos. Vercel verificó además tres rutas SSR en aislamiento. La instalación reportó vulnerabilidades en dependencias preexistentes; no se ejecutó una actualización forzada ajena al alcance.

## Trabajo todavía necesario antes de declarar terminado el objetivo

- La programación y una reconciliación contra Google real ya están verificadas. Falta ensayar conflictos provocados externamente con eventos sintéticos; no existe atomicidad distribuida con Google.
- Reintentos y recuperación operativa probados localmente; falta ensayar fallos reales controlados entre proveedor y persistencia y cancelación concurrente con inserción de evento. No afirmar entrega de correo ni presencia en calendario personal del paciente.
- Añadir paginación/filtros de agenda más allá de las primeras 500 filas. Foco/Escape y regreso al flujo de alta/vinculación implementados; comprobar además interacción nativa en navegador.
- Probar internamente cambios de perfil/modalidad/disponibilidad y duración mientras se reserva; no ampliar el alcance al Taller de dietas.
- Revisar los extremos de medianoche, solicitud sin horarios semanales y zonas con desfases no enteros; el motor usa instantes UTC e IANA, no offsets fijos.
- Ejecutar los 14 escenarios de aceptación contra Supabase real, RLS y Google configurado; ver documento original del usuario.

## Verificación local realizada

### Iteración visual del perfil (15 septiembre, después de la prueba real)

- Publicada la versión `2401f26` en `https://nuthrick.vercel.app`, despliegue `dpl_2KEuoq3vsXPvnjfwPhB7Q8rSyWhW` READY. Construcción Vercel y comprobaciones SSR aisladas correctas. Publicación desde archivo aislado de Git, sin cambios pendientes de Landing.
- `PublicBookingPanel` reutilizado dentro de `/p/:slug` y en la subruta `/p/:slug/agendar`. No existe un segundo motor ni se cambiaron los permisos/RPC/OAuth; sin nuevas migraciones ni cambios en el Taller de dietas.
- Panel a la derecha en escritorio y debajo de la presentación en móvil. El enlace superior «Agendar cita» conduce al panel aunque no haya teléfono o correo público. Se conserva la información del perfil, contactos y ubicaciones; el precio aproximado aparece una sola vez, sin pagos/suscripciones.
- Modalidades en tarjetas, días disponibles en una fila desplazable, horarios de un solo día, navegación semanal y fecha limitada al horizonte. Los horarios extensos tienen su propio desplazamiento vertical.
- En el panel integrado, captura de contacto solo después de elegir horario y continuar. Regresar conserva nombre, correo y verificación; cambiar de día o modalidad retira la selección anterior. Foco de teclado restaurado al cambiar de paso. La confirmación final y los estados de solicitud permanecen diferenciados.
- 518 pruebas correctas en 63 archivos (excluyendo únicamente el cambio previo de Landing), typecheck/lint y compilación correctos. Nuevas pruebas: integración sin contactos públicos, fecha/modalidad sin selección obsoleta, datos conservados al regresar, falta de disponibilidad y Google inaccesible.
- Vista aislada con datos sintéticos y **sin llamadas a Supabase, Google ni correo**, usando `public-agenda.vite.config.ts`. Navegador: flujo completo hasta confirmación, fecha modificada y contacto conservado; sin desbordamiento de página en 320, 390, 768 y 1440 px. La fila de días se desplaza internamente en pantallas pequeñas.

### Motor y regresión anteriores

- `node scripts/test-agenda-db.mjs`: fixtures sintéticos, transacción revertida; horarios, perfil privado, uso/intentos de código, idempotencia y reutilización, exclusión y citas consecutivas, contacto preservado, vinculación ajena rechazada, fallo de notificación sin perder cita, Google sin permiso fresco bloqueado, solicitudes, revisiones/tokens, DST y lectura RLS ajena.
- `npx deno check --config supabase/functions/agenda/deno.json supabase/functions/agenda/index.ts`.
- Compilación frontend correcta después de reconciliación, diálogos y reutilización del alta de pacientes (15 septiembre, 18:38 hora local). Typecheck y lint correctos después de corregir una opción de la prueba privada incompatible con los tipos de Testing Library.
- 7 pruebas de cifrado, hash de códigos, entradas, libre/ocupado e IDs de eventos; 5 pruebas de pantalla/confirmación/contacto conservado/reintento/apertura segura del enlace.
- Suite de regresión final: **513 pruebas correctas en 62 archivos**, excluyendo `LandingPage.test.tsx`, que tenía un cambio ajeno previo. Ejecutada el 15 septiembre a las 19:05 hora local, incluyendo la corrección de fecha pública. Incluye 3 pruebas privadas: resolver horarios sin slug, cancelar diálogo sin cancelar cita y alta explícita seguida de vinculación separada. No afirmar que el test de Landing se arregló.
- `node scripts/test-agenda-concurrency.mjs`: dos procesos SQL simultáneos reales, un solo ganador y un solo trabajo de confirmación, reintento idempotente tras pérdida de respuesta. Base/roles sintéticos desechables eliminados por el propio test; no se tocaron datos de usuarios.
- SQL ampliado: ubicación de otro profesional rechazada, reclamación de trabajos vencidos, respuestas antiguas ignoradas, cancelación detrás de inserción, reconciliación y rechazo de comprobaciones con conexión obsoleta.
- Advisors remotos revisados antes y después de desplegar. Ninguna nueva advertencia de seguridad de Agenda. Índice de FK compuesta corregido y verificado; índices nuevos sin uso son esperables sin datos. No se modificaron otros módulos por incidencias preexistentes.
- `frontend/tests/visual/agenda-check.mjs`: flujo sintético sin correo ni BD, 320/390/768/1440 px sin desbordamientos/errores de ejecución. Capturas en `output/agenda-preview/`.

Fuentes técnicas revisadas: [Supabase Edge Functions](https://supabase.com/docs/guides/functions), [Google OAuth servidor](https://developers.google.com/identity/protocols/oauth2/web-server), [Google libre/ocupado](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [insertar eventos](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Gmail envío](https://developers.google.com/workspace/gmail/api/guides/sending). Revisar las restricciones de publicación actuales al configurar Google.
