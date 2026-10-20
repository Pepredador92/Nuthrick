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

La versión histórica `consultation_support@4` recibe el PES actual aprobado, datos de valoración actuales y antecedentes con sus etiquetas y fechas, además del contexto de entrevista. La función de origen añade `approvedPes` separadamente de las respuestas sin aprobar y lo incorpora a la huella de contexto.

Toda la IA de la plataforma debe usar Luna. La configuración de producción actual es `gpt-5.6-luna`; los errores de validación se corrigen en el contrato y sus adaptadores, sin cambiar a otra familia de modelos.

Las propuestas contienen componentes estructurados y referencias a hechos existentes. El servidor recupera la etiología del PES aprobado y conserva su signo literal al reconocer una copia con cambios de espacios/mayúsculas, una única cita explícita de signo o un único signo disponible. Los signos ambiguos siguen rechazándose. La situación inicial se recupera de un hecho existente y citado; no se acepta una referencia inventada.

En @4, metas y plazos solo se conservaban como fragmentos documentados en campos actuales de acuerdos/acciones. Esa restricción explicaba los campos vacíos. La versión @5 distingue los hechos del expediente de las propuestas futuras: permite metas conductuales y plazos editables sin afirmar que ya fueron acordados. Los datos iniciales, la etiología y el signo siguen recuperándose de fuentes existentes. No convierte una medición en una meta ni permite nuevas prescripciones cuantitativas sin un acuerdo documentado. Los rechazos registran códigos técnicos sin contenido clínico.

El acuerdo siempre llega como pendiente. La interfaz muestra los datos citados y requiere selección explícita para agregar la propuesta al formulario SMART. Las metas y plazos sugeridos se identifican en el editor mientras falta el acuerdo; el profesional puede modificarlos. Los demás campos pendientes deben completarse antes de aprobar. Se preservan idempotencia, contabilidad y permisos. El límite de salida es de 3.000 tokens para el contenido estructurado. La normalización no ejecuta una segunda llamada al proveedor.

## Persistencia y despliegue

La migración `20261019031448_smart_objectives_from_pes.sql` guarda borradores por clave en `clinical_records.objective_plans` y el plan aprobado en `clinical_records.objective.smart_plan`, con profesional y PES de referencia. El RPC conserva autenticación, comprobación de titularidad, última revisión editable, bloqueos de fila y validación de contexto. La función pública es `security invoker`; el código privilegiado está en el esquema privado con permisos explícitos. No hay tablas ni políticas RLS nuevas.

Orden de publicación inicial: desplegar primero la función Edge que entiende `consultation_support@4`, después aplicar las migraciones pendientes (incluida la previa del PES) y publicar el frontend coordinadamente. El RPC incorpora `p_plan` y las nuevas aprobaciones requieren el plan. La corrección de normalización se desplegó en producción el 2026-10-19, versión 36 de la función `ai`, conservando la verificación JWT.

## Comprobaciones

La corrección del 2026-10-19 pasó 55 pruebas Deno de objetivos, validación clínica y ejecución de solicitudes, además de `deno check` sobre la función. Los proveedores de esas pruebas son simulados y no usan créditos reales. En producción se verificó el código desplegado, la respuesta CORS 204 y las nueve configuraciones con Luna.

Después se realizó una única generación real autorizada con el expediente sintético de auditoría: `gpt-5.6-luna`, estado `succeeded`, 0.122 créditos. La propuesta apareció en la interfaz, se agregó al formulario SMART y se guardó como borrador. La consulta directa confirmó su persistencia sin aprobación clínica. Meta, plazo y acuerdo quedaron pendientes de completar. No hubo solicitudes con Sol durante el cambio transitorio de configuración. La vista local `tests/visual/clinical-copilot.html`, pestaña Objetivo, continúa usando datos sintéticos y persistencia local.

## Metas propuestas y lenguaje para pacientes — 20 de octubre de 2026

`consultation_support@5` conserva Luna y sus límites. Recibe referencias al signo del PES y a la situación inicial; el servidor incorpora los textos clínicos literales. La meta y el plazo son obligatorios en la propuesta. Si coinciden con un acuerdo actual, se identifican como documentados; si no, como propuestas para revisar. El acuerdo permanece pendiente.

La orientación para objetivos conductuales iniciales permite considerar contacto temprano en 7–14 días y reevaluación en 2–4 semanas; se conserva un plazo ya documentado, incluidos 21 días si corresponde. Son ventanas de planificación por individualizar, no plazos universales de una guía. No se inventan citas, duración de sesiones, modalidad, disponibilidad o consolidación de una conducta. La Academy vincula la frecuencia a contexto, necesidades y preferencias; el NIDDK respalda apoyo frecuente en programas conductuales intensivos, sin prescribir un calendario único para cada objetivo.

Las propuestas nuevas usan palabras cotidianas y trato de tú. El texto `patient_v1` incluye acción, criterio de avance, cuándo revisar y cómo hacerlo; conserva el indicador, el punto de partida y el vínculo clínico dentro del editor profesional. Ese mismo texto se guarda en la respuesta de entrevista utilizada por exportación y publicación explícita al paciente. No se crea un resumen independiente que pueda contradecir los campos editados. Los planes anteriores sin ese formato mantienen su composición original.

El cliente solicita expresamente el formato de texto para pacientes. Los clientes anteriores siguen recibiendo objetivos compatibles con el compositor anterior. El formato entra en la huella de idempotencia cuando se solicita; no permite cambiar modelo, prompt, permisos ni precio desde el navegador.

Referencias de planificación:

- [Academy: intervención y metas SMART](https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-intervention).
- [Academy: seguimiento y evaluación](https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-monitoring-and-evaluation).
- [NIDDK: tratamiento y apoyo conductual](https://www.niddk.nih.gov/health-information/weight-management/adult-overweight-obesity/treatment).

### Publicación y comprobaciones de @5

- Edge Function `ai` versión 43 activa, con contenido remoto comparado con los archivos publicados.
- Migración `20261020201721` aplicada; configuración consultada en producción: `consultation_support@5`, Luna y presupuestos conservados.
- El compositor SQL incorpora `patient_v1` y conserva literalmente la rama anterior para planes sin ese formato. Sigue sin ser ejecutable directamente por usuarios autenticados.
- Comprobación de tipos de Deno y TypeScript, ESLint de los archivos de interfaz modificados y compilación de producción aprobados.
- Los avisos de seguridad de Supabase conservan los conteos anteriores. No hay nuevas tablas, políticas, privilegios ni publicaciones automáticas al paciente.

No se hicieron generaciones de pago ni modificaciones en expedientes durante esta entrega. La evaluación de pertinencia clínica y el acuerdo siguen siendo del profesional y la persona.
