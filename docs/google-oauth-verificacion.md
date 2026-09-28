# Google OAuth: entrega para verificar permisos

Estado comprobado el 28 de septiembre de 2026:

- Proyecto Google Cloud: `nuthrick`; público External, estado **En producción**.
- Página principal, Privacidad y Términos: dominio oficial `https://nuthrick.com`.
- Propiedad de prefijo `https://nuthrick.com/` confirmada por Search Console mediante archivo HTML, con autorización expresa para la cuenta propietaria del proyecto. El archivo debe conservarse.
- Google confirmó la marca y se publicó: «Se verificó la información de tu marca y se muestra a los usuarios».
- Contacto público/desarrollador y remitente: `hola.nuthrick@gmail.com`. La propiedad del proyecto y la autorización administrativa son conceptos independientes del remitente.
- Siguen pendientes los permisos sensibles `calendar.events` y `gmail.send`. El resto de los alcances declarados es `calendar.calendarlist.readonly`, `calendar.events.freebusy`, `openid` y `userinfo.email`. Ninguno se presentó como permiso restringido.
- El formulario exige justificación y **video real de demostración en YouTube**. No permite guardar la justificación sin ese enlace. No se envió una solicitud incompleta ni se inventó un video.

## Justificación preparada (992 caracteres)

> Nuthrick manages appointments for nutrition professionals. Calendar access is optional and connected by each professional. calendar.events creates and cancels appointment events in the calendar the professional selects and checks event status/conflicts. Users may select existing shared calendars where they have writer access; calendar.events.owned/app.created would not cover those calendars, and readonly/freebusy cannot create or cancel appointments. calendarlist.readonly lists eligible calendars; events.freebusy checks availability. Gmail is a separate connection limited to platform administrators and the configured operational sender. gmail.send sends appointment, account and billing notifications from hola.nuthrick@gmail.com. No inbox reading or mailbox management is requested; professionals connecting Calendar are not asked for Gmail access. openid/email verifies the configured sender identity. Refresh authorizations are encrypted; no advertising use or general AI training.

Cotejada con `supabase/functions/agenda/index.ts` y `calendar-reconciliation.ts`. Este texto está preparado en el formulario y aquí como respaldo; no se ha guardado en Google porque falta el video obligatorio.

## Guion de demostración real

Duración orientativa: 4–6 minutos. Mostrar la barra de dirección, Nuthrick y el flujo real de consentimiento. Grabar con datos de demostración y destinatarios controlados, sin expedientes ni citas de pacientes reales. El video debe permitir a Google comprobar cada permiso solicitado y todos los clientes OAuth utilizados por el proyecto. No sustituir el flujo con imágenes ficticias o un video promocional.

1. **Presentación (30 s):** abrir `https://nuthrick.com`, mostrar el producto y el enlace a Privacidad. Explicar que Calendar es opcional por profesional y Gmail corresponde exclusivamente al remitente operativo administrado por Nuthrick.
2. **Consentimiento Calendar (60–90 s):** desde Agenda iniciar la conexión. Mostrar la identidad de la app, los permisos solicitados y el retorno correcto a Nuthrick. Mostrar la lista de calendarios, elegir uno de demostración donde la cuenta tenga acceso de escritura y seleccionar los calendarios de disponibilidad. No cambiar los calendarios reales de otro profesional para la grabación.
3. **Uso de Calendar (60–90 s):** crear una cita de demostración autorizada, mostrar su evento en Google Calendar y su disponibilidad; cancelar esa misma cita y mostrar el resultado. Explicar que se comprueban horario, estado y conflictos, sin copiar notas clínicas.
4. **Consentimiento Gmail (60–90 s):** desde la sección de correo operativo de Agenda, usando una sesión administradora, conectar el remitente configurado. Mostrar que solicita identidad y envío, y que no pide leer la bandeja. No exponer contraseñas, tokens, códigos OAuth ni otros mensajes de la bandeja durante la grabación.
5. **Envío controlado (30–60 s):** desde Administración → Operaciones verificar la conexión y ejecutar una prueba a una bandeja previamente autorizada. Mostrar el mensaje concreto recibido, From/Reply-To y un enlace `nuthrick.com`, sin mostrar mensajes ajenos. No activar envíos masivos, cobros Live ni OpenAI como parte de la demostración.
6. **Revocación y cierre (20–30 s):** mostrar dónde se retira el acceso y el contacto de privacidad. Explicar que la retirada detiene futuras operaciones autorizadas y que las solicitudes de eliminación se atienden conforme al aviso publicado. No revocar el remitente productivo únicamente para grabar este paso.

La grabación puede incluir la advertencia de app aún no verificada: Google la espera durante la revisión. Si aparece una nueva concesión de permisos o aceptación de condiciones, confirmar ese paso con el titular antes de ejecutarlo. Publicar el video para que Google pueda verlo, preferentemente como no listado, revisar el contenido y conservar el enlace exacto antes de enviar el formulario.

## Cierre posterior

1. Revisar el video real, pegar su enlace, guardar justificación y enviar la solicitud de permisos a Google.
2. Atender el resultado de Google sin dar por aprobados los permisos por el solo hecho de estar en producción.
3. Renovar la autorización Gmail del remitente fuera de Testing y verificar envío, recepción y renovación del acceso con la configuración vigente.
4. Registrar evidencia real de continuidad y activar el envío comercial mediante el control auditado. Comprobar readiness; no escribir 15/15 manualmente.
5. Stripe Live y el primer pago real pertenecen al siguiente bloque autorizado.

Referencias: [Página principal y propiedad](https://support.google.com/cloud/answer/13807376?hl=en), [estado de publicación y límites](https://support.google.com/cloud/answer/15549945?hl=en), [política de datos de Google](https://developers.google.com/terms/api-services-user-data-policy).
