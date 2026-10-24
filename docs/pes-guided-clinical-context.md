# Guía para completar el contexto del PES

## Flujo

- «Generar borrador» y «Otra propuesta» abren primero una guía sin consumo de IA.
- La guía guarda el avance y consulta las fuentes reales mediante los lectores clínicos existentes. Muestra presencia de datos, no suficiencia diagnóstica.
- Las preguntas `missingContext` de la última propuesta llevan a campos existentes en el diseño guardado de esa consulta. Se pueden mostrar varios destinos para preguntas compuestas.
- Los destinos se resuelven por claves conocidas y, para diseños propios, por etiquetas reconocidas. Si no hay coincidencia, se ofrece el complemento clínico; no se inventa un enlace.
- Un campo condicional oculto lleva a su pregunta de control. La navegación no modifica respuestas ni crea registros de síntomas o medicamentos.
- El editor abre el módulo y sección, desplaza y enfoca el campo visible. Resalta el destino durante unos segundos.
- «Guardar y volver al PES» conserva la entrevista y el borrador del diagnóstico. Los cambios de mediciones, estudios o recordatorio deben guardarse/confirmarse en su editor antes de regresar.
- Las preguntas de IA no se marcan resueltas por llenar un campo. Una nueva generación revisa la información actualizada y consume créditos como antes; navegar, guardar y consultar la guía no los consume.

## Complemento clínico

`working_drafts['pes-clinical-context']` guarda una aclaración profesional opcional, con el guardado versionado y la autorización de la consulta existentes. La guía la muestra y permite editarla. Se incorpora como fuente de entrevista de la consulta, diferenciada de sus antecedentes fechados. Cambiar su contenido requiere revisar nuevamente las aprobaciones de PES y objetivos; escribir navegación u otros borradores no lo hace.

## Contexto del servidor

La migración `pes_guided_clinical_context` conserva la carga existente de recordatorio confirmado, mediciones, cálculos, laboratorios, datos de ficha y selección histórica (los tres seguimientos previos más recientes y la inicial, cuando corresponde).

Amplía la antigua lista cerrada de preguntas de entrevista con las preguntas de las revisiones guardadas. Así también se transmiten frecuencia de evacuaciones, caracterización de síntomas, líquidos, frecuencias alimentarias, suplementos y preguntas propias. No agrega diagnósticos PES, objetivos o indicaciones generadas como nuevas respuestas de entrevista; conserva el contexto de decisiones que el cargador base proporciona a las otras funciones de IA.

Las aclaraciones clínicas actuales e históricas participan en la firma del contexto. Las claves de navegación no participan. Se conservan los controles de propietario, paciente y revisión, el acceso exclusivo del servicio al cargador y la redacción de identificadores del adaptador de IA. No cambia el modelo, los prompts, la contabilidad de tokens ni se ejecutan llamadas adicionales al proveedor.

## Límite clínico

Esta función orienta la documentación. No predice antes de generar todas las preguntas que necesitará la IA ni convierte mediciones, medicamentos o asociaciones temporales en causas confirmadas. Si sigue faltando sustento, la etiología permanece pendiente y el profesional conserva el borrador parcial.
