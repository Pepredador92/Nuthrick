# Vista previa de las citas compartidas

Las invitaciones nuevas usan `/agenda/tu-cita`. El enlace anterior `/agenda/confirmar` sigue abriendo el mismo visor y conserva la validez de sus invitaciones. El secreto permanece en el fragmento del enlace; no se añade a la URL de la imagen, a los metadatos ni a analítica.

Ambas rutas entregan desde el servidor un título y una descripción para pacientes, junto con `/og/appointment-v1.png`, en lugar de la tarjeta comercial del sitio. La imagen contiene el logotipo existente, un bosque nocturno abstracto, luciérnagas y un calendario registrado. Su texto principal es «Tu cita está agendada», sin confundir la reserva con la confirmación de asistencia. No contiene datos personales, fechas ni información clínica. El estado vigente de cada cita se consulta en el visor al abrir la invitación.

El SVG editable y su PNG de 1200×630 se regeneran con `node frontend/scripts/generate-appointment-preview.mjs` desde la raíz del repositorio. El script usa Sharp y los recursos de marca locales; no necesita un servicio de generación de imágenes. La tarjeta comercial `/og.png` se conserva para el sitio dirigido a profesionales.

WhatsApp puede conservar la vista previa de mensajes anteriores. Volver a compartir mediante el botón de la aplicación genera la URL específica para pacientes; no se modifica un mensaje ya enviado ni hace falta volver a agendar la cita.

Validación: pruebas del enlace seguro, ambos accesos al visor y exclusión de analítica. El build de Vercel comprueba en un servidor aislado que ambas rutas devuelvan título, imagen y descripción adecuados en el HTML, con canonical y noindex. También se inspeccionó visualmente el PNG. No se enviaron mensajes a pacientes durante estas comprobaciones.
