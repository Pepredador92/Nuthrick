# Preparación de venta de suscripciones — 30 de septiembre de 2026

## Decisión confirmada

El usuario decidió aplazar el video y la revisión de permisos sensibles de Google. El lanzamiento no anunciará Agenda, Calendar ni correo Gmail como beneficios para todos los profesionales. La conexión personal existente y las funciones del producto se conservan; el correo interno de pagos sigue siendo un requisito operativo.

Se confirmó usar los dos planes actuales de Administración:

| Plan | Mensual | Anual |
| --- | ---: | ---: |
| Esencial | $349 MXN | $3,490 MXN |
| Profesional | $499 MXN | $4,990 MXN |

Son los valores leídos del catálogo de producción en esta fecha. Los cuatro precios se crearon y verificaron en Stripe Live; el catálogo conserva los dos planes aprobados de Administración.

## Precio público y precio de cobro

- El landing consulta `plan_catalog` con acceso público, igual que `/planes`, y muestra nombre, precio mensual, importe anual y capacidad de pacientes. Se retiró el archivo con los tres precios fijos de marketing.
- La página se renderiza por solicitud y la consulta no conserva una caché de precios. Una pestaña ya abierta necesita volver a cargar para ver una edición administrativa.
- Si el servicio público no responde, el landing muestra un enlace al catálogo sin inventar ni conservar precios antiguos. El contacto también se lee de la configuración pública vigente.
- Se retiraron las menciones a Agenda y automatizaciones de comunicación del landing y el beneficio Agenda de `/planes`. La ilustración principal muestra expedientes.
- Guardar un plan ejecuta `admin_api/save_plan`; ese paso no llama a Stripe. `sync_prices` o el inicio de Checkout llaman a `ensurePrice` después de resolver importe, moneda, intervalo y entorno en el servidor.
- Cada importe tiene un mapping propio. Una edición de precio afecta nuevas contrataciones; las suscripciones existentes conservan su mapping. Una sesión Checkout ya abierta tampoco se modifica silenciosamente: el sistema exige resolver la sesión pendiente si cambia la selección/precio.
- Los entornos TEST y Live mantienen sus precios y credenciales separados. El sistema rechaza nuevas operaciones Live si sus controles están pendientes. No existe una garantía de cobro Live por el mero hecho de guardar un precio en Administración.

## Verificaciones y pendientes

- **Actualización posterior al piloto:** un pago Live de $349 MXN confirmado, Esencial activo, 10 créditos asignados y correos de activación/pago recibidos en Gmail. Renovación cancelada al vencimiento; devolución total preparada en Stripe, todavía sin ejecutar. Nuevos checkouts cerrados tras el único pago autorizado. Los detalles cronológicos están al final.
- Lectura con rol `anon`: catálogo comercial y contacto públicos disponibles; planes internos fuera del catálogo.
- Pruebas de catálogo, fallo de servicio, cambio de precio entre solicitudes, HTML público y regresión de billing: 21 aprobadas. TypeScript, ESLint focal y build Vercel con smoke SSR aislado aprobados.
- Publicado en `main` mediante `73eef22`; Vercel del proyecto `nuthrick` confirmó despliegue satisfactorio. Se comprobó en `https://nuthrick.com/#precios` la presencia de los dos planes, sus cuatro importes, límites de pacientes, enlaces al plan correspondiente y contacto `hola.nuthrick@gmail.com`. El landing ya no anuncia Agenda, Calendar ni correo Gmail. El proyecto Vercel heredado `frontend` sigue informando fallo separado y no sirve el dominio oficial.
- Readiness final: **15 listos, 0 pendientes, 0 bloqueados**. El correo comercial está operativo desde `2026-09-30T06:28:36.993461Z`. El control adicional `live_email` también está listo; el checkout Live se habilitó exclusivamente para la cuenta piloto autorizada.
- Con confirmación explícita para continuar ante el aviso de app no verificada, se renovó el remitente a las `06:19:16Z`. Google mostró únicamente los accesos existentes de identidad y envío. La aceptación legal de la cuenta ya permite entrar en Agenda.
- Stripe Live: la API confirmó la cuenta Nuthrick `acct_1UJP0IDDGKbaZsh7`, país MX, moneda MXN, nombre comercial Nuthrick, descriptor NUTHRICK, pagos y transferencias activos, datos completos y ningún requisito pendiente. No se reutilizaron datos de otro negocio ni se atribuye a Codex la activación comercial.
- Preparación Live habilitada; credenciales en Vault y precios/webhook/Portal Live verificados. Checkout está limitado a la allowlist de una cuenta y no se ejecutó ningún cargo.
- El usuario autorizó un piloto separado con `hola.nuthrick+piloto@gmail.com`, Esencial mensual a $349 MXN. La cuenta confirmó su correo y completó el perfil; el usuario aceptó Términos v2 y Privacidad v2. Falta el pago manual del titular. No se ha abierto la venta general.

## Cierre del correo operativo

- Google Cloud confirmó el proyecto `nuthrick` **En producción**, con 2 usuarios de OAuth de un máximo de 100 para permisos sin revisar. El video y la aprobación de permisos sensibles siguen pendientes. Esta evidencia cubre el remitente interno; no acredita la disponibilidad general de Calendar/Gmail para profesionales ni garantiza que Google nunca revoque un token.
- El worker del servidor verificó la nueva autorización a las `06:21:03Z`. Se enviaron cinco pruebas explícitas a la bandeja autorizada. Las cinco fueron aceptadas en el primer intento y recibidas en INBOX entre `06:22:22Z` y `06:22:25Z`.
- Se cotejaron From/Reply-To, destinatario, asuntos, cuerpo HTML recibido con el mensaje preparado (Google retiró únicamente el doctype), enlaces `nuthrick.com` y resultados SPF/DKIM/DMARC. La evidencia privada `mail_oauth_continuity` conserva los comprobantes sin credenciales; las observaciones se atribuyen a Codex, sin simular aprobación manual del usuario.
- Al activar desde Operaciones se detectó y reprodujo un conflicto PL/pgSQL entre la variable `s` y el alias de las consultas de evidencia. Se corrigió mediante `20260930062830_email_operational_activation_alias.sql`. Se preservaron las comprobaciones de legal, revisión del remitente y pruebas comerciales.
- El control Live todavía dependía de `email_verified_at`, un marcador antiguo sin escritor, y describía siempre el proveedor como TEST. `20260930063154_live_email_operational_readiness.sql` lo conecta con la misma evidencia operativa vigente que usa PRE-LIVE. Al pausar o perder esa evidencia vuelve a pendiente.
- Pasó el arnés local de migraciones y regresiones de suscripciones/créditos/correo. Se añadieron casos que rechazan evidencia faltante o remitente distinto, prueban la activación con evidencia completa, la pausa y ambos estados del control Live. La activación de correo no habilita Checkout Live.
- Verificación final: correo `operational`, readiness 15/15, control `live_email` listo y job periódico correcto a las `06:30:01Z`, sin errores ni mensajes pendientes. Se procesan únicamente eventos nuevos posteriores a la activación; no se liberó el historial.

## Clave Live de integración

- El usuario autorizó crear y almacenar la clave en Vault. Stripe completó la verificación de identidad por correo y SMS y emitió «Nuthrick Billing Live». El secreto `nuthrick_billing_stripe_live` quedó guardado a las `07:21:44Z`, con clave restringida, firma del webhook, entorno y cuenta esperada; no contiene credenciales TEST.
- «Nuthrick Billing Live» limita la escritura a clientes, productos, precios, cupones, facturas, suscripciones, Checkout, Customer Portal y webhooks. Cuenta, eventos, cargos/reembolsos, disputas, intentos y métodos de pago quedan en lectura. No concede transferencias, emisión de tarjetas ni cambios de cuentas bancarias. Las llamadas reales de creación y consulta confirmaron los permisos necesarios para preparar la integración; el pago y el reembolso siguen pendientes.
- Stripe recomienda claves restringidas para nuevas integraciones: [API keys](https://docs.stripe.com/keys). El servidor y `20260930065315_live_stripe_restricted_key.sql` aceptan `rk_live_` además del formato existente, conservando la cuenta esperada, Legal, PRE-LIVE y el aislamiento de entornos. No se cambiaron permisos SQL ni el checkout.
- Verificación: 53 pruebas Deno aprobadas, typecheck/lint y arnés SQL Live (incluidas ocho entregas de webhook y ocho jobs concurrentes). La regresión de credenciales comprueba rechazo de claves TEST, públicas, de organización, incompletas y de otra cuenta, además de acceso denegado al navegador y la conservación del control legal.
- Migración aplicada y Edge Function `billing` v7 desplegada. Tras configurar Live y registrar la autorización del piloto: PRE-LIVE 15/15 y controles Live 11/11; checkout cerrado, cero pagos y cero suscripciones Live. Readiness no equivale a un cobro piloto completado.

## Integración Live verificada

- Webhook `we_1ULHp7DDGKbaZsh7Qt5VD7ib`: endpoint `/functions/v1/billing/webhook/live` del proyecto, API `2026-08-26.dahlia`, 27 eventos que maneja billing y dos eventos de catálogo para comprobar entrega firmada sin cobrar.
- Se recibieron los seis eventos reales de creación de productos/precios, con `livemode=true` y `pending_webhooks=0`. El servidor verificó la firma a las `07:23:29Z`; no se utilizó una firma fabricada localmente. Ejemplo de evidencia: `evt_1ULHrPDDGKbaZsh7ll2csGAn` (`price.created`).
- Portal `bpc_1ULHp8DDGKbaZsh7GEdOv0wG`: actualización de método de pago, facturas, nombre/dirección y cancelación al final del período. Cambios de plan deshabilitados en Portal; retorno y legales en `nuthrick.com`.
- El operador ejecutó el proveedor del repositorio (`StripeBillingProvider`) contra la API Live y los RPC de billing mediante el conector autorizado de Supabase. Se conservaron guardas, mappings, bloqueo y auditoría; no se simuló una sesión ni se escribió una fecha de verificación inventada. `inspectConfiguration` confirmó los cuatro precios, endpoint, Portal y conciliación sin discrepancias, registrada a las `07:23:59Z`.
- Esencial anual: `price_1ULHrNDDGKbaZsh75iqcgZWw`; mensual: `price_1ULHrNDDGKbaZsh7Ywwecbu3`. Profesional anual: `price_1ULHrODDGKbaZsh7w4EmLtKN`; mensual: `price_1ULHrPDDGKbaZsh7nVHN1UZK`.
- El panel distingue integración Live configurada de Checkout Live cerrado/limitado a cuentas autorizadas. Cuatro pruebas de interfaz, TypeScript, ESLint focal y build aprobados.
- Las copias temporales de la clave y firma fueron eliminadas tras comprobar que Vault conserva las credenciales válidas. Las evidencias guardadas contienen únicamente identificadores, estados e importes.

## Siguiente control: un pago piloto

1. Cuenta piloto creada por invitación de Supabase a las `07:28:03Z`, profesional `7193f80b-cd72-4388-99aa-0e67d8893a2c`. Correo confirmado a las `07:40:56Z`, perfil completo y aceptación del usuario de Términos v2 y Privacidad v2 registrada a las `07:43:09Z`. No tiene rol administrador ni pacientes.
2. La allowlist contiene únicamente ese profesional, con autorización y motivo registrados. Checkout se habilitó después de comprobar correo confirmado, perfil completo, aceptación legal vigente, PRE-LIVE 15/15 y controles Live 11/11. La verificación posterior confirmó entorno Live para el piloto y TEST para el administrador; se registró auditoría atribuida a la operación de Codex autorizada por el usuario.
3. Preparar Esencial mensual: $349 MXN, sin promoción. El usuario introduce la tarjeta y confirma el pago recurrente en Stripe; Codex no ejecuta el cobro final.
4. Verificar una única sesión pagada, factura, webhook idempotente, acceso Esencial, límites y correo real recibido. Conciliar Stripe con Nuthrick.
5. Cancelar la renovación y realizar el reembolso controlado con la autorización correspondiente, comprobando su reflejo en la aplicación y correo. No borrar pacientes ni expedientes.
6. Cerrar el piloto y autorizar por separado la apertura comercial a los primeros usuarios. Las verificaciones operativas caducan a las 24 horas y deben refrescarse si la prueba se posterga.

La propuesta de retención al cancelar y el borrado de pacientes no forman parte de este cambio. El video OAuth continúa pendiente; no se presenta como enviado o aprobado.

## Retorno de invitaciones y aviso del piloto

- La invitación del Dashboard regresó a Site URL (`/`) con la sesión en el fragmento. El landing público se renderiza fuera del cliente autenticado y no procesaba ese retorno. Se recuperó la sesión existente llevando el fragmento a `/auth/callback`, sin volver a invitar ni exponer credenciales.
- El landing ahora reconoce retornos de autenticación y los dirige a rutas locales fijas: `/auth/callback` o `/reset-password` para recuperación. Conserva el fragmento en el navegador, evita contabilizarlo como visita comercial y no cambia los anclajes normales del landing. Un callback sin sesión muestra opciones para recuperar acceso en vez de un indicador de carga permanente.
- Checkout muestra la advertencia de tarjeta de prueba solamente en TEST. En Live informa cobro real y renovación mensual/anual; mientras consulta el entorno no afirma que sea TEST.
- Verificación local: 19 pruebas aprobadas (retorno de Auth, facturación y landing), TypeScript, ESLint focal y build. El pago real todavía está pendiente.
- El cambio `5a7fcfc` quedó en `main` y Vercel `nuthrick` confirmó el despliegue. La comprobación de `/planes` encontró además una frase fija que describía toda contratación como prueba: se retiró, conservando el aviso de IA no disponible. Mi plan espera a conocer el entorno antes de mostrar su aviso. Las 13 pruebas de catálogo/facturación, TypeScript y ESLint focal aprobaron esta corrección adicional.

## Pago piloto confirmado y devolución pendiente

- El usuario completó el pago en Stripe a las `07:55:04Z`. Nuthrick registra una sesión Live completada, una suscripción y un único pago de **34900 centavos MXN**, mensual, sin promoción. Factura `in_1ULILzDDGKbaZsh7golD2V28` (`90K0OBFC-0001`); suscripción `sub_1ULIM2DDGKbaZsh79Zl6crFX`.
- El Dashboard de Stripe confirmó Esencial, $349 MXN/mes, factura pagada y período del 30 de septiembre al 30 de octubre. Los metadatos identifican al profesional piloto correcto. El usuario utilizó `hola.nuthrick@gmail.com` como correo de facturación en Checkout; los avisos propios de Nuthrick siguen dirigidos al alias de la cuenta piloto.
- Los eventos `payment_intent.succeeded`, `customer.subscription.created` e `invoice.paid` se procesaron sin error, una vez cada uno. La aplicación mostró Esencial activo, límite de 30 pacientes y 10 créditos incluidos; OpenAI no se activó. Esta comprobación del Dashboard se documenta aparte y no sustituye artificialmente la fecha de la inspección remota automatizada anterior.
- El worker real aceptó `subscription_activated` y `payment_confirmed` al primer intento. Se comprobó en Gmail la etiqueta **Recibidos** de ambos mensajes a las `07:57Z`, con importe de $349 MXN en el aviso de pago. Se despachó manualmente el mismo worker de producción después de que el cron de `07:55` hubiera pasado antes del pago; no se generaron avisos duplicados ni simulados.
- Se canceló la renovación desde Mi plan como parte del cierre del piloto. Stripe emitió `customer.subscription.updated`, procesado a las `07:58:26Z`; `cancel_at_period_end=true`. La UI confirmó acceso pagado hasta el 30 de octubre y conservación de datos. El aviso `cancellation_scheduled` quedó en la cola normal, sin errores al momento de esta comprobación.
- Tras confirmar el único pago se cerraron nuevos checkouts, manteniendo preparación Live y procesamiento de eventos. La allowlist sigue conteniendo únicamente al piloto. PRE-LIVE conserva 15/15. No se ha abierto la venta general.
- El Dashboard tiene preparada la devolución **total de $349 MXN**, motivo «Otro», nota de cierre del piloto. **Codex no pulsó el botón final de reembolso**: el usuario debe ejecutarlo. Stripe informa que las comisiones originales no se devuelven y que el abono puede tardar de cinco a diez días en aparecer en el extracto. Falta comprobar evento de reembolso, reflejo local y correo antes de declarar cerrado el piloto.
- Evidencia local fuera de Git: `output/launch-2026-09-30/piloto-pago-confirmado.png`, `piloto-correos-recibidos.png`, `piloto-renovacion-cancelada.png` y `piloto-reembolso-por-confirmar.png`. Los cambios de interfaz `1f7f655` también están desplegados satisfactoriamente en el proyecto Vercel `nuthrick`.
