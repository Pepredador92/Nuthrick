# LIVE-1B · Correo transaccional comercial temporal

> Actualización 30/09/2026: remitente renovado, cinco pruebas recibidas y correo operativo activo; PRE-LIVE 15/15. El video OAuth sigue aplazado y no se ofrecen conexiones Google como beneficio general. Estado y límites vigentes en [cierre operativo](lanzamiento-suscripciones-2026-09-30.md). Las notas fechadas anteriores se conservan como historial.

Fecha de implementación: 25 de septiembre de 2026  
Proyecto Supabase: `qlsqhvyrslclmlstlemn`

## Decisión operativa

Durante esta fase Nuthrick utiliza exclusivamente `hola.nuthrick@gmail.com` para correo transaccional controlado, soporte, privacidad y `Reply-To`. El dominio web canónico sigue siendo `https://nuthrick.com`; no se crean buzones `@nuthrick.com`, no se requiere Google Workspace y no se añaden registros MX, SPF, DKIM o DMARC.

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

El 26 de septiembre se migró la identidad central a `hola.nuthrick@gmail.com`. Auth SMTP ya envía desde esta cuenta. Agenda toma el remitente de la configuración central y verifica por separado el rol administrativo.

La app OAuth de Google sigue en Prueba y la cuenta nueva debe autorizarse como usuario de prueba antes de completar `gmail.send`. Después se necesita verificar el worker y repetir las cinco pruebas con la nueva revisión. El correo comercial general sigue pendiente; no se debe interpretar un cambio de remitente como su activación.

Estado, configuración y checklist: [email-identity-migration.md](email-identity-migration.md).

## Migración futura

Cuando existan buzones propios, solo se cambia la configuración central de remitente, soporte, privacidad y `Reply-To`, junto con el proveedor y la verificación DNS que corresponda. Los contratos internos, las plantillas y la lógica comercial permanecen iguales.
