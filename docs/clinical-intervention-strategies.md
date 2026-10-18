# Estrategia de intervención en la consulta

## Flujo y decisiones

Se incorpora el paso **Estrategia** entre Objetivos e Indicaciones: Datos → PES → Objetivos → Estrategia → Indicaciones. El editor trabaja con el PES único y los objetivos SMART aprobados de la revisión. Las relaciones usan el identificador propio de estrategia, la revisión, las fechas de aprobación del PES/objetivos y los índices de objetivos dentro de esa versión inmutable. Un cambio de orden o de objetivos requiere una nueva vinculación explícita; no se reasignan metas silenciosamente.

Cada estrategia documenta categoría, prioridad, objetivos, acción, relación con la etiología, método, inicio previsto, frecuencia, duración, profesional responsable, ejecutor, adaptaciones, monitoreo, reevaluación y criterios de ajuste. Los campos condicionales incluyen vía, acceso, cantidad/unidad, composición, tema educativo, materiales, comprobación de comprensión y coordinación con otros profesionales. La aprobación exige los componentes aplicables y acuerdo registrado con paciente o cuidador. Son controles de documentación; la pertinencia y seguridad clínica dependen de la revisión profesional.

Los borradores pueden estar incompletos y recuperarse en la misma sesión. Guardar un borrador no aprueba ni inicia la estrategia. Las propuestas de IA requieren selección explícita antes de editarlas; se pueden descartar o pedir alternativas con una preferencia de cambio. El cierre advierte sobre borradores locales, propuestas pendientes o formularios de ejecución abiertos. Los borradores guardados pueden conservarse pendientes de aprobación.

## Persistencia y permisos

- `consultation_interventions` conserva borrador, última versión aprobada, estado, datos de ejecución y contador de versión por snapshot.
- `consultation_intervention_history` conserva aprobaciones completas y eventos de inicio, comunicación, finalización, retiro y descarte de un borrador guardado. Las versiones y eventos no se actualizan. El borrado de un borrador sin aprobación es posible; una estrategia aprobada se retira conservando historial.
- Ambas tablas tienen RLS y lectura por titular, con índices en propietario y claves foráneas. Los clientes autenticados no tienen permisos directos de escritura. El RPC público es `security invoker`; la implementación privada valida sesión, acceso a consultas, titularidad, revisión y acciones permitidas.
- Las mutaciones bloquean consulta, snapshot y estrategia en orden. La versión `updated_at` enviada por el cliente evita sobrescribir cambios concurrentes. Las aprobaciones verifican PES/objetivos actuales, referencias a metas y procedencia de una generación IA cuando exista.
- Las revisiones anteriores se consultan en **Cuestionario conservado → Estrategias y registro de ejecución**. Los eventos de ejecución pueden registrarse también después de finalizar la consulta, exclusivamente en la revisión más reciente y conservando el cuestionario.

Una aprobación vigente y el inicio de ejecución son estados diferentes. Registrar inicio exige fecha y ejecutor; registrar comunicación exige destinatario; finalizar o retirar exige un motivo/resultado. El registro de comunicación documenta un hecho informado por el profesional: no envía mensajes al equipo ni al paciente.

## Vigencia y conexiones

La vigencia se calcula con las aprobaciones del PES y objetivos. Cambios de valoración que invalidan esas aprobaciones dejan las estrategias activas como **Requiere revisión**, preservando sus versiones. Editar y guardar una estrategia aprobada crea un borrador; el contenido anterior sigue disponible en historial. Las estrategias finalizadas o retiradas conservan su estado histórico.

La edición de las salidas `first_actions`, `patient_instructions`, `recommendations` y `next_appointment` deja de invalidar el PES y los objetivos que las originan. Las demás reglas existentes de invalidación de valoración y objetivos permanecen.

- **Indicaciones:** se puede copiar la acción aprobada para revisión. La IA de indicaciones recibe acciones aprobadas vigentes; con estrategias registradas exige al menos una vigente y cita esa fuente. Mantiene compatibilidad con acuerdos de consultas antiguas que no tienen estrategias. Ahora admite consultas en borrador y finalizadas.
- **Taller de dietas:** ambas fuentes y motores de dieta reciben una proyección redactada de estrategias de alimentación oral aprobadas y vigentes. La interfaz muestra ese contexto. No modifica automáticamente prescripciones, suplementos ni menús. Una estrategia de alimentación activa que quedó pendiente de revisión bloquea la nueva propuesta hasta revisarla. El resumen forma parte de la huella del snapshot y de la comprobación existente antes de aplicar un menú.
- **Super Link:** conserva la revisión y publicación explícitas de las indicaciones; aprobar una estrategia no publica contenido.

## IA y referencias

`intervention_strategy@1` utiliza el mismo servicio, modelo configurado, consentimiento, cuotas, reservas e idempotencia que las funciones clínicas existentes. Usa el permiso `ai.consultation_support` y una configuración propia con salida máxima de 4.500 tokens, por lo que su reserva máxima puede diferir de otras funciones. La preferencia para otra propuesta es texto acotado, redactado y separado de los hechos clínicos. La huella de las funciones anteriores se conserva.

El contexto contiene únicamente la valoración permitida, PES y metas aprobadas redactados, acciones vigentes relevantes y dos referencias verificadas de proceso:

- [Academy: Nutrition Intervention](https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-intervention).
- [Academy: Nutrition Monitoring and Evaluation](https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-monitoring-and-evaluation).

Estas páginas fundamentan la estructura del proceso, no dosis ni indicaciones terapéuticas específicas. La primera entrega no incluye búsqueda automática de literatura clínica: la guía/protocolo terapéutico, versión, enlace y fundamento individual pueden documentarse por el profesional. La IA no inventa bibliografía ni transforma una medición en dosis, vía o tratamiento. Los componentes operativos no documentados quedan vacíos y se señalan para revisión. Las referencias del expediente y las bibliográficas se muestran separadas. El acuerdo siempre llega pendiente.

## Publicación y comprobaciones

La migración `20261018225431_clinical_intervention_strategies.sql` requiere las migraciones previas del PES y objetivos SMART. Desplegar primero el Edge con `intervention_strategy@1` y `patient_instructions@2`; aplicar las migraciones pendientes y publicar frontend de forma coordinada. Recargar las pestañas abiertas. No se modificaron datos reales, funciones remotas ni planes publicados durante la implementación.

Se realizan comprobaciones de tipos TypeScript/Deno, ESLint, compilación de frontend, compilación de la migración y asesores de Supabase sobre un esquema local desechable. Los servicios de facturación y dietas ajenos al esquema clínico se representan por sus firmas en la compilación local; esto no valida su comportamiento integrado. No se añaden ni ejecutan pruebas funcionales ni llamadas reales de IA en esta entrega.

Vista previa: `tests/visual/clinical-copilot.html?strategy=1`. Incluye un botón para cargar un ejemplo sintético; las propuestas y el guardado usan únicamente almacenamiento local.
