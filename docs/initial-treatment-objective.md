# Objetivo acordado en la consulta inicial

## Implementación

- La migración `20260922022642_initial_treatment_objective.sql` añade a la base oficial `system_initial_v2` una sección al final, después de PES: **Objetivo del tratamiento nutricional**.
- Una pregunta opcional, `treatment_objective`, de texto libre (máximo 2.000 caracteres), dentro de `professional_assessment`. Reutiliza captura, autoguardado, revisión y cierre existentes.
- Se incrementa la versión de la plantilla. No se actualizan respuestas ni snapshots de consultas existentes. Los borradores pueden adoptar la nueva versión mediante el flujo existente; las plantillas personales no se sobrescriben y pueden restaurar/copiar la base recomendada.
- Diseño de consulta carga la sección desde el catálogo y protege pregunta, tipo y sección igual que los objetivos de seguimiento. Se permite personalizar su texto.
- `private.portal_goals` utiliza `treatment_objective` para inicial y `next_objectives` para seguimiento. Compatibilidad: snapshots iniciales antiguos sin el nuevo campo conservan su lectura de `objectives`. Un nuevo campo vacío no recupera ese campo antiguo dentro de la misma consulta.
- El candidato actual es el de fecha de consulta más reciente, finalizada, no eliminada y con objetivo válido en su última revisión. Conserva consulta, fecha, revisión, clave y texto.
- Superlink sigue requiriendo selección y publicación explícita. Cerrar una consulta no actualiza el contenido compartido.
- La validación de Agenda/Superlink admite la nueva clave y conserva el rechazo de otras respuestas clínicas.
- La segunda migración incorpora la clave al contexto clínico existente y su indicador de disponibilidad. No activa IA ni introduce llamadas nuevas.

## Verificación local

- `node scripts/test-patient-portal.mjs`: aprobado. Incluye orden después de PES, seguimiento intacto, persistencia con el RPC real de guardado, cierre, protección de consulta cerrada, prioridad temporal, nulos/vacíos, historial y publicación manual.
- `node scripts/test-clinical-copilot.mjs`: aprobado; contexto reconoce el nuevo objetivo y mantiene aislamiento.
- 21 pruebas frontend de Consulta, Diseño, Objetivo y Superlink: aprobadas. Incluyen captura/cierre con y sin objetivo y protección de las tres claves compatibles.
- TypeScript, ESLint y compilación: aprobados.
- Cuatro pruebas Deno de validación de publicación: aprobadas.

Las pruebas SQL usan datos ficticios y revierten toda la transacción. No se modificaron pacientes reales. Las dos migraciones se aplicaron junto con IA-3 y Agenda v12 al proyecto autorizado. El frontend forma parte de la misma entrega. Véase `ai-diet-workshop.md` para la validación conjunta y las limitaciones.
