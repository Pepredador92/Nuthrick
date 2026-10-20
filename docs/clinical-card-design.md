# Revisión clínica, PES y objetivos por tarjetas

19 de octubre de 2026.

La navegación de la consulta organiza el recorrido. Las tarjetas presentan una tarea y su avance; conservan los servicios, campos canónicos y aprobaciones existentes.

## Interfaz

- Revisión clínica: cuatro fuentes independientes —entrevista, alimentación, mediciones/estudios y antecedentes— con detalle desplegable y acceso al paso de captura cuando falta información. El profesional marca cada fuente al revisarla. Las marcas duran mientras la consulta está abierta y se invalidan si cambia el contenido correspondiente; no son aprobaciones clínicas ni requisitos nuevos de cierre.
- PES: tarjetas P, E y S con una pregunta breve, estado de registro y enunciado compuesto. Se conservan la redacción manual, propuestas de IA, comparación de alternativas, revisión de fuentes y aprobación explícita.
- Objetivos: hasta tres objetivos por prioridad. Cada uno agrupa sus diez criterios en «El cambio que buscamos», «Cómo sabremos que avanzó» y «Lo que acordaron». Se muestra una parte a la vez, con contador, barra de avance y acceso al siguiente pendiente. Al reabrir un plan se presenta su primera parte incompleta.
- Estados: pendiente, en curso, completo para revisión y aprobado. El color se acompaña de texto e iconos. Completar los campos o guardar el borrador no aprueba el objetivo. Se conservan los controles de acuerdo, signos vigentes, cambio del PES, longitud y contexto.
- Se puede guardar la retirada del último objetivo. Continúan la recuperación del borrador, la prioridad, el límite de tres y los controles de salida de consulta.
- La navegación superior refleja el avance de revisión, PES y objetivos. Estrategias, recomendaciones y seguimiento conservan sus formularios actuales y quedan como siguientes etapas de rediseño.

## Comprobación

- 89 pruebas focales aprobadas: revisión, invalidación de marcas, PES, objetivos, propuestas, mediciones, estrategias y recorrido de consulta. Incluyen conservación de textos canónicos, guardado antes de aprobar, acuerdos pendientes, PES cambiado y retirada del último objetivo.
- TypeScript, ESLint de archivos afectados, `git diff --check` y build de producción aprobados.
- Revisión visual con los componentes reales y datos ficticios en escritorio y un iframe de 390 px: contenido de 390 px, sin desbordamiento horizontal. Se revisaron las tarjetas y campos en tema de noche.
- Recorrido visual de objetivo: 6/10 → 8/10 → 10/10, guardar borrador y aprobación posterior explícita. La demostración utiliza servicios sustituidos y almacenamiento local; no emplea expedientes reales ni consume IA.

Vista local: `frontend/tests/visual/consultation-flow.html?clinical-design=1`. Comprobación adaptable: `frontend/tests/visual/consultation-flow-responsive.html`. Ambas se sirven con `frontend/tests/visual/consultation-flow.vite.config.ts`.

No requiere migraciones ni despliegue de Edge Functions.
