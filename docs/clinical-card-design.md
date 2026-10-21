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
- Estrategias: tarjetas de resumen con acción, responsable previsto, revisión y estado. La redacción manual y la propuesta de IA abren el mismo modal en seis pasos: propósito, acción, recursos, aplicación, seguimiento y acuerdo. Los campos cambian según la categoría y la vía. Guardar o aprobar cierra el modal y devuelve el foco a la tarjeta; un error conserva el editor.
- La propuesta de estrategia de IA ofrece una vista previa desplegable. Al agregarla se retira de pendientes y abre el modal. El botón usa el azul del componente compartido de IA; se retiraron las reglas de consulta que lo cambiaban a verde.
- La estrategia se aprueba explícitamente en el último paso. El inicio, la comunicación, la finalización y el retiro permanecen como eventos separados, bajo «Ejecución y acciones». Se conservan la recuperación de borradores, los vínculos con PES/objetivos, las versiones, las fuentes completas y la consulta en modo de solo lectura.
- La navegación superior refleja el avance de revisión, PES y objetivos. Recomendaciones y seguimiento quedan como siguientes etapas de rediseño.

## Comprobación

- 65 pruebas focales aprobadas en la iteración del modal: objetivos, propuestas de IA y recorrido de consulta. Incluyen conservación de textos canónicos, guardado antes de aprobar, acuerdos pendientes, PES cambiado, recuperación de borradores, fallo de guardado, retirada de propuestas agregadas y retirada del último objetivo.
- 60 pruebas focales aprobadas en la iteración de estrategias: formato de propuestas, evidencia completa, redacción manual, guardado fallido, acuerdo explícito, contexto cambiado, consulta sin alterar la aprobación, ejecución y solo lectura, junto al recorrido de consulta.
- TypeScript, ESLint de archivos afectados, `git diff --check` y build de producción aprobados.
- Revisión visual con los componentes reales y datos ficticios en escritorio y un iframe de 390 px: contenido de 390 px, sin desbordamiento horizontal. Se revisaron las tarjetas y campos en tema de noche.
- Recorrido visual de objetivos: generar dos propuestas de demostración, agregar una, revisarla por pasos, registrar el acuerdo y guardar para regresar a la lista. Se comprobaron Escape, devolución del foco y tema de noche. La demostración utiliza servicios sustituidos y almacenamiento local; no emplea expedientes reales ni consume IA.

Se revisó también el recorrido de estrategias con un borrador manual y una propuesta de IA de demostración: abrir el modal, registrar el acuerdo, aprobar y volver a la tarjeta. El inicio de ejecución no se registra al aprobar.

Vista local: `frontend/tests/visual/consultation-flow.html?clinical-design=1`. Comprobación adaptable: `frontend/tests/visual/consultation-flow-responsive.html`. Ambas se sirven con `frontend/tests/visual/consultation-flow.vite.config.ts`.

No requiere migraciones ni despliegue de Edge Functions.


## Exportaciones, Superlink y confirmaciones · 20 de octubre de 2026

- El PDF y el texto de la consulta leen el mismo conjunto de bloques de datos guardados: recordatorio confirmado (incluida estimación revisada), resultados de esta consulta, revisión del PES, objetivos SMART completos y estrategias. Los borradores, aprobaciones, revisiones pendientes y eventos de ejecución conservan sus estados explícitos. Las propuestas abiertas en el navegador no se exportan.
- La exportación profesional identifica la revisión de la consulta y conserva las respuestas visibles, indicaciones, notas y seguimiento del cuestionario. Los objetivos estructurados sustituyen su texto compuesto para evitar duplicarlo.
- La navegación clínica tiene seis pasos: datos, PES, objetivos, estrategia, indicaciones y seguimiento. El último reúne indicadores y plazos de objetivos y estrategias aprobados. Las fechas adicionales de la plantilla se muestran allí.
- Un aviso accesible confirma cada fuente revisada, la aprobación del PES, objetivos y estrategias, y la finalización explícita de indicaciones y seguimiento. Ofrece continuar; la navegación espera la acción del usuario. Cargar datos previamente aprobados no dispara avisos. Las marcas de revisión y de los dos últimos pasos son ayudas de la sesión, independientes de las aprobaciones clínicas persistidas.
- Superlink ofrece una selección de tarjetas aprobadas de consultas finalizadas. La vista previa y Mi guía usan los mismos componentes. El profesional publica explícitamente los campos del paciente; evidencia, etiología, notas internas e historial de ejecución no se copian.
- Los PDF y LaTeX del plan añaden las tarjetas expresamente compartidas de la misma consulta únicamente para la versión actualmente compartida. Se identifica la fecha de publicación de la guía; las versiones anteriores del menú no incorporan selecciones de una versión posterior.
