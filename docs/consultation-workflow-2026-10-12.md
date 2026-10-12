# Consulta: recordatorio independiente y síntesis clínica

## Auditoría de datos

| Función | Fuente actual | Antecedentes y límites |
| --- | --- | --- |
| Recordatorio de 24 horas | Narrativa explícita de la consulta; revisión manual de alimento, cantidad y unidad contra catálogo. Confirmación en `consultation_snapshots.clinical_records.recall`. | La IA organiza texto, no calcula nutrientes ni inventa cantidades. Los totales siguen usando el motor determinista de equivalentes. |
| PES | `ai_clinical_source`: respuestas permitidas de la revisión actual, mediciones, resultados calculados vigentes, laboratorios y recordatorio confirmado. | Primera consulta inicial y hasta tres consultas cerradas recientes anteriores. Incluye entrevistas y PES aprobados con fecha; los antecedentes no confirman vigencia actual. Se validan las evidencias contra hechos reales. |
| Objetivos | La misma fuente clínica, filtrada a expectativas, prioridades, barreras, cambios, objetivos y acuerdos relevantes. | El filtro anterior descartaba entrevistas históricas incluso cuando no había entrevista actual. Ahora admite los temas relevantes del historial en ese caso, conservando fechas y poniendo los hechos actuales primero. Nunca transforma una medición en una meta. |
| Indicaciones para el paciente | `ai_patient_instructions_source`: acuerdos y respuestas permitidas de la consulta actual, con recordatorio confirmado como contexto. | Mantiene la exigencia de al menos un acuerdo actual como evidencia; los acuerdos antiguos no se consideran aceptados hoy. |
| Notas | `composeInterviewDraft`, composición local con los datos registrados. | Este mecanismo no hace solicitudes de IA. Se conserva. |
| Taller de dietas | Fuentes de dieta vinculadas al paciente, consulta y revisión: prescripción actual, PES/objetivo aprobados, restricciones, catálogo y resumen del recordatorio confirmado. | Conserva los mismos campos de almacenamiento, cálculo de nutrientes, aprobaciones y validación de contexto. No se altera la prescripción ni se convierte un recordatorio en dieta. |

## Cambios

- Secuencia de consulta: entrevista → recordatorio de 24 horas → mediciones → laboratorios → revisión clínica, PES y objetivos → evolución/cierre. Taller permanece vinculado a la misma consulta.
- La entrevista muestra sus preguntas; los campos del recordatorio y de decisiones clínicas se presentan en pasos independientes sin renombrar respuestas o reemplazar preguntas personalizadas.
- Una RPC idempotente añade preguntas comunes opcionales que falten **solo al último snapshot de un borrador propio**. Conserva respuestas, revisiones, etiquetas existentes, metadata de aprobación, plantillas personales y consultas cerradas. La estructura guardada permite seguir exportando y leyendo los nuevos campos por los mecanismos actuales.
- La síntesis clínica incluye tarjetas de revisión, PES, objetivos y recomendaciones. Expone las fuentes actuales y antecedentes fechados mediante detalles desplegables.
- El pie de navegación indica el próximo paso. Mediciones y Laboratorios conservan sus componentes y guardado. Las propuestas clínicas esperan a que se guarden sus capturas pendientes. Un recordatorio editado sin confirmar bloquea el cierre y conserva su edición al cambiar de paso.
- Los objetivos distinguen `interviewOrigin` actual/histórico/ausente. PES y objetivos priorizan los hechos actuales incluso sin entrevista. El historial es apoyo fechado sujeto a confirmación, no datos actuales.
- Nuevos prompts compatibles: `pes_diagnosis@4`, `consultation_support@3`. Se mantienen los adaptadores previos, permisos, revisión profesional, límites y contabilización de créditos.

## Verificación

- Tests de consulta: inicial/seguimiento, separación de campos, persistencia de etiquetas y claves, guardado antes de IA, conservación de mediciones al cambiar de paso, rechazo de capturas pendientes y cierre explícito.
- Tests de contexto: prioridad actual, apoyo histórico cuando falta entrevista, identificación de fechas y conservación del requisito de acuerdos actuales para indicaciones.
- SQL en PostgreSQL local desechable: idempotencia, conservación de metadata y preguntas personalizadas, guardado real de respuestas nuevas, aislamiento por propietario, revisión vigente, acceso comercial, prohibición de cambiar consultas cerradas y permisos RPC. Historial PES verificado con los fixtures existentes; rollback de todas las pruebas.
- Vista previa offline con el componente real: `frontend/tests/visual/consultation-flow.html`, parámetro `?follow-up` para seguimiento. No usa pacientes reales ni consume créditos.

La suite completa de frontend terminó con 1,186 tests aprobados y tres fallos preexistentes (landing con expectativa de un texto antiguo y páginas legales con un mock incompleto). Se reprodujeron los mismos tres fallos en una copia limpia de `main`. Las 49 pruebas focales de este flujo, 55 pruebas Deno, typecheck, ESLint focal y build de producción pasaron. Las verificaciones SQL de preparación y de historial PES pasaron en la base local desechable.

Backend desplegado: Edge `ai` v31 con JWT obligatorio y migración `20261012200811_consultation_workflow_steps.sql`. Prompts remotos verificados. La comparación de asesores de seguridad antes/después no añadió avisos.

Prueba remota transaccional aprobada: borrador sintético de seguimiento, preparación idempotente, campos de recordatorio/PES, guardado por la RPC existente y presencia del recordatorio en la fuente de IA. Rollback verificado: cero pacientes sintéticos restantes. No hubo llamadas al proveedor ni consumo de créditos.
