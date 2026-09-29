# Agenda, presencia y visitas — 29 de septiembre de 2026

## Acceso y comportamiento

- **Ficha del paciente → Agendar cita:** paciente preseleccionado.
- **Agenda → Agendar cita:** búsqueda de pacientes activos, fecha/hora, modalidad y consultorio. Reutiliza duración, zona horaria, anticipación, disponibilidad y validación de cruces/Google Calendar existentes. Permite autorizar una excepción al horario semanal; no omite cruces.
- El horario queda ocupado inmediatamente; las confirmaciones del profesional y del paciente son independientes.
- 🔵 Sin confirmaciones; si confirmó sólo el profesional: «Falta confirmación del paciente». 🟡 Paciente confirmó. 🟢 Ambos confirmaron.
- La campana incluye próximas citas y confirmación del profesional. El worker existente crea un aviso deduplicado cuando faltan hasta 24 horas.
- **Compartir confirmación** genera un enlace limitado a una cita. **WhatsApp · teléfono** abre `wa.me` con el mensaje listo; el profesional decide enviarlo. No se añadió un proveedor de envíos automáticos por WhatsApp.
- El paciente confirma expresamente desde ese enlace o **Super Link → Mis citas** y puede añadir la cita a Google Calendar o descargar `.ics` para Apple/Outlook. Abrir el enlace no confirma. El enlace vence al inicio de la cita y deja de servir si se cancela, cambia su horario o se cambia de paciente.
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

Iniciar desde `frontend`: `npx vite --config tests/visual/appointments.vite.config.ts`.
En otra terminal: `AGENDA_PLAYWRIGHT_MODULE=/ruta/a/playwright node frontend/tests/visual/appointments-check.mjs`.
La prueba simula todas las respuestas de agenda; no debe sustituirse por llamadas con pacientes reales.
