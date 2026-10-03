# Nombres de consulta y evolución

Corrección del 3 de octubre de 2026.

## Causa y comportamiento

Al iniciar un formulario se guarda un borrador recuperable. Retirarlo conserva el registro y su procedencia clínica. El contador interno `sequence_number` incluye esos intentos y no representa el número de atenciones efectivamente realizadas.

- Los nombres automáticos se numeran por fecha clínica entre los seguimientos vigentes, incluyendo el borrador actual. Los registros cancelados o retirados no consumen un número visible. Los IDs y el contador interno se conservan.
- `display_name` permite personalizar el nombre desde Consultas recientes o Historial. Un valor nulo usa el nombre automático. Los nombres personalizados no se renumeran al retirar otra consulta.
- Evolución omite los registros retirados o cancelados sin valores comparables. Si tienen mediciones, cálculos o resultados de laboratorio, conserva sus valores y la referencia a su origen. Las consultas vigentes mantienen sus huecos de datos, sin arrastrar valores de otra visita.
- Reanudar o renombrar conserva la consulta existente. Renombrar una consulta cerrada no la reabre, no cambia su fecha, no crea una consulta ni una revisión clínica.

## Permisos

`public.rename_consultation` es un wrapper `SECURITY INVOKER` sobre una función privada. La función privada solo modifica `display_name`; exige identidad, propiedad de la consulta y del paciente, registros no retirados y acceso comercial de escritura. `expected_name` detecta ediciones concurrentes. No admite nombres de más de 120 caracteres ni llamadas anónimas.

## Verificación

- Pruebas de numeración, columnas retiradas vacías, conservación de valores archivados, edición desde la ficha y el historial, errores y exportación TXT/PDF.
- `scripts/test-consultation-names-remote.sql`: fixtures sintéticos dentro de una transacción revertida. Verifica renombrado de consulta cerrada, conservación de contenido/estado/fecha, restauración del nombre automático, concurrencia, límites y rechazo de cuentas ajenas, identidad ausente y consultas retiradas.
- El asesor de Supabase no reportó hallazgos sobre la nueva función. Persiste el aviso sobre funciones públicas preexistentes con privilegios elevados ([referencia](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)) y la protección de contraseñas filtradas deshabilitada ([referencia](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). No se modificaron esas configuraciones en esta corrección.
