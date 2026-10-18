# Objetivos nutricionales vinculados al PES

## Criterios clínicos

La [Academy: Nutrition Intervention](https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-intervention) describe metas SMART, colaboración con la persona, preferencias, recursos y una intervención dirigida a la etiología del PES. [Nutrition Monitoring and Evaluation](https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-monitoring-and-evaluation) establece el seguimiento mediante indicadores comparados con criterios seleccionados por el profesional.

La implementación usa esos principios para documentar la respuesta esperada y su seguimiento. La estructura comprueba que se documenten los componentes; la pertinencia clínica, la viabilidad y la calidad del acuerdo requieren juicio profesional. No aplica metas universales ni un catálogo clínico licenciado. El [documento de ASPEN sobre proteínas viscerales](https://nutritioncare.org/visceral-proteins-in-nutrition-assessment/) fundamenta la instrucción de no usar albúmina o prealbúmina aisladas como marcadores nutricionales.

## Flujo

- Un editor por pregunta existente (`treatment_objective`, `objectives`, `next_objectives`), sin duplicar el campo libre.
- Hasta tres objetivos ordenados por prioridad. Cada uno documenta resultado esperado, causa del PES que se abordará, signo del PES vigente, indicador, situación inicial y fecha, meta, plazo, método de seguimiento, viabilidad/barreras/preferencias y acuerdo con paciente o cuidador.
- La situación inicial puede explicitar que falta un dato y cómo se obtendrá: no se inventa un valor para rellenar el formulario.
- El enunciado se compone con resultado, indicador, situación inicial, meta, reevaluación y seguimiento. El detalle clínico queda en el plan de la revisión.
- Borradores incompletos pueden guardarse sin aprobarlos. Los cambios pendientes se recuperan en la misma sesión y bloquean el cierre hasta guardarlos.
- Una nueva aprobación exige los componentes completos, acuerdo documentado, PES aprobado y vigente, signo perteneciente al PES y coincidencia del texto con el plan.
- Si cambia el PES, se revisa el vínculo y sus signos antes de aprobar de nuevo. Las invalidaciones existentes siguen retirando aprobaciones cuando cambian entrevista, medidas o laboratorios.
- Los textos y aprobaciones anteriores se conservan. Convertir un texto anterior a la nueva estructura es una acción explícita; no se afirma que una aprobación anterior ya cumplía estos criterios.
- Se mantiene el tipo de respuesta original, incluido el grupo repetible de seguimiento. El texto sigue disponible para cierre, exportación y selección/publicación explícita en Super Link. Los objetivos no cambian prescripciones energéticas ni macronutrientes.

## IA

`consultation_support@4` recibe el PES actual aprobado, datos de valoración actuales y antecedentes con sus etiquetas y fechas, además del contexto de entrevista. La función de origen añade `approvedPes` separadamente de las respuestas sin aprobar y lo incorpora a la huella de contexto.

Las propuestas contienen componentes estructurados y referencias a hechos existentes. Etiología y signo deben corresponder al PES. La línea inicial se recupera de un hecho citado. Metas y plazos solo se aceptan como fragmentos documentados en campos actuales de acuerdos/acciones; lo no documentado queda vacío para definición profesional. El acuerdo siempre llega como pendiente. La interfaz muestra los datos citados y requiere selección explícita para agregar la propuesta. Se preservan idempotencia, contabilidad, modelo, precios unitarios y permisos. El límite de salida pasa a 3.000 tokens para el contenido estructurado; por ello aumenta la reserva máxima posible de la solicitud.

## Persistencia y despliegue

La migración `20261018223247_smart_objectives_from_pes.sql` guarda borradores por clave en `clinical_records.objective_plans` y el plan aprobado en `clinical_records.objective.smart_plan`, con profesional y PES de referencia. El RPC conserva autenticación, comprobación de titularidad, última revisión editable, bloqueos de fila y validación de contexto. La función pública es `security invoker`; el código privilegiado está en el esquema privado con permisos explícitos. No hay tablas ni políticas RLS nuevas.

Orden de publicación: desplegar primero la función Edge que entiende `consultation_support@4`, después aplicar las migraciones pendientes (incluida la previa del PES) y publicar el frontend coordinadamente. Recargar las pestañas abiertas: el RPC incorpora `p_plan` y las nuevas aprobaciones requieren el plan. No se han aplicado cambios remotos como parte de esta implementación.

## Comprobaciones

Se comprueban tipos TypeScript y Deno, ESLint, compilación de frontend y compilación de la migración en un esquema PostgreSQL local desechable con rollback. No se ejecutan pruebas funcionales ni llamadas reales de IA. La vista local `tests/visual/clinical-copilot.html`, pestaña Objetivo, usa datos sintéticos y persistencia local.
