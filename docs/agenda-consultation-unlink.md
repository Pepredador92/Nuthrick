# Desvincular consultas de las citas

En **Agenda → Citas**, cada cita que tenga una consulta asociada muestra
**Desvincular consulta**, también en **Anteriores y canceladas**.

El botón abre una confirmación con el paciente y la fecha de la cita. Se puede
conservar el vínculo o confirmar que se quite. Después de confirmar, la tarjeta
refleja el cambio y las citas confirmadas permiten vincular la consulta correcta.

## Alcance

- Se limpia únicamente `consultations.agenda_entry_id`. La cita, la consulta,
  sus respuestas, mediciones, notas y planes conservan su información y estado.
- También se permite corregir la asociación de una consulta cerrada; no se
  reabre para editarla. Se mantienen los controles de historial existentes.
- Se aplican los disparadores habituales de actualización y actividad.
- No se cancela la cita ni se envían correos o cambios a Google Calendar.

## Servidor

`public.unlink_consultation_from_appointment(uuid, uuid)` es una función
`SECURITY INVOKER` que delega esta operación puntual a la función privada.
Solo `authenticated` tiene permiso de ejecución. La función privada exige
sesión, permisos de agenda y consultas, acceso al paciente y propiedad tanto
de la cita como de la consulta. Verifica que ambas pertenecen al mismo paciente.

La consulta se bloquea durante la operación. Un reintento después de quitar el
vínculo es idempotente; si otra ventana ya la vinculó a una cita diferente,
se rechaza la operación y se pide actualizar la agenda. La función solo modifica
el vínculo y respeta los disparadores y protecciones clínicas existentes.

La migración es aditiva y no modifica asociaciones existentes. No requiere
desplegar funciones de IA o cambiar sus créditos.
