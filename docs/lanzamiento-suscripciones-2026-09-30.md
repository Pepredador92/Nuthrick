# Preparación de venta de suscripciones — 30 de septiembre de 2026

## Decisión confirmada

El usuario decidió aplazar el video y la revisión de permisos sensibles de Google. El lanzamiento no anunciará Agenda, Calendar ni correo Gmail como beneficios para todos los profesionales. La conexión personal existente y las funciones del producto se conservan; el correo interno de pagos sigue siendo un requisito operativo.

Se confirmó usar los dos planes actuales de Administración:

| Plan | Mensual | Anual |
| --- | ---: | ---: |
| Esencial | $349 MXN | $3,490 MXN |
| Profesional | $499 MXN | $4,990 MXN |

Son los valores leídos del catálogo de producción en esta fecha. No se sustituyó el catálogo por los tres planes de referencia del landing ni se crearon precios nuevos en Stripe.

## Precio público y precio de cobro

- El landing consulta `plan_catalog` con acceso público, igual que `/planes`, y muestra nombre, precio mensual, importe anual y capacidad de pacientes. Se retiró el archivo con los tres precios fijos de marketing.
- La página se renderiza por solicitud y la consulta no conserva una caché de precios. Una pestaña ya abierta necesita volver a cargar para ver una edición administrativa.
- Si el servicio público no responde, el landing muestra un enlace al catálogo sin inventar ni conservar precios antiguos. El contacto también se lee de la configuración pública vigente.
- Se retiraron las menciones a Agenda y automatizaciones de comunicación del landing y el beneficio Agenda de `/planes`. La ilustración principal muestra expedientes.
- Guardar un plan ejecuta `admin_api/save_plan`; ese paso no llama a Stripe. `sync_prices` o el inicio de Checkout llaman a `ensurePrice` después de resolver importe, moneda, intervalo y entorno en el servidor.
- Cada importe tiene un mapping propio. Una edición de precio afecta nuevas contrataciones; las suscripciones existentes conservan su mapping. Una sesión Checkout ya abierta tampoco se modifica silenciosamente: el sistema exige resolver la sesión pendiente si cambia la selección/precio.
- Los entornos TEST y Live mantienen sus precios y credenciales separados. El sistema rechaza nuevas operaciones Live si sus controles están pendientes. No existe una garantía de cobro Live por el mero hecho de guardar un precio en Administración.

## Verificaciones y pendientes

- Lectura con rol `anon`: catálogo comercial y contacto públicos disponibles; planes internos fuera del catálogo.
- Pruebas de catálogo, fallo de servicio, cambio de precio entre solicitudes, HTML público y regresión de billing: 21 aprobadas. TypeScript, ESLint focal y build Vercel con smoke SSR aislado aprobados.
- Publicado en `main` mediante `73eef22`; Vercel del proyecto `nuthrick` confirmó despliegue satisfactorio. Se comprobó en `https://nuthrick.com/#precios` la presencia de los dos planes, sus cuatro importes, límites de pacientes, enlaces al plan correspondiente y contacto `hola.nuthrick@gmail.com`. El landing ya no anuncia Agenda, Calendar ni correo Gmail. El proyecto Vercel heredado `frontend` sigue informando fallo separado y no sirve el dominio oficial.
- Readiness final: **15 listos, 0 pendientes, 0 bloqueados**. El correo comercial está operativo desde `2026-09-30T06:28:36.993461Z`. El control adicional `live_email` también está listo; el checkout Live sigue deshabilitado.
- Con confirmación explícita para continuar ante el aviso de app no verificada, se renovó el remitente a las `06:19:16Z`. Google mostró únicamente los accesos existentes de identidad y envío. La aceptación legal de la cuenta ya permite entrar en Agenda.
- Stripe Live: cuenta Nuthrick identificada al salir de su sandbox. El Dashboard lleva al proceso de activación; verificación del negocio y banco figuran sin completar. La pantalla propone reutilizar información de otro negocio. No se seleccionó ni confirmó esa reutilización.
- Preparación y checkout Live siguen cerrados; no hay credenciales Live configuradas ni precios/webhook/Portal Live verificados. No se ejecutó ningún cargo.
- El titular debe completar los datos de activación de la cuenta Stripe y su banco. Después procede configurar credenciales por un canal seguro, sincronizar los cuatro precios confirmados, verificar webhook y Portal, y preparar un único pago piloto con importe y cuenta explícitos, incluida la comprobación de su correo real.

## Cierre del correo operativo

- Google Cloud confirmó el proyecto `nuthrick` **En producción**, con 2 usuarios de OAuth de un máximo de 100 para permisos sin revisar. El video y la aprobación de permisos sensibles siguen pendientes. Esta evidencia cubre el remitente interno; no acredita la disponibilidad general de Calendar/Gmail para profesionales ni garantiza que Google nunca revoque un token.
- El worker del servidor verificó la nueva autorización a las `06:21:03Z`. Se enviaron cinco pruebas explícitas a la bandeja autorizada. Las cinco fueron aceptadas en el primer intento y recibidas en INBOX entre `06:22:22Z` y `06:22:25Z`.
- Se cotejaron From/Reply-To, destinatario, asuntos, cuerpo HTML recibido con el mensaje preparado (Google retiró únicamente el doctype), enlaces `nuthrick.com` y resultados SPF/DKIM/DMARC. La evidencia privada `mail_oauth_continuity` conserva los comprobantes sin credenciales; las observaciones se atribuyen a Codex, sin simular aprobación manual del usuario.
- Al activar desde Operaciones se detectó y reprodujo un conflicto PL/pgSQL entre la variable `s` y el alias de las consultas de evidencia. Se corrigió mediante `20260930062830_email_operational_activation_alias.sql`. Se preservaron las comprobaciones de legal, revisión del remitente y pruebas comerciales.
- El control Live todavía dependía de `email_verified_at`, un marcador antiguo sin escritor, y describía siempre el proveedor como TEST. `20260930063154_live_email_operational_readiness.sql` lo conecta con la misma evidencia operativa vigente que usa PRE-LIVE. Al pausar o perder esa evidencia vuelve a pendiente.
- Pasó el arnés local de migraciones y regresiones de suscripciones/créditos/correo. Se añadieron casos que rechazan evidencia faltante o remitente distinto, prueban la activación con evidencia completa, la pausa y ambos estados del control Live. La activación de correo no habilita Checkout Live.
- Verificación final: correo `operational`, readiness 15/15, control `live_email` listo y job periódico correcto a las `06:30:01Z`, sin errores ni mensajes pendientes. Se procesan únicamente eventos nuevos posteriores a la activación; no se liberó el historial.

La propuesta de retención al cancelar y el borrado de pacientes no forman parte de este cambio. El video OAuth continúa pendiente; no se presenta como enviado o aprobado.
