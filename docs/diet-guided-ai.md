# Asistente de dietas desde Equivalentes

Actualizado el 4 de octubre de 2026. Entrada: paso 3, **Generar con IA**.

## Flujo vigente: dietas completas en texto

1. Revisar consulta seleccionada, antecedentes fechados, objetivo y prescripción de energía/macros para alimentos (descontados los suplementos). Confirmar contexto y escribir las restricciones revisadas con el paciente.
2. Elegir **1–7 dietas completas distintas** y 1–6 tiempos por dieta, con nombres y horarios opcionales. Tres dietas significa tres jornadas completas, cada una con todos los tiempos solicitados.
3. Indicar preferencias, presupuesto, disponibilidad y tiempo para cocinar. Se priorizan alimentos básicos mexicanos accesibles en abarrotes y mercados, platillos coherentes y cantidades prácticas.
4. Confirmar la solicitud. Si hay un borrador anterior, confirmar que se usará la nueva propuesta de texto. La IA no consulta el catálogo de alimentos/recetas ni rellena el menú estructurado.
5. Guardar el resultado como borrador y abrir **Revisión**, con un modal por páginas: una dieta a la vez. Editar/eliminar libremente ingredientes, cantidades y preparación; Anterior/Siguiente conserva los cambios. Guardar o cerrar también persiste el borrador.
6. Marcar cada dieta como revisada y aprobar el conjunto. Publicar requiere una confirmación adicional. Portal, vista profesional, PDF y TEX utilizan el texto aprobado de la versión publicada.

El editor no calcula nutrientes a partir del texto. Las metas son orientación, no totales comprobados de la propuesta; el profesional revisa adecuación, porciones y restricciones antes de publicar. No se generan equivalentes ficticios ni sustituciones desde la biblioteca. Los suplementos prescritos conservan su sección separada.

## Contexto y prompt

- Consulta actual y, del mismo paciente/profesional, consulta inicial y hasta tres consultas previas completadas. Última revisión por consulta; se excluyen retiradas, canceladas, borradores históricos y consultas futuras.
- Mediciones y cálculos vigentes de la consulta actual; antecedentes pertinentes con fecha. No se atribuyen mediciones antiguas al presente. Identificadores personales eliminados antes de la llamada al proveedor.
- Objetivo revisado, restricciones registradas y resumen profesional; ante conflicto, el prompt conserva la restricción más protectora. Nunca inventa diagnósticos ni duplica suplementos.
- Prompt `diet_draft@4`, JSON estricto y validación adicional de cantidad exacta de dietas/tiempos. Rechaza jornadas repetidas aunque cambien títulos, orden o cantidades comunes. Esto detecta duplicación; la variedad y coherencia culinaria todavía requieren revisión profesional.
- Una proteína animal principal por comida como regla, acompañamientos compatibles, alimentos económicos/de temporada, unidades enteras/medias/cuartos prácticas. No fuerza pescado, res y huevo para completar grupos.
- Modelo, precio por función, ledger, consentimiento, idempotencia y límites de gasto existentes. Máximo de salida de 16,000 tokens y 90 segundos para admitir siete dietas; no se reintenta automáticamente una llamada con resultado incierto.
- Basado en [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). El esquema verifica estructura; no certifica adecuación clínica.

## Persistencia y compatibilidad

- `nutrition_plans.text_diet`: contrato compartido versionado, dietas, horarios, estado de revisión y prescripción de referencia. El texto generado siempre nace sin aprobar.
- `ai_text_diet_source`: consulta/historial autorizado, sin consultar tablas de alimentos ni recetas.
- `ai_text_diet_draft`: bind/result/get/apply/discard, solo servidor. Reutiliza snapshots privados, ownership, entitlement, revisión y sello de contexto; apply es idempotente y solo cambia `text_diet`.
- `text_diet_result` recupera resultados existentes; el navegador conserva únicamente la clave opaca de solicitud. Recuperar/guardar/publicar no hace otra llamada a IA ni cobra más créditos.
- Publicación usa la RPC existente: revisión esperada, idempotencia e historial inmutable. Cambiar texto sin nueva aprobación o cambiar prescripción/paciente/consulta invalida la aprobación. La versión publicada no cambia al editar el borrador.
- La proyección del portal omite contexto clínico privado y prescripción interna. Texto React escapado; TEX escapa comandos. PDF y TEX comparten los mismos bloques de contenido.
- Planes manuales existentes mantienen Menú, calendario, catálogo y sustituciones. Sesiones antiguas conservan el adaptador guiado anterior; `diet_draft@4` selecciona el nuevo contrato solo cuando se recibe `textGuidance`.
- En un borrador de texto, la biblioteca no se ofrece como aplicación sobre el plan: no puede reemplazar silenciosamente un menú que no es el contenido vigente.

## Pruebas

- Dominio/Edge: 1/3/7 dietas, exactitud de tiempos, duplicados, contexto privado, restricciones revisadas, schema estricto, sesiones anteriores, uso confirmado e idempotencia.
- HTTP autenticado: preflight sin llamadas al proveedor, ownership, recuperación/aplicación, errores controlados y reintento de guardado sin generación nueva.
- React: cantidad solicitada, recuperación tras recarga/error de guardado, eliminación de ingredientes, navegación y aprobación del conjunto.
- PostgreSQL local desechable (`scripts/test-text-diet-db.mjs`): sin permisos de catálogo, ownership, revisiones obsoletas, suplementos, publicación no aprobada rechazada, texto exacto inmutable, invalidación al cambiar prescripción, replay y cero cargos adicionales. Transacción revertida.
- Portal/PDF/TEX: texto aprobado preservado, sin contexto privado y con escape de TEX.
- Navegador (`text-diet-check.mjs`): 1440/390 px, siete dietas, edición, navegación, aprobación y publicación en fixture local.
- Las pruebas utilizan datos ficticios y respuestas sintéticas; no evalúan la calidad de una generación real de OpenAI ni alteran dietas de pacientes reales.

## Despliegue

Primero desplegar Edge `ai` y `agenda` compatibles. Después aplicar la migración `narrative_diet_drafts` y publicar el frontend. Mantener JWT de `ai`; `agenda` conserva su autenticación propia existente para rutas públicas/portal. La migración no modifica planes existentes.

Despliegue de servidor verificado: `ai` v28, `agenda` v28, migración `20261004084428_narrative_diet_drafts`, prompt @4. RPC de contexto/aplicación accesibles únicamente a service_role; permiso de validación verificado también bajo ese rol.

### Corrección del contexto de revisión (4 de octubre de 2026)

El resumen del asistente usa la respuesta de la consulta actual y, cuando falta, el antecedente autorizado más reciente, mostrando su fecha. Una respuesta actual explícita de desconocimiento o rechazo no se reemplaza por un «No» antiguo. Los objetivos admiten tanto texto como listas de filas `objetivo`, con prioridad para la consulta actual. Restricciones y objetivos tienen prioridad dentro del historial acotado enviado al proveedor.

El modal precarga el objetivo y el resumen de restricciones disponibles para revisión, sin marcar confirmaciones automáticamente. Las preferencias opcionales sin registrar no bloquean el avance. Si faltan textos obligatorios o confirmaciones, el mensaje enumera los pendientes y enfoca el primer campo vacío. Ninguna ausencia se interpreta como ausencia de alergias. Pruebas de regresión con una consulta de seguimiento sin respuestas alimentarias, un objetivo estructurado y antecedentes de entrevista; datos sintéticos, sin consumo de créditos IA.
