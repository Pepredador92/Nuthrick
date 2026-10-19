# Guardado de respuestas de consulta

## Comportamiento

El autoguardado agrupa los cambios tras dos segundos de pausa. La navegación entre secciones, módulos y pasos clínicos no espera a que termine una petición de respuestas. Se conservan los controles existentes para mediciones, estudios y recordatorios sin confirmar. Generar o aprobar contenido clínico, cambiar de diseño, guardar y salir o finalizar la consulta siguen esperando un guardado confirmado.

Cada petición de sincronización tiene un límite de 20 segundos, tanto si se detiene en la sesión/autorización del cliente como en la red. Se cancela el transporte y se libera el estado de espera al vencer ese límite. La interfaz muestra “Pendiente de sincronizar”, conserva los cambios y ofrece “Reintentar guardado”. Después de un error se pausa el autoguardado; editar o navegar no inicia una cadena de reintentos. Un reintento explícito comprueba primero el estado del servidor.

Solo hay un guardado activo y se conserva la intención más reciente, sin acumular versiones intermedias en una cola. Se envían únicamente campos modificados, incluidos valores vacíos y nulos. Las respuestas idénticas no se actualizan en SQL. Las diferencias se comparan sin depender del orden de propiedades de JSONB.

## Consistencia y recuperación

La migración `20261019192751_resilient_consultation_autosave.sql` añade una versión de respuestas y un recibo del último guardado en el snapshot. Un trigger incrementa la versión cuando cambian respuestas, también desde los RPC clínicos existentes. `sync_consultation_answers` lee respuestas y versión con una única instantánea MVCC; para escribir bloquea primero consulta y después snapshot, comprueba la versión esperada y registra un identificador de petición. Repetir la misma petición confirmada no vuelve a escribir. Reutilizar el identificador con otro contenido se rechaza.

Una petición antigua no puede sobrescribir una versión posterior. Después de una espera incierta se vuelve a leer y se envía una confirmación de versión, incluso si ya no quedan cambios. Esto impide que una escritura anterior todavía en tránsito se aplique después de la recuperación. Las resoluciones tardías del cliente tampoco actualizan la pantalla.

Los cambios remotos en otros campos se incorporan conservando los cambios locales. Si el mismo campo tiene valores incompatibles, se pausa el guardado y se muestran ambas versiones con sus etiquetas. El profesional puede conservar sus campos modificados o usar lo guardado en el servidor. Una nueva modificación concurrente vuelve a comprobarse; no se sobrescribe silenciosamente. Los intentos de conciliación por conflictos están limitados.

El borrador temporal de la pestaña conserva valores, base confirmada, revisión y estado de revisión pendiente. Al reabrir se recuperan únicamente preguntas compatibles con el cuestionario vigente. Un borrador antiguo que no tenga base de versión requiere comparación explícita antes de sincronizar si difiere del servidor; esa condición se conserva aunque se recargue de nuevo. El almacenamiento local no sustituye la confirmación del servidor ni garantiza recuperar datos si se borra el almacenamiento o se pierde la pestaña. Si el navegador rechaza el respaldo, la pantalla lo informa.

## Compatibilidad y permisos

El RPC público es `SECURITY INVOKER`. Su implementación privada usa `SECURITY DEFINER` exclusivamente para el control del snapshot y verifica sesión, titularidad, consulta editable, última revisión, acceso comercial y paciente habilitado en Respaldo. Los anónimos no pueden ejecutarlo. No hay concesiones nuevas de escritura directa al cliente.

El RPC anterior conserva su firma para los servicios clínicos y evita actualizar filas idénticas. Una pestaña antigua sin control de versión debe recargarse cuando esa revisión ya haya utilizado el protocolo nuevo; un trigger impide que sus escrituras sobrescriban lo sincronizado. Los RPC clínicos privados, que comprueban su autorización, siguen participando en el contador de versión. Desplegar primero la migración y después el frontend. Las pestañas abiertas necesitan recargar el frontend para utilizar el flujo nuevo; si hay respuestas sin confirmar, conservarlas y revisar el borrador recuperado.

No se utilizan llamadas de IA, claves de servidor ni registros de contenido clínico para sincronizar respuestas. El límite de espera corresponde a este guardado; no sustituye los controles de otros formularios o procesos de la aplicación.

## Verificación

- 208 pruebas frontend en 29 archivos: consulta, navegación con guardado pendiente, timeout, reintento, conservación del último cambio, migración de borradores, conflictos, objetivos, estrategias, anuncios y contexto.
- 16 comprobaciones HTTP con Auth y PostgreSQL reales en un entorno aislado: lectura atómica, deltas, recibos, escrituras tardías, confirmación de versión, compatibilidad clínica, timestamps sin cambios, versiones obsoletas, campos desconocidos, propiedad, anónimos y consulta finalizada.
- Instalación aislada desde cero con todas las migraciones y ocho comprobaciones integradas adicionales, sin proveedor de IA.
- TypeScript, compilación y ESLint de los archivos modificados aprobados. Las 67 regresiones SQL de Respaldo y las de anuncios siguen pasando.
- Asesores de seguridad antes y después de aplicar la migración: mismos hallazgos previos, sin hallazgos nuevos.

Comandos desde `frontend`:

```sh
npm test -- src/features/consultations/answerAutosave.test.ts src/screens/ConsultationPage.test.tsx src/services/consultations.test.ts
npm run typecheck
npm run build
```

Integración aislada desde la raíz, con los requisitos de `scripts/setup-three-features-local.mjs`:

```sh
node scripts/setup-three-features-local.mjs
node scripts/test-three-features-local.mjs
node scripts/test-consultation-autosave.mjs
```

El último script solo admite `NuthrickFeatureAudit` en `127.0.0.1:55321`. Usa sus propias cuentas sintéticas y no llama a IA. Los informes y credenciales temporales no se añaden a Git. Esta verificación no mide la capacidad máxima de usuarios simultáneos.
