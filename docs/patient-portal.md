# Superlink del paciente

## Uso

En la ficha del paciente, **Superlink y chat** abre la administración de su espacio. El nutriólogo redacta el objetivo y las indicaciones, selecciona resultados e historial finalizado, revisa la vista del paciente y publica explícitamente. Las entrevistas y notas clínicas no se copian. Los resúmenes visibles se redactan por separado.

El enlace se crea para el correo guardado en la ficha. Se copia para compartirlo por el canal que el profesional elija; el sistema no envía invitaciones automáticamente. El paciente necesita ese enlace y un código enviado a su correo. La ruta pública sin enlace no revela información: `/mi-espacio`.

El paciente tiene cinco secciones: Mi guía, Resultados, Consultas, Chat y Mis notas. Ambos participantes pueden iniciar el chat. **Mensajes** en la navegación profesional reúne las conversaciones y sus mensajes pendientes de lectura. Las notas personales son exclusivamente del paciente, con edición y marcado como resueltas; no se muestran al profesional.

## Privacidad y límites

- Cinco tablas en `private`, con RLS y sin privilegios para `anon` ni `authenticated`.
- RPC `patient_portal` con `SECURITY INVOKER`, ejecutable solo por `service_role`. Edge autentica al profesional mediante `Auth.getUser`, valida propiedad o sesión y construye los parámetros mediante listas permitidas; nunca confía en el actor recibido en el cuerpo.
- Enlace aleatorio de 256 bits en el fragmento de URL, hash en DB y copia cifrada para que el propietario pueda recuperarlo. Caduca en 90 días. Renovarlo invalida sesiones y códigos anteriores.
- Código de un solo uso: 10 minutos, 5 intentos, HMAC separado por ID y propósito. Verificación concurrente serializada: solo una sesión por código.
- Sesión aleatoria, hash en servidor y vigencia de 2 horas. El navegador la mantiene solo en memoria: recargar solicita un nuevo código. Respuestas `no-store`, sin referentes y página `noindex`.
- Revocar impide el acceso y borra sesiones, pero conserva los mensajes y las notas. Archivar/eliminar al paciente, deshabilitar el portal o cambiar su correo impide usar la sesión anterior.
- Solo resultados de consultas finalizadas del paciente. Las series conservan método/procedencia por separado. Los resultados son una instantánea revisada: cambios posteriores requieren republicar. Eliminar o reabrir una consulta retira su contenido del portal aunque exista una instantánea antigua.
- Hasta 60 series, 100 puntos por serie y las 100 consultas finalizadas más recientes en la selección. Límites adicionales del contenido: objetivo 1,000 caracteres, indicaciones 12,000 y resumen por consulta 2,000; petición total 120 KB.
- Chat de texto, hasta 4,000 caracteres por mensaje, sin adjuntos ni notificaciones push. Actualización cada 5 segundos con la pestaña visible; paginación de 50 mensajes, deduplicación de reintentos. No es un servicio de urgencias.
- Hasta 100 notas por paciente de 2,000 caracteres cada una. Eliminación con confirmación.
- Límite de correo reutilizado de Agenda: 3 solicitudes por correo/enlace en 15 minutos y 60 correos por hora globales. No se publican códigos ni sesiones en logs.

## Dependencias operativas

Reutiliza el envío Gmail de Agenda y sus secretos existentes; no añade credenciales al cliente. `AGENDA_EMAIL_MODE=production` permite destinatarios reales, pero la cuenta Google remitente debe seguir conectada. La publicación/verificación de la aplicación OAuth de Google y la rotación de la credencial compartida previamente continúan siendo pendientes operativos ajenos a este cambio. No confundir modo de envío real con que Google haya aprobado la aplicación OAuth.

No se habilitan portales ni se publican expedientes automáticamente al desplegar. No se ha realizado una prueba de código real con un paciente para este módulo; las pruebas de interacción usan datos sintéticos. Antes de compartirlo con pacientes, completar una prueba consentida de correo y acceso.

## Validación (21 septiembre 2026)

- `npm run typecheck`, `npm run lint` y 537 pruebas en 67 archivos. Se excluye únicamente `LandingPage.test.tsx`, que pertenece a cambios pendientes independientes.
- `npm run build` y comprobación del artefacto Vercel.
- `deno check --config supabase/functions/agenda/deno.json supabase/functions/agenda/index.ts`.
- `node scripts/test-patient-portal.mjs`: aislamiento, publicación, revisión optimista, OTP, vencimientos, revocación, chat bidireccional, lectura, notas privadas, paginación y ejecución real como `service_role`; todo sintético y rollback.
- `node scripts/test-patient-portal-concurrency.mjs`: dos conexiones PostgreSQL verifican simultáneamente el mismo código correcto; únicamente una crea sesión. Base y roles temporales se eliminan al finalizar.
- Vista local profesional y paciente, incluido móvil de 375 px sin desbordamiento de página; cinco secciones visibles sin desplazar las pestañas.
- Migración remota `20260921194454_patient_superlink` en `qlsqhvyrslclmlstlemn`; grants y RLS comprobados. Cero portales activados tras la migración.
- Edge `agenda` v4 ACTIVE, con autenticación propia y `verify_jwt=false` conservado. Pruebas remotas: propietario sin autenticación rechazado; sesión ficticia rechazada.
- Frontend del commit `8a7626f` desplegado mediante copia aislada, excluyendo los cambios pendientes de Landing y `output/`. Vercel `dpl_BUFnbWbDoHQEg144TALUWZLC74Zs` READY, alias `https://nuthrick.vercel.app`, URL inmutable `https://nuthrick-1tp6uth8b-pepredador92.vercel.app`.
- Ruta publicada `/mi-espacio`: HTTP 200, título correcto, `noindex, nofollow`, `no-referrer`; navegador muestra la entrada sin revelar datos cuando no existe enlace. El despliegue requirió `--scope pepredador92` explícito (el primer intento sin scope devolvió `Not authorized`; no fue necesario cambiar la sesión ni los permisos).
- La instalación continúa reportando las 9 vulnerabilidades preexistentes del árbol de dependencias (1 baja, 8 altas); no se añadieron paquetes ni se ejecutaron actualizaciones forzadas.

Advisors no añade advertencias de seguridad nuevas. Las cinco tablas privadas generan el aviso informativo [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): es deliberado, acceso exclusivo del servidor y denegación de los roles públicos. Persisten los avisos anteriores sobre [funciones SECURITY DEFINER de otros módulos](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) y [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), sin modificaciones en esta tarea.

## Vista visual local

Desde `frontend`: `npx vite --config tests/visual/portal.vite.config.ts` y abrir `http://127.0.0.1:4182/tests/visual/portal.html` (no `file://`). Son fixtures sin conexión a Supabase ni Gmail. Correo ficticio `valeria@example.invalid`, código `123456`; `?owner` muestra la administración. No usar ese código en producción.
