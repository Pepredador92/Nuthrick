# LIVE-1B · documentos legales y correo real

## Estado y límites

Continúa LIVE-1 (`8b75c76`). Stripe exclusivamente TEST; no configurar secretos,
productos, precios ni webhooks Live. OpenAI apagado. Sin cambios de pacientes.
Los tres documentos existentes v1 permanecen `pending_review`, sin fecha efectiva.
No ejecutar aprobación hasta la confirmación humana explícita y la resolución de
los campos pendientes. No hay dominio propio confirmado a 25 de septiembre de 2026.

Contacto autorizado por José: `susy.asistencia.online@gmail.com`, tanto soporte como
privacidad y bandeja de pruebas. Los antiguos correos `@nuthrick.com` no existen:
se retiran de configuración activa y del footer público.

## Revisión legal

Las páginas anteriores solo presentaban estructura y principios genéricos. Ahora
el texto está en los mismos documentos privados, con vista previa administrativa:

- https://nuthrick.vercel.app/admin/legal/terms
- https://nuthrick.vercel.app/admin/legal/privacy
- https://nuthrick.vercel.app/admin/legal/refunds

Se contrastó el borrador con planes y accesos, billing y créditos, Agenda,
Superlink, mensajería, almacenamiento y las integraciones que existen en el repo.
Esencial/Profesional, Beta, Founder y Full Access no se confunden con roles de
administración. Las cláusulas de IA señalan que OpenAI está apagado y que sus
resultados futuros necesitarán revisión profesional. Stripe TEST se identifica
sin presentar pruebas como cargos reales.

### LEGAL_DECISIONS_REQUIRED

1. Identidad/nombre o razón social y domicilio de quien presta el servicio y del
   responsable de datos; ley aplicable, jurisdicción y resolución de controversias.
2. Edad mínima y representación de menores, tanto profesionales como pacientes.
3. Roles y acuerdos para los datos de pacientes; finalidades/consentimiento,
   transferencias, ubicaciones y acuerdos con proveedores. Resend está preparado,
   pero aún no contratado/configurado como proveedor activo.
4. Retención, cierre, respaldos, logs y outbox; procedimiento ARCO, plazos y
   verificación de identidad. No existe una política definitiva de retención.
5. Criterios y plazo de reembolso, prorrateos/excepciones, créditos consumidos,
   procedimiento y responsable de atención. No se fija una política económica.
6. Política fiscal/comprobantes, límites de responsabilidad, disponibilidad,
   condiciones de suspensión y cierre.
7. Fecha efectiva seleccionada después de resolver lo anterior y aprobar.

El contacto real ya fue confirmado. Los campos pendientes están marcados en cada
borrador. La [LFPDPPP vigente](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf)
se consultó para identificar datos sensibles, elementos del aviso y derechos;
las decisiones jurídicas específicas requieren revisión humana.

### Aprobación y versiones

Solo `platform_admins` habilitados pueden editar/aprobar. Se comprueba versión,
revisión y hash del texto mostrado (incluidos contactos resueltos). La UI exige
fecha y la frase “Confirmo que este documento fue revisado y aprobado.”. El agente
no la ejecuta hasta que José confirme “Apruebo Términos v1, Privacidad v1 y Reembolsos
v1.”. No se asigna fecha antes de ese paso.

Un documento aprobado es inmutable; el siguiente cambio crea v2. Las aceptaciones
conservan usuario, documento, versión y fecha. La proyección pública contiene solo
versiones aprobadas; RLS y RPC excluyen documentos cuya fecha efectiva aún no llega.
Una nueva versión en borrador no retira la versión vigente anterior.
`my_legal_acceptances` informa versiones que requieren aceptación nueva; esta fase
no impone un nuevo recorrido de aceptación al profesional.

## Correo: integración preparada, envío real pendiente

El proveedor anterior era `test`; los envíos se simulaban en SQL. Se extienden las
15 plantillas, la outbox y el cron existentes con un adaptador mínimo de Resend.
El cron conserva la simulación hasta configurar expresamente el modo controlado.
El worker real solo reclama mensajes de prueba TEST destinados a máximo dos
bandejas autorizadas; no envía el resto de la cola comercial ni campañas.

### Secretos y dónde configurarlos

**No escribir valores en chat, repositorio, SQL, frontend ni capturas.** Cuando se
tenga dominio y cuenta del proveedor, guardar directamente en los paneles seguros:

| Nombre exacto | Runtime / ubicación | Verificación sin mostrar valor |
| --- | --- | --- |
| `RESEND_API_KEY` | Supabase → proyecto Nuthrick → Edge Functions → Secrets | Nombre presente; “Verificar proveedor y DNS” valida acceso al dominio. Necesita enviar correo y leer el dominio configurado. |
| `RESEND_WEBHOOK_SECRET` | Mismo almacén de secretos Edge; copiar desde el endpoint configurado en Resend | Nombre presente; primer evento con firma Svix válida registra recepción. |
| `TRANSACTIONAL_EMAIL_WORKER_SECRET` | Mismo almacén Edge; token aleatorio de al menos 32 caracteres | Nombre presente y verificación de runtime. |
| `nuthrick_transactional_email_worker_secret` | Supabase → Vault → crear secret desde formulario seguro | Mismo valor que el anterior; comprobar nombre y primera ejecución del cron, nunca leerlo en SQL. |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables reservadas del runtime.
No se necesitan claves de correo en Vercel. No añadir claves Live de Stripe.

Webhook: `https://qlsqhvyrslclmlstlemn.supabase.co/functions/v1/transactional-email/webhook`.
Activar eventos `email.sent`, `email.delivered`, `email.bounced`, `email.failed`,
`email.complained`, `email.delivery_delayed` y `email.suppressed`.
La función usa autenticación propia: JWT válido de admin para acciones, secreto
para el cron y firma Svix sobre bytes originales para webhooks. Por eso su
`verify_jwt` de gateway es false. No existe envío anónimo.

### Dominio/DNS

Aún no hay dominio propio ni registros DNS reales que puedan entregarse. Cuando
exista, añadirlo a Resend y copiar **sus registros exactos** (no inventar DKIM,
SPF o MX); no modificar DNS sin confirmar control y compatibilidad con registros
existentes. Guardar ID del dominio, nombre y correo remitente en Operaciones.
Reply-To toma el soporte central verificado. “Verificar proveedor y DNS” consulta
el dominio en Resend, devuelve los registros que exige y verifica SPF/DKIM.
DMARC se consulta mediante DNS público; se exige un único registro válido en
`_dmarc.<dominio configurado>`. Usar el dominio raíz para esta primera verificación;
la herencia DMARC desde un padre no se considera evidencia en este adaptador.
No declarar entregabilidad lista por un HTTP 200 ni por aceptar un mensaje.

Referencias: [dominios](https://resend.com/docs/api-reference/domains/get-domain),
[DMARC](https://resend.com/docs/dashboard/domains/dmarc),
[verificación de firmas](https://resend.com/docs/webhooks/verify-webhooks-requests).

### Pruebas, idempotencia y fallos

1. Configurar contactos, dominio/remitente y secretos; verificar DNS/runtime.
2. Autorizar la bandeja controlada y preparar cinco mensajes: bienvenida, pago
   TEST confirmado, pago TEST fallido simulado, créditos TEST y reembolso TEST.
3. Ejecutar cola controlada o esperar cron. Cada evento crea una sola fila; el
   mismo ID del mensaje es clave de idempotencia del proveedor. El mensaje final
   se congela antes del primer envío y se reutiliza sin variaciones.
4. Verificar remitente, asunto, acentos, marca, enlaces productivos, vista móvil,
   footer/legal y spam en la bandeja real. Registrar recepción con nota explícita.
5. Revisar delivery/bounce; un rebote posterior revoca el readiness.

La [idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys)
dura 24 horas. El worker y el reintento manual se detienen a las 23 horas desde
el primer intento: ante un resultado ambiguo antiguo hay que conciliar en Resend,
sin crear otra fila para reenviar a ciegas. Cinco intentos automáticos, backoff y
lease por mensaje; un retry manual permitido queda auditado. Los webhooks son
idempotentes y se reconcilian aunque lleguen antes de la respuesta del envío.
Se guardan ID/tipo/fecha del evento; no el webhook crudo ni información clínica.

Cambiar contactos, dominio o remitente invalida la evidencia anterior: los cinco
mensajes observados deben corresponder a la configuración actual. Se distinguen
simulado, aceptado, entregado, recibido/revisado, fallido y rebotado.

### Readiness y siguiente fase

Legal exige tres documentos aprobados y efectivos. Correo exige proveedor real,
DNS verificado recientemente, runtime, webhook firmado, worker y cinco recepciones
revisadas de la configuración vigente. Sin aprobación ni dominio, correo y legal
siguen pendientes. El soporte pasa solo con contacto real confirmado.

Incluso al llegar a 15/15, Stripe sigue TEST. Live requerirá otra fase explícita:
cuenta habilitada, credenciales separadas, productos/precios Live aprobados,
webhook/Portal Live, piloto autorizado y cobro real expresamente autorizado.
