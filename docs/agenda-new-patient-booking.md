# Primera cita antes de crear la ficha

El formulario de agenda distinguía únicamente pacientes registrados: escribir un nombre no seleccionaba un `patient_id`, por lo que el botón permanecía deshabilitado incluso con modalidad y horario elegidos.

Ahora ofrece «Paciente registrado» y «Paciente nuevo». Para una primera cita basta el nombre (2–160 caracteres), la modalidad y una hora disponible. El buscador también permite pasar a paciente nuevo conservando el texto escrito y el horario seleccionado. El formulario explica qué dato falta para habilitar el guardado y señala que la autorización fuera del horario habitual es opcional.

La cita nueva se guarda como contacto profesional sin `patient_id`; no crea un expediente, no consume un cupo de pacientes ni presume consentimiento o confirmación de asistencia. Después se puede usar «Vincular paciente» desde la cita para seleccionar una ficha o darla de alta. Al no solicitar teléfono ni correo, la invitación se puede copiar y compartir mediante el flujo existente.

El endpoint acepta una ficha existente o un nombre nuevo, nunca ambas identidades en la misma petición. El propietario procede del JWT verificado. Se mantienen las comprobaciones de horarios, consultorio, anticipación, Google Calendar, cruces e idempotencia. La migración amplía únicamente la selección del contacto en la función de citas existente y conserva sus permisos y su ejecución como invocador.

Validación: 40 pruebas de agenda, selector de pacientes, horarios y seguridad; typecheck, ESLint y build del frontend. La prueba SQL `supabase/tests/database/agenda_new_patient_booking.sql` ejecutada dentro de una transacción revertida verifica reserva nueva, reserva vinculada, reintentos, rechazo de un cruce y validación del nombre, sin dejar citas, expedientes, auditoría ni trabajos de envío persistentes. También se recorrió el formulario y la confirmación local con datos ficticios.
