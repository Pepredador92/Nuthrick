# Revisión clínica, PES y objetivos por tarjetas

Actualizado el 20 de octubre de 2026.

La navegación de la consulta organiza el recorrido. Las tarjetas presentan una tarea y su avance; conservan los servicios, campos canónicos y aprobaciones existentes.

## Interfaz

- Revisión clínica: cuatro fuentes independientes —entrevista, alimentación, mediciones/estudios y antecedentes— con detalle desplegable y acceso al paso de captura cuando falta información. El profesional marca cada fuente al revisarla. Las marcas duran mientras la consulta está abierta y se invalidan si cambia el contenido correspondiente; no son aprobaciones clínicas ni requisitos nuevos de cierre.
- PES: tarjetas P, E y S con una pregunta breve, estado de registro y enunciado compuesto. Se conservan la redacción manual, propuestas de IA, comparación de alternativas, revisión de fuentes y aprobación explícita.
- Objetivos: hasta tres objetivos por prioridad. La consulta muestra tarjetas de resumen con resultado, meta, plazo y estado. Cada objetivo se revisa en un modal con cuatro pasos: cambio, meta, seguimiento y acuerdo. Los diez criterios se conservan, pero solo se muestra un paso a la vez. Al abrir un objetivo existente se presenta su primer paso incompleto; una propuesta recién agregada comienza por el cambio esperado.
- Propuestas de IA: resumen de la meta y el plazo, con texto completo, evidencia y referencias bajo una vista previa. «Agregar y revisar» retira la propuesta de pendientes y abre el modal; las demás siguen disponibles. El acuerdo continúa pendiente hasta que el profesional lo registra.
- Guardar y cerrar: persiste el borrador y devuelve el foco al objetivo de la lista. Si el guardado falla, conserva el editor y su contenido. Consultar un objetivo aprobado sin editarlo no revoca su aprobación. Cerrar sin guardar conserva el borrador local y mantiene los avisos de cambios pendientes.
- Estados: pendiente, en curso, completo para revisión y aprobado. El color se acompaña de texto e iconos. Completar los campos o guardar el borrador no aprueba el objetivo. Se conservan los controles de acuerdo, signos vigentes, cambio del PES, longitud y contexto.
- Se puede guardar la retirada del último objetivo. Continúan la recuperación del borrador, la prioridad, el límite de tres y los controles de salida de consulta.
- La navegación superior refleja el avance de revisión, PES y objetivos. Estrategias, recomendaciones y seguimiento conservan sus formularios actuales y quedan como siguientes etapas de rediseño.

## Comprobación

- 65 pruebas focales aprobadas en la iteración del modal: objetivos, propuestas de IA y recorrido de consulta. Incluyen conservación de textos canónicos, guardado antes de aprobar, acuerdos pendientes, PES cambiado, recuperación de borradores, fallo de guardado, retirada de propuestas agregadas y retirada del último objetivo.
- TypeScript, ESLint de archivos afectados, `git diff --check` y build de producción aprobados.
- Revisión visual con los componentes reales y datos ficticios en escritorio y un iframe de 390 px: contenido de 390 px, sin desbordamiento horizontal. Se revisaron las tarjetas y campos en tema de noche.
- Recorrido visual: generar dos propuestas de demostración, agregar una, revisarla por pasos, registrar el acuerdo y guardar para regresar a la lista. Se comprobaron Escape, devolución del foco y tema de noche. La demostración utiliza servicios sustituidos y almacenamiento local; no emplea expedientes reales ni consume IA.

Vista local: `frontend/tests/visual/consultation-flow.html?clinical-design=1`. Comprobación adaptable: `frontend/tests/visual/consultation-flow-responsive.html`. Ambas se sirven con `frontend/tests/visual/consultation-flow.vite.config.ts`.

No requiere migraciones ni despliegue de Edge Functions.
