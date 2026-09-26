# Correo institucional temporal de Nuthrick

Actualización: 26 de septiembre de 2026.

## Identidades y configuración

| Uso | Fuente de configuración | Dirección vigente |
| --- | --- | --- |
| Administración | `private.platform_admins`, por ID de usuario | La cuenta de José conserva sus permisos |
| Remitente de Agenda y correo comercial | `private.transactional_email_settings.from_email` | `hola.nuthrick@gmail.com` |
| Reply-To comercial y Agenda | `private.transactional_email_settings.reply_to` | `hola.nuthrick@gmail.com` |
| Soporte y privacidad | `private.support_settings`; proyección pública `operational_contact_public` | `hola.nuthrick@gmail.com` |
| Auth | SMTP de Supabase, usuario y remitente | `hola.nuthrick@gmail.com` |
| Destino de las pruebas controladas | `private.transactional_email_test_recipients` | `susy.asistencia.online@gmail.com` |

**Correo institucional temporal pendiente de migración futura.** El sitio canónico sigue siendo `https://nuthrick.com`. No se necesitan buzones de dominio ni DNS de correo para esta configuración.

Agenda obtiene la identidad mediante `operational_mail_context`, RPC exclusiva del servidor. El permiso para conectar Gmail se comprueba contra el rol administrativo del actor autenticado. Las variables antiguas `AGENDA_MAIL_ADMIN_EMAIL` y `AGENDA_SENDER_EMAIL` ya no intervienen en esa autorización ni determinan el remitente; no se deriva un administrador del correo operativo.

Los tokens de Calendar y de Gmail son conexiones independientes. Cambiar Gmail no actualiza el calendario ni su propietario. La cuenta remitente no necesita un usuario de Nuthrick ni recibe un rol administrativo.

## Auth en español

`supabase/templates/auth-es.json` conserva los seis asuntos y cuerpos de autenticación. Al aplicar una plantilla se concatena su cuerpo, un salto de línea y `footer`. El enlace de acción sigue usando `{{ .ConfirmationURL }}`; la reautenticación conserva `{{ .Token }}`. El pie utiliza `{{ .SiteURL }}` para obtener el dominio configurado y los contactos vigentes del sitio. No contiene claves ni direcciones de contacto duplicadas.

Estas plantillas se administran en Supabase Auth. Un despliegue de la web o de Edge Functions no las cambia automáticamente. Las notificaciones de seguridad opcionales que están desactivadas no se activan como parte de una traducción.

## Evidencia y pendiente externo

- La cuenta Gmail tiene verificación en dos pasos; su contraseña de aplicación se introdujo directamente en Supabase.
- Se comprobó un correo de recuperación en la bandeja de entrada del destinatario controlado, enviado por `hola.nuthrick@gmail.com`.
- La función Agenda se desplegó con identidad central y autorización administrativa independiente.
- La app OAuth de Google sigue en **Prueba**. La conexión nueva devolvió `403 access_denied` porque `hola.nuthrick@gmail.com` aún no figuraba entre los usuarios de prueba. El alta y el consentimiento de envío requieren confirmación del propietario.
- Hasta completar OAuth y verificarlo, el worker conserva las comprobaciones de identidad y no debe enviar con la conexión antigua como sustituto.
- El envío comercial continúa en modo controlado. Cambiar el remitente no habilita el envío general ni completa PRE-LIVE por sí solo.

## Cierre de la migración

1. Autorizar la cuenta nueva en Google y completar el consentimiento `gmail.send`, `openid` y `email` desde **Agenda → Configuración → Autorizar remitente**.
2. Verificar que `agenda_mail_sender.email` coincida con el remitente central y que la conexión de Calendar conserve su revisión y calendarios.
3. Verificar el proveedor desde el worker, preparar las cinco pruebas con la revisión nueva y comprobar recepción, enlaces y contenido.
4. Registrar la evidencia real; completar aparte el flujo de correos comerciales generales, sus reintentos y supervisión.
5. Resolver la publicación/verificación de OAuth antes de una operación sostenida: en modo Prueba las autorizaciones de estos alcances caducan a los siete días.

## Contactos legales

El footer y los contactos vigentes de las páginas legales leen la configuración pública. Las versiones legales aprobadas y sus aceptaciones se conservan intactas; la actualización completa del contenido legal se realizará en una nueva versión, con la revisión correspondiente.

## Verificación técnica

- Prueba SQL con rollback: `anon` y `authenticated` no pueden ejecutar la RPC del servidor; `service_role` sí.
- Prueba SQL: cambiar el remitente no cambia el permiso del administrador ni concede permisos a un actor ausente.
- Pruebas de seguridad de Agenda: cabeceras MIME, Reply-To independiente y rechazo de inyección de cabeceras.
- Deno check, TypeScript y build de la web.
