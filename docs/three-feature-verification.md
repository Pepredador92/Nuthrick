# Verificación de anuncios, objetivos SMART y estrategias

Fecha: 19 de octubre de 2026. Aplicación: Nuthrick. Comprobaciones con datos sintéticos en entorno local aislado y Chrome autenticado en producción.

## Resultado por módulo

| Módulo | Producción | Integración local |
| --- | --- | --- |
| Anuncios | Crear anuncio habilitado después de cargar la lista. Carga y guardado de dos borradores con PNG y MP4; vista previa del modal; imagen decodificada a 640 px; video H.264 con controles, sin autoplay, reproducido hasta el segundo final sin error. | Auth y Storage reales, descarga firmada y comprobación de contenido; borrador y pausa inaccesibles para profesionales; publicación; frecuencias una vez, por sesión y hasta cerrar; dos sesiones Auth; recibos; versiones; permisos; eliminación y limpieza de archivos. |
| Objetivos SMART | Generación real desde el PES aprobado; selección y edición de propuesta; definición de meta, plazo, viabilidad y acuerdo sintético; guardado y aprobación. Tras recargar el frontend corregido y reabrir la consulta, conserva los campos y muestra “Aprobados”. | Generación real con el handler de producción, guardado del plan completo y aprobación explícita; controles de PES/contexto/acuerdo; regresión de JSONB y cambios sin guardar. |
| Estrategias | Generación real después de las aprobaciones; selección, edición de parámetros operativos, borrador y aprobación como versión 1; historial de aprobación visible. Persistencia confirmada mediante lectura limitada a la consulta sintética. | Generación real, evidencia completa, edición, aprobación, inicio explícito e historial. Comprobaciones de acceso, pacientes habilitados en Respaldo, contexto y concurrencia en las regresiones correspondientes. |

La entrega de anuncios al iniciar sesión se comprobó de forma integrada local. En producción se conservaron como borradores privados de administración: no se difundieron anuncios de auditoría a usuarios reales. La consulta sintética se conserva abierta, con objetivo y estrategia aprobados; no se publicó contenido en un portal ni se registró ejecución real de tratamiento.

## Correcciones de la auditoría

1. **Permisos de Respaldo:** las ocho mutaciones de estrategias validan la selección y vigencia del paciente habilitado; la lectura histórica se conserva. Migración `20261019035119_enforce_intervention_retention_patient.sql`.
2. **Evidencia SMART larga:** cada componente se cita completo por separado; el servidor valida el documento hidratado antes del éxito. El cliente presenta un error explícito ante una colección incompatible. Se conserva el límite normalizado de 90.000 bytes de JSONB.
3. **Pruebas antiguas:** se actualizaron los fixtures y expectativas al plan SMART estructurado y al paso de estrategias. Las medidas históricas conservan su fecha.
4. **Instalación limpia:** SELECT explícito de `service_role` sobre `consultation_device_sessions`. Producción ya tenía ese permiso; la migración `20261019043838_grant_clinical_device_context_read.sql` permite reproducir el contexto clínico con concesiones automáticas desactivadas. No se concedió lectura a clientes.
5. **Etiqueta SMART:** una comparación de JSON serializado dependía del orden de propiedades. JSONB las reordena. Se compara ahora el contenido de cada campo, el orden de metas, el acuerdo y el vínculo PES. La prueba añadida falló antes de corregirlo y pasa después.
6. **Parámetros operativos de la IA:** una dosis, composición, acceso, frecuencia, duración o inicio sin respaldo textual se elimina de la propuesta y se señala como pendiente de definición profesional. Se conserva el acuerdo pendiente. Las acciones con cifras no sustentadas, citas inexistentes, vías no sustentadas y documentos incompatibles siguen rechazándose. Los errores registran códigos técnicos sin texto clínico.

### Salidas inválidas observadas

Antes del último ajuste hubo dos respuestas de estrategias rechazadas en producción como `invalid_output`, con consumo confirmado y sin modificación del expediente. El servicio no conserva su texto íntegro; no puede atribuirse retrospectivamente cada rechazo a un campo concreto. Se incorporaron diagnósticos técnicos para distinguir futuros rechazos y normalización conservadora de parámetros no documentados, con pruebas de esquema, HTTP y de mantenimiento de los controles restantes. La generación posterior al despliegue pasó y permitió guardar y aprobar la estrategia. Esto no garantiza que toda salida futura del modelo sea válida: las salidas incompatibles seguirán rechazándose, sin reintento automático.

## Evidencia de comprobaciones

| Comprobación | Resultado |
| --- | --- |
| Frontend: selección de consulta, anuncios, objetivos, estrategias y contexto | 187 pruebas / 27 archivos aprobados |
| IA: core, contexto clínico, calibración y handler HTTP | 72 pruebas, 26 pasos HTTP, aprobados |
| SQL de anuncios | Publicación, RLS de archivos, frecuencias, sesiones, validación, versiones y auditoría aprobadas |
| SQL de Respaldo | 67 comprobaciones aprobadas |
| Evidencia hidratada en PostgreSQL | Tres documentos largos guardados; documento sobredimensionado rechazado; rollback |
| Instalación aislada desde cero | Todas las migraciones aplicadas; ocho comprobaciones integradas sin proveedor aprobadas |
| Integración opcional con IA real tras corrección | Diez comprobaciones aprobadas; dos generaciones exitosas; cero créditos reservados al terminar |
| TypeScript, Deno y compilación frontend | Aprobados |
| ESLint de componentes modificados | Aprobado |
| ESLint general | Tres errores previos en `AIProcessingConsent.tsx` y `tests/visual/text-diet.tsx`, archivos sin cambios en esta entrega |

El último par integrado de llamadas locales costó USD 0.0025934. Las cuatro llamadas de producción de esta auditoría —un objetivo, dos estrategias rechazadas y una válida— costaron USD 0.00584152 y contabilizaron 0.586 créditos; las cuatro quedaron liquidadas, sin solicitudes pendientes. No se modificaron precios ni saldos manualmente. La prueba integrada tiene un límite configurado de USD 0.05 y marcadores de intento para evitar repetir llamadas inciertas. Dos llamadas diagnósticas adicionales usaron únicamente la copia sintética del caso, fuera de producción.

Los resultados comprueban el comportamiento técnico observado, no la pertinencia clínica de un tratamiento. Los casos no corresponden a pacientes reales. No se verificaron todos los dispositivos ni todas las condiciones posibles de respuesta del proveedor.

## Publicación y datos de prueba

- Correcciones de código: `6d65e37` en `main`, subido a GitHub.
- Frontend de ese commit: `dpl_43GrSBvUUFR6UgGzoQBf3LpjRsNQ`, estado READY y asociado a `nuthrick.com`.
- Edge `ai`: versión 35, ACTIVE, JWT requerido.
- Migración de lectura del contexto aplicada en producción con su versión coincidente en el repositorio.
- Se conservan los borradores **PRUEBA TÉCNICA · imagen · no publicar** y **PRUEBA TÉCNICA · video · no publicar**, y el paciente **PRUEBA TÉCNICA · auditoría SMART y estrategias**, sin correo, teléfono ni portal habilitado.

Las capturas y resúmenes sin credenciales se guardan en `output/three-features-final-2026-10-19/`. Los archivos temporales, copias locales de seguridad y credenciales no se incluyen en Git.

## Repetir la integración

Consultar los comandos y requisitos en [Estrategia de intervención: auditoría integrada](clinical-intervention-strategies.md#auditoría-integrada-del-19-de-octubre-de-2026). El entorno fijo es `NuthrickFeatureAudit`, URL `http://127.0.0.1:55321`, directorio `tmp/feature-audit-local`; no se enlaza con un proyecto remoto.
