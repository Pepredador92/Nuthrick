# Agenda, presencia y visitas — 29 de septiembre de 2026

## Acceso y comportamiento

- **Ficha del paciente → Agendar cita:** paciente preseleccionado.
- **Agenda → Agendar cita:** búsqueda de pacientes activos, fecha/hora, modalidad y consultorio. Reutiliza duración, zona horaria, anticipación, disponibilidad y validación de cruces/Google Calendar existentes. Permite autorizar una excepción al horario semanal; no omite cruces.
- El horario queda ocupado inmediatamente; las confirmaciones del profesional y del paciente son independientes.
- 🔵 Sin confirmaciones; si confirmó sólo el profesional: «Falta confirmación del paciente». 🟡 Paciente confirmó. 🟢 Ambos confirmaron.
- La campana muestra las citas de las próximas **48 horas**, con acciones para confirmar asistencia y pedir confirmación al paciente por WhatsApp. El worker existente genera un aviso deduplicado al entrar en ese periodo.
- **Enviar cita por WhatsApp** abre directamente la conversación con una invitación informativa. Dentro de las 48 horas, cambia a **Solicitar confirmación por WhatsApp** si falta la confirmación del paciente. El profesional decide enviar el mensaje; no se añadió un proveedor de envíos automáticos. Se usa el teléfono vigente en la ficha; ante ausencia de teléfono se permite copiar la invitación, y si el navegador bloquea la ventana se ofrece abrir WhatsApp explícitamente.
- El paciente puede añadir el evento a Google Calendar o descargar `.ics` desde el primer aviso. Confirma expresamente su asistencia desde ese enlace o **Super Link → Mis citas**, sólo dentro de las 48 horas previas. Abrir el enlace o añadir el calendario no confirma asistencia. El enlace vence al inicio de la cita y deja de servir si se cancela, cambia su horario o se cambia de paciente.
- Al crear una cita nueva se encola el correo informativo si hay destinatario y la invitación de Google si está conectado. Se reutilizan la cola y los reintentos existentes. El estado de entrega/sincronización se consulta en Agenda; no se garantiza inserción automática en el calendario del paciente, que depende de su configuración de Google. No se envían invitaciones retroactivas desde la migración.
- El buscador único admite escritura, teclado y selección táctil. El modal amplio ofrece días de horario configurado y horas libres comprobadas contra Agenda y Google. La selección se invalida al cambiar fecha o modalidad, y guardar vuelve a comprobar los cruces en el servidor.
- `patient_attendance_at` y `professional_attendance_at` guardan asistencia, separada de consentimiento/aceptación de reserva. Se conservan los campos históricos anteriores y sólo se trasladan confirmaciones explícitas registradas dentro de las 48 horas. Cambiar fecha, duración o paciente invalida la asistencia. Las reservas públicas siguen requiriendo **Aceptar reserva**, independientemente de confirmar asistencia después.
- **En línea** depende de una sesión auténtica y una pestaña visible con actividad en los últimos cinco minutos. Renovación cada 30 segundos, caducidad de 90 segundos y consulta del portal cada 30 segundos. Al cerrar sesión se elimina la sesión de servidor; un corte abrupto puede tardar hasta unos dos minutos en reflejarse. No se confía en la presencia declarada por participantes de un canal público.
- **Administración → Visitas a Nuthrick:** total desde activación, últimos 30 días, sesiones y desglose diario. Fechas de Ciudad de México. Una visita por sesión/categoría de página/día; no es un conteo de personas únicas.
- La landing SSR tiene su propio registro; también se incluyen planes, documentos públicos, perfiles y página de reserva. Se excluyen expedientes, portal, autenticación, datos de registro y enlaces de confirmación. No se guardan query strings, fragmentos, nombres de perfiles ni IP en la tabla de visitas. El referente conserva sólo el origen.

## Verificación

- Vitest focal: **8 archivos, 38 pruebas**, correctas.
- `node scripts/test-professional-appointments.mjs --presence`: correcto; incluye autorización, horarios/cruces, reintentos idempotentes, confirmaciones en ambos órdenes, revocación, notificaciones, pacientes sin correo y múltiples pestañas.
- `node scripts/test-site-analytics.mjs`: correcto; escritura sólo desde servidor, lectura sólo para administrador, deduplicación, exclusión de URLs privadas y fechas locales.
- Typecheck, ESLint focal, Deno check de ambas Edge Functions y `git diff --check`: correctos.
- Build de producción: correcto. Landing verificada en el servidor Nitro compilado con red de analítica simulada.
- Prueba visual sintética en 320, 390 y 1280 px: formulario, creación, confirmación, enlace WhatsApp, ausencia de desbordamiento y restauración de foco. Evidencias locales en `output/appointments-20260929/`.
- Migrations de estas funciones aplicadas y Edge Functions `agenda` (v21) y `site-analytics` (v1) activas. Probes de producción verificaron CORS, rechazo sin autenticación, enlaces inválidos y sesiones de portal inválidas; el registro SQL se verificó dentro de una transacción revertida.
- Worker de agenda activo cada minuto. Advisors: sin nuevas advertencias de seguridad; las nuevas tablas privadas tienen RLS sin políticas públicas deliberadamente ([explicación del advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).
- No se crearon citas reales ni se enviaron mensajes a pacientes durante las pruebas. No se probó con un teléfono real la importación al calendario.

## Repetir la prueba visual

Actualización del flujo de agenda (30 de septiembre UTC / 29 de septiembre local): 37 pruebas focales en 8 archivos; escenarios SQL adicionales para invitación inicial, límite exacto de 48 horas, idempotencia, acceso por sesión/token, recordatorios y reprogramación. La prueba visual cubre buscador, calendario, WhatsApp directo e invitación del paciente antes y durante la ventana de asistencia. Las verificaciones de presencia y estadísticas descritas arriba corresponden a la entrega anterior.

Activación: migraciones `appointment_availability_picker` y `appointment_attendance_reminders` aplicadas; Edge Function `agenda` v23 activa. Verificados permisos de servidor, CORS para `nuthrick.com`, rechazo 401 sin sesión y cron de recordatorios activo. Advisors sin cambios respecto a la línea base. Pasaron typecheck, ESLint focal, Deno check, build y `git diff --check`.

Iniciar desde `frontend`: `npx vite --config tests/visual/appointments.vite.config.ts`.
En otra terminal: `AGENDA_PLAYWRIGHT_MODULE=/ruta/a/playwright node frontend/tests/visual/appointments-check.mjs`.
La prueba simula todas las respuestas de agenda; no debe sustituirse por llamadas con pacientes reales.
