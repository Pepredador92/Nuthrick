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
- En Respaldo, toda mutación valida que el paciente pertenezca a los cinco habilitados y que la retención esté vigente en el modo de facturación de la cuenta. Los demás pacientes propios conservan la lectura del historial. La interfaz explica el rechazo con el mensaje de paciente en lectura.
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

La migración `20261019031459_clinical_intervention_strategies.sql` requiere las migraciones previas del PES y objetivos SMART. Desplegar primero el Edge con `intervention_strategy@1` y `patient_instructions@2`; aplicar las migraciones pendientes y publicar frontend de forma coordinada. Recargar las pestañas abiertas. No se modificaron datos reales, funciones remotas ni planes publicados durante la implementación.

Se realizan comprobaciones de tipos TypeScript/Deno, ESLint, compilación de frontend, compilación de la migración y asesores de Supabase sobre un esquema local desechable. Los servicios de facturación y dietas ajenos al esquema clínico se representan por sus firmas en la compilación local; esto no valida su comportamiento integrado. No se añaden ni ejecutan pruebas funcionales ni llamadas reales de IA en esta entrega.

Vista previa: `tests/visual/clinical-copilot.html?strategy=1`. Incluye un botón para cargar un ejemplo sintético; las propuestas y el guardado usan únicamente almacenamiento local.

La migración `20261019035119_enforce_intervention_retention_patient.sql` incorpora la autorización por paciente. Se verifica con `node scripts/test-intervention-retention.mjs`: 67 comprobaciones con PostgreSQL local por socket `/tmp`, fixtures sintéticos y rollback. Cubre las ocho mutaciones, consultas abiertas/finalizadas, lectura, los cinco pacientes habilitados, vigencia, modo de facturación y titularidad. `--without-fix` reproduce el fallo anterior. El helper de autorización y el RPC proceden de las migraciones reales; los permisos comerciales ajenos a la selección de pacientes se representan por sus firmas y un control de cuenta en lectura.

### Corrección de evidencia de objetivos largos

Cada componente del objetivo SMART aprobado se ofrece como un hecho independiente con su etiqueta e índice. Se conserva completo el texto redactado de cada campo y el objetivo estructurado del contexto. Esto evita que citar un objetivo entero como JSON exceda los 4.000 caracteres permitidos por evidencia. Los máximos actuales de los campos SMART caben en ese contrato sin truncarlos.

Antes de marcar una generación como exitosa, el servidor hidrata cada estrategia y aplica `isStrategyDocument`, el mismo validador del editor. Comprueba también el límite de 90.000 bytes del documento normalizado por PostgreSQL, incluidos los espacios de separadores JSONB. El identificador real de generación se incluye en esa comprobación. La interfaz valida toda la colección y presenta un error explícito cuando contiene documentos incompatibles; una colección válida vacía conserva el mensaje de información insuficiente. El consumo confirmado del proveedor se contabiliza según las reglas existentes, también si devuelve una salida inválida.

La corrección requiere desplegar `ai` y publicar el frontend; utiliza la migración de estrategias vigente y mantiene `intervention_strategy@1`, permisos, modelo y cuotas existentes. Pruebas de regresión:

```sh
deno test --config supabase/functions/ai/deno.json supabase/functions/ai/intervention_test.ts
deno test --allow-env --allow-net=127.0.0.1 --config supabase/functions/ai/deno.json supabase/functions/ai/intervention_http_test.ts
deno run --allow-read=supabase/migrations --allow-run=psql --config supabase/functions/ai/deno.json scripts/test-intervention-evidence.ts
```

Desde `frontend`: `npm test -- src/components/consultations/ClinicalInterventions.test.tsx`. Cubren evidencia larga, tres objetivos, caracteres especiales, privacidad, citas inválidas, exceso de tamaño y edición/guardado del borrador. La prueba HTTP usa el handler real con dependencias sintéticas; la prueba SQL usa el validador real de la migración en PostgreSQL local por socket `/tmp` y revierte sus cambios. No ejecutan llamadas reales al proveedor ni usan expedientes reales.

### Regresión del flujo SMART y navegación

Las pruebas de `ClinicalObjective` usan ahora el plan estructurado vigente: guardado del borrador, aprobación con contexto actualizado, acuerdo de paciente/cuidador, revocación, cambios del PES, signos desactualizados, recuperación de la sesión y prioridad de hasta tres objetivos. Las pruebas de `ConsultationPage` verifican el paso desde objetivos aprobados a estrategias y el bloqueo de cierre cuando existen cambios SMART sin guardar. Los fixtures son sintéticos y las llamadas externas se sustituyen en estas pruebas de interfaz.

La selección ampliada pasa 186 pruebas en 27 archivos. Incluye anuncios, recordatorios de entrada, revisión clínica, objetivos, estrategias, consulta, contexto y resumen clínico del taller. También comprueba que el contexto PES conserve los pliegues históricos con su fecha, conforme a la ampliación de medidas de valoración. Desde `frontend`:

```sh
npm test -- src/components/consultations src/screens/ConsultationPage.test.tsx src/features/announcements src/components/notifications/EntryDigest.test.tsx src/layouts/PrivateLayout.test.tsx src/features/consultations src/features/diet-workshop/clinicalSummary.test.ts
```

### Auditoría integrada del 19 de octubre de 2026

Se corrigió el indicador de aprobación SMART: PostgreSQL JSONB reordena las propiedades de objetos y una comparación con `JSON.stringify` marcaba como pendientes objetivos ya aprobados. Ahora se comparan versión, vínculo PES, orden de metas, campos y acuerdo por su valor. Una regresión reproduce el fallo con las claves devueltas en otro orden y comprueba que editar una meta vuelve a dejar el borrador pendiente. La selección anterior pasa ahora 187 pruebas.

La IA conserva vacíos los parámetros operativos sin una indicación textual en sus hechos citados y añade las correspondientes tareas de definición profesional. Esto se aplica a dosis, composición, acceso, frecuencia, duración e inicio; no se calculan ni sustituyen por valores inferidos. La propuesta conserva acuerdo pendiente. Las cifras no sustentadas en las acciones, citas inexistentes, vías no sustentadas y documentos incompatibles siguen rechazándose. El límite de tamaño se comprueba antes de esta normalización. Los rechazos registran únicamente códigos técnicos y el identificador de generación, sin texto clínico. No hay reintentos automáticos por salida inválida; el consumo confirmado se contabiliza según las reglas existentes.

La batería del servicio pasa 72 pruebas con 26 pasos HTTP. Se añadió un entorno integrado reproducible con Auth, PostgREST y Storage reales y el handler de producción, sin sustituir RPC ni contratos de la aplicación:

```sh
node scripts/setup-three-features-local.mjs
node scripts/test-three-features-local.mjs
# Opcional: dos llamadas reales, exclusivamente con el caso sintético local.
node scripts/test-three-features-local.mjs --real-ai
```

Requiere Node >=22.13, Deno, Docker, npm y ffmpeg. El último comando lee únicamente `OPENAI_API_KEY` de `supabase/functions/.env`, limita el coste máximo configurado a USD 0.05 y conserva marcadores antes del envío para evitar repetir intentos cuyo resultado no esté confirmado. Los informes se guardan con permisos 0600; no contienen claves ni contraseñas. Los reintentos con respuestas ya guardadas reutilizan esa salida.

El proyecto fijo `NuthrickFeatureAudit` usa puertos 553xx y el directorio `tmp/feature-audit-local`. El preparador no sobrescribe una instalación detenida ni altera otros proyectos locales. Aplica primero las migraciones anteriores al piloto de IA, crea una identidad y facturación ficticias exclusivamente locales para satisfacer esa precondición histórica, y termina las migraciones. Desactiva cron solo en este proyecto. No enlaza Supabase remoto ni llama a Stripe. El runner rechaza cualquier URL distinta de `http://127.0.0.1:55321`.

La instalación limpia detectó un permiso explícito que faltaba para `consultation_device_sessions`: el contexto clínico usa `SECURITY INVOKER` y necesita lectura de esa tabla desde el servidor. La migración `20261019043838_grant_clinical_device_context_read.sql` concede ese SELECT a `service_role`. Producción ya tenía dicho permiso; la migración asegura que las instalaciones con concesiones automáticas desactivadas también sean reproducibles. No modifica concesiones a clientes ni revoca permisos previos del servidor.

El montaje limpio completo y ocho verificaciones integradas sin proveedor pasaron. La ejecución opcional pasó diez verificaciones, incluidas propuesta SMART, cambios profesionales, borrador y aprobación; estrategia con evidencia completa, aprobación, inicio e historial; liquidación de ambas generaciones sin créditos reservados. Coste del último par de llamadas: USD 0.0025934. La publicación, pausado, las tres frecuencias, dos sesiones de Auth y descarga privada de PNG/MP4 también se comprobaron en el entorno aislado.

Para retirar exclusivamente este entorno desechable después de conservar los informes necesarios:

```sh
npx --yes supabase@2.121.0 stop --project-id NuthrickFeatureAudit --no-backup --workdir tmp/feature-audit-local
```

Antes de crear otra instalación desde cero, conserva o mueve el directorio anterior fuera de `tmp/feature-audit-local`. El preparador se detiene si encuentra su configuración sin un stack activo para evitar sobrescribir informes o estado guardado.

Las comprobaciones visuales y su alcance en producción se documentan en [Verificación de los tres módulos](three-feature-verification.md).
