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

**Idioma:** elegir **English** en el selector de idioma de la pantalla de consentimiento de Google. Es un requisito expreso de su [guía del video](https://support.google.com/cloud/answer/13804565?hl=en). La narración puede apoyarse en los textos en inglés preparados abajo. Esto no requiere cambiar permanentemente el idioma del producto ni de la cuenta.

1. **Presentación (30 s):** abrir `https://nuthrick.com`, mostrar el producto y el enlace a Privacidad. Explicar que Calendar es opcional por profesional y Gmail corresponde exclusivamente al remitente operativo administrado por Nuthrick.
2. **Consentimiento Calendar (60–90 s):** desde Agenda iniciar la conexión. Mostrar la identidad de la app, los permisos solicitados y el retorno correcto a Nuthrick. Mostrar la lista de calendarios, elegir uno de demostración donde la cuenta tenga acceso de escritura y seleccionar los calendarios de disponibilidad. No cambiar los calendarios reales de otro profesional para la grabación.
3. **Uso de Calendar (60–90 s):** crear una cita de demostración autorizada, mostrar su evento en Google Calendar y su disponibilidad; cancelar esa misma cita y mostrar el resultado. Explicar que se comprueban horario, estado y conflictos, sin copiar notas clínicas.
4. **Consentimiento Gmail (60–90 s):** desde la sección de correo operativo de Agenda, usando una sesión administradora, conectar el remitente configurado. Mostrar que solicita identidad y envío, y que no pide leer la bandeja. No exponer contraseñas, tokens, códigos OAuth ni otros mensajes de la bandeja durante la grabación.
5. **Envío controlado (30–60 s):** desde Administración → Operaciones verificar la conexión y ejecutar una prueba a una bandeja previamente autorizada. Mostrar el mensaje concreto recibido, From/Reply-To y un enlace `nuthrick.com`, sin mostrar mensajes ajenos. No activar envíos masivos, cobros Live ni OpenAI como parte de la demostración.
6. **Revocación y cierre (20–30 s):** mostrar dónde se retira el acceso y el contacto de privacidad. Explicar que la retirada detiene futuras operaciones autorizadas y que las solicitudes de eliminación se atienden conforme al aviso publicado. No revocar el remitente productivo únicamente para grabar este paso.

La grabación puede incluir la advertencia de app aún no verificada: Google la espera durante la revisión. Si aparece una nueva concesión de permisos o aceptación de condiciones, confirmar ese paso con el titular antes de ejecutarlo. Publicar el video para que Google pueda verlo, preferentemente como no listado, revisar el contenido y conservar el enlace exacto antes de enviar el formulario.

## Preparación de la toma

1. Resolver antes de grabar cualquier inicio de sesión y la aceptación de documentos de Nuthrick. En la sesión revisada, Agenda solicita aceptar Privacidad v2 y Términos v2; aprobar su publicación no registra esa aceptación de usuario. No se han marcado las casillas ni enviado el formulario por el titular.
2. Usar una cita identificada como **Demostración OAuth**, sin información clínica. Comprobar antes qué calendario recibirá el evento y conservar su configuración previa. Si el calendario o la vista muestran pacientes reales, preparar una vista vacía antes de capturar; no modificar citas ajenas para despejarla.
3. Preparar las pestañas del producto, Google Calendar y el mensaje de prueba específico. El envío utilizará `hola.nuthrick@gmail.com` y la bandeja controlada autorizada. Cerrar u ocultar del encuadre consolas de secretos, formularios SMTP, mensajes ajenos y esta conversación.
4. Capturar la ventana o el área del navegador con su barra de dirección. En Mac, abrir Captura de pantalla con **Mayúsculas + Comando + 5**, elegir grabación de ventana o área y comprobar el destino en Opciones. Detener con **Comando + Control + Esc**. [Instrucciones de Apple](https://support.apple.com/es-mx/102618).
5. No hace falta mostrar el rostro. Puede usarse voz o texto explicativo. Revisar una toma corta antes de grabar todo para comprobar que se leen permisos y botones. Pausar fuera de escena si se requiere escribir contraseñas, completar MFA o mostrar códigos.

## Texto de apoyo para voz o subtítulos

Estos textos acompañan acciones reales y deben ajustarse a lo que efectivamente se vea. No afirman que una prueba pasó hasta observar su resultado.

| Escena y control en Nuthrick | Texto en inglés |
| --- | --- |
| Inicio y enlace de Privacidad | “Nuthrick helps nutrition professionals manage appointments. This is the production website. The public privacy policy explains how Google data is used. Calendar is optional for each professional; operational email is managed separately by platform administrators.” |
| Agenda → Google Calendar → Conectar Google Calendar / Renovar autorización | “I am starting the Calendar connection from Nuthrick. This is Google's consent screen for the application. Calendar access is used to list calendars, check availability, and create or cancel appointment events.” |
| Elegir calendarios → Consultar disponibilidad en / Crear citas en | “The calendar list lets the professional choose where to check availability and where to create appointment events. The destination must allow writing. The professional can choose an existing calendar, including one shared with writer access.” |
| Cita de demostración y evento correspondiente | “This appointment contains demonstration data. After creating it in Nuthrick, I am showing the corresponding event in Google Calendar. I will cancel this same demonstration appointment and show the resulting calendar state.” |
| Disponibilidad del horario de demostración | “Nuthrick uses calendar availability to check scheduling conflicts. This demonstration shows how the selected calendars affect the availability of this time slot.” |
| Agenda → Correo de Nuthrick → Autorizar remitente | “This is the separate Gmail authorization, available to the platform administrator. The configured sender is hola.nuthrick@gmail.com. The application requests identity verification and permission to send email. It does not request permission to read or manage the mailbox.” |
| Administración → Operaciones → Verificar conexión Gmail / Bandejas y cinco pruebas | “I am checking the configured sender and sending controlled test messages to an authorized mailbox. The receiving mailbox is shown manually as delivery evidence; Nuthrick does not read it through the Gmail API.” |
| Mensaje concreto recibido | “This is the received test message. Its sender and reply address use the operational identity, and the product link points to nuthrick.com.” |
| Cierre | “Google access can be revoked through the user's Google account. Privacy and deletion requests can be sent to the contact published in Nuthrick's privacy policy.” |

Los controles «Preparar cinco pruebas» y «Procesar cola» envían mensajes reales a la bandeja elegida; no ejecutar varias veces para repetir una toma. Grabar el procesamiento y el mensaje concreto recibido, sin presentar un correo antiguo como prueba de un envío nuevo.

## Revisión antes de subir

- Se ven los dos consentimientos completos y en inglés, la app Nuthrick y el retorno al producto.
- Los permisos corresponden a los declarados; se muestra lista, disponibilidad y creación/cancelación de Calendar, además de envío Gmail.
- La demostración distingue la cuenta administradora de la identidad remitente y no implica acceso a lectura de Gmail.
- No aparecen pacientes, credenciales, códigos, otros mensajes ni ventanas privadas. Revisar también primeros y últimos segundos y el audio.
- El título previsto es **Nuthrick — OAuth verification demo — Calendar and Gmail**. Guardar el archivo original local y comprobar acceso al enlace que se entregará a Google. No hay video grabado, subido ni revisión de permisos enviada todavía.

## Cierre posterior

1. Revisar el video real, pegar su enlace, guardar justificación y enviar la solicitud de permisos a Google.
2. Atender el resultado de Google sin dar por aprobados los permisos por el solo hecho de estar en producción.
3. Renovar la autorización Gmail del remitente fuera de Testing y verificar envío, recepción y renovación del acceso con la configuración vigente.
4. Registrar evidencia real de continuidad y activar el envío comercial mediante el control auditado. Comprobar readiness; no escribir 15/15 manualmente.
5. Stripe Live y el primer pago real pertenecen al siguiente bloque autorizado.

Referencias: [Página principal y propiedad](https://support.google.com/cloud/answer/13807376?hl=en), [estado de publicación y límites](https://support.google.com/cloud/answer/15549945?hl=en), [política de datos de Google](https://developers.google.com/terms/api-services-user-data-policy).
