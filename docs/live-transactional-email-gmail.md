# LIVE-1B · Correo transaccional comercial temporal

Fecha de implementación: 25 de septiembre de 2026  
Proyecto Supabase: `qlsqhvyrslclmlstlemn`

## Decisión operativa

Durante esta fase Nuthrick utiliza exclusivamente `susy.asistencia.online@gmail.com` para correo transaccional controlado, soporte, privacidad y `Reply-To`. El dominio web canónico sigue siendo `https://nuthrick.com`; no se crean buzones `@nuthrick.com`, no se requiere Google Workspace y no se añaden registros MX, SPF, DKIM o DMARC.

La identidad administrativa y la identidad de envío son conceptos independientes aunque hoy coincidan.

## Transporte

El transporte temporal es Gmail API con OAuth y alcance `gmail.send`, reutilizando la conexión de remitente de Agenda. El worker server-side obtiene el refresh token cifrado desde la base privada, renueva el access token en Google y envía el MIME multipart con `From`, `Reply-To`, `Message-ID` y enlaces `nuthrick.com`.

La selección de proveedor queda centralizada en `private.transactional_email_settings.provider`. El proveedor futuro puede ser Resend u otro transporte compatible sin cambiar los módulos de negocio.

## Controles implementados

- outbox idempotente y mensajes congelados antes del envío;
- máximo de cinco intentos con reintentos acotados;
- worker interno autorizado mediante secreto en Supabase Vault;
- verificación de identidad Gmail sin exigir DNS del dominio web;
- cinco plantillas de prueba controlada antes de considerar listo el flujo;
- confirmación humana de recepción y revisión de cada prueba;
- sin envío comercial general mientras la evidencia no esté completa.

La función `transactional-email` está desplegada y el panel administrativo expone configuración, verificación, cola, worker, reintentos y evidencia.

## Estado actual

La configuración Gmail está guardada como `provider=gmail`, `mode=live` y `delivery_mode=controlled`, con el remitente operativo autorizado. La primera verificación detectó `invalid_grant` en Google: el refresh token de Agenda fue revocado, expiró o pertenece a otro cliente OAuth. Por seguridad, el worker no envía mensajes y el readiness permanece pendiente.

Para desbloquearlo, el administrador debe iniciar sesión en Nuthrick, abrir Agenda, pulsar **Autorizar remitente**, aprobar nuevamente el acceso de Gmail para `susy.asistencia.online@gmail.com` y volver a ejecutar la verificación. No se debe pegar ningún token ni contraseña en el chat.

Después de renovar la autorización:

1. Verificar la conexión Gmail.
2. Preparar las cinco pruebas controladas al destinatario autorizado.
3. Procesar la cola y confirmar la recepción real.
4. Registrar la revisión de cada mensaje desde `/admin/operations`.
5. Confirmar el readiness 15/15.

## Migración futura

Cuando existan buzones propios, solo se cambia la configuración central de remitente, soporte, privacidad y `Reply-To`, junto con el proveedor y la verificación DNS que corresponda. Los contratos internos, las plantillas y la lógica comercial permanecen iguales.
