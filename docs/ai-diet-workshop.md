# IA-3 y objetivo acordado — entrega conjunta

## A. Objetivo acordado

1. **Almacenamiento:** `consultation_answers`, clave `treatment_objective`, área `professional_assessment`, asociada a consulta y revisión.
2. **Después de PES:** nueva sección final en la base oficial inicial `system_initial_v2`, versión 4. Una pregunta opcional de texto, máximo 2.000 caracteres; autoguardado y cierre existentes.
3. **Superlink:** `private.portal_goals` ofrece el objetivo válido más reciente de una consulta finalizada. Sigue requiriendo selección/publicación expresa.
4. **Histórico:** no se reescriben respuestas ni snapshots. Seguimiento mantiene `next_objectives`; compatibilidad con `objectives` en snapshots iniciales antiguos. Borradores y plantillas personales no se actualizan silenciosamente: pueden adoptar/copiar la base oficial.
5. **Diseño:** la pregunta y su estructura quedan protegidas por sus dependencias; su texto puede personalizarse.

## B. IA-3

6. **Arquitectura:** una acción en Taller → AI Service existente → contexto autorizado → motores deterministas → selección estructurada por el proveedor → preview firmado → decisión explícita. Sin llamadas OpenAI en componentes.
7. **Builder:** `ai_workshop_source` obtiene datos reales server-side y `buildDietWorkshopClinicalContext` crea el resumen mínimo.
8. **Campos:** energía/macros definidos, objetivo canónico, PES aprobado, R24h confirmado, antropometría, composición con método/versión, laboratorios, entrevista permitida, rutina y preferencias. Los opcionales ausentes no bloquean.
9. **Exclusiones:** no se envían identidad/contacto, UUID internos, expediente completo, catálogo completo ni metadatos de auditoría. Receta/alimento personalizados también se redactan.
10. **PES:** únicamente texto persistido cuya revisión tiene `approved_at`. Nunca una generación temporal o no aprobada.
11. **Objetivo:** fuente canónica compartida con Superlink; última consulta finalizada con valor válido, sin duplicar un campo libre.
12. **R24h:** solo registro confirmado, resumido como comida/alimento/cantidad/unidad. No se convierte automáticamente en prescripción.
13. **Preferencias:** `like` favorece, `avoid` penaliza, `exclude` elimina candidatos. Rechazos de esta sesión son temporales.
14. **Operaciones controladas:** lectura de contexto/borrador, retrieval acotado, construcción/validación de equivalentes, tiempos y menú, vinculación de generación y decisión atómica. No SQL ni herramientas arbitrarias del modelo.
15. **Prompt:** `diet_workshop@1`. Feature/configuración existente conserva proveedor, modelo, razonamiento, tarifas y límites; permanece desactivada.
16. **Schema:** el modelo devuelve `{option, summary, warnings, assumptions}` con índice válido, límites y sin propiedades extra. El servidor resuelve ese índice al plan completo comprobado. Adaptación deliberada: el modelo elige entre candidatos completos, no inventa IDs ni cantidades.
17. **Equivalentes:** hasta tres variantes del motor existente; group codes reales y totales calculados. Energía/macros de entrada nunca se escriben al aplicar.
18. **Tiempos:** distribución existente con historial de alternativas; mismos modelos de datos.
19. **Menú:** motor actual sobre alimentos accesibles y recetas propias/sistema válidas, rehidratadas desde alimentos reales. No crea recetas nuevas en la biblioteca.
20. **Validadores:** equivalentes, contribuciones, cantidades/unidades, grupos, distribución y menú. Tolerancias actuales del Taller. Reparación/variantes locales acotadas, no bucles de llamadas al proveedor.
21. **Errores:** targets incompletos, créditos insuficientes, propuesta inviable, contexto cambiado y errores del proveedor no aplican cambios. Un timeout incierto mantiene consulta de estado en lugar de volver a cobrar automáticamente.
22. **Alternativas:** firma de menú evita repetir propuestas y hasta 30 rechazos temporales. Si no hay alternativa válida se informa; no se convierte un rechazo en alergia.
23. **Aplicar:** HMAC con caducidad de 30 minutos, propietario, generación, revisión y huella del contexto. RPC bloquea filas y actualiza equivalentes/tiempos/menú en una sola operación. Después se edita en el Taller normal.
24. **Descartar:** solo registra la decisión; igualdad semántica del borrador comprobada. Cerrar la preview también descarta.
25. **Publicación:** no crea `nutrition_plan_versions`, no publica ni comparte por Superlink. Continúa Revisión → Publicar.
26. **Créditos:** misma reserva, claim, settlement y ledger de IA-1, cobrados al profesional autenticado. Uso/modelo/prompt siguen auditados. Configuración desactivada: no reserva ni llama al proveedor.
27. **Idempotencia:** bloqueo síncrono del doble clic, clave de solicitud, deduplicación server-side, comprobación de estado ante incertidumbre y decisiones repetibles.
28. **Privacidad:** allowlist, redacción recursiva acotada, sin contexto completo en logs/ledger; preview temporal en memoria del cliente, no nueva tabla de propuestas.
29. **Aislamiento:** propiedad del plan, paciente y consulta comprobada server-side. Fuente/aplicación/vinculación solo `service_role`; estado público usa usuario autenticado y envoltura invoker. No se amplía acceso a planes ajenos.
30. **Migraciones:** `20260922022642_initial_treatment_objective`, `20260922022644_clinical_treatment_objective_context`, `20260922022646_diet_workshop_ai`, aplicadas únicamente a `qlsqhvyrslclmlstlemn`. Edge: `ai` v3 (JWT), `agenda` v12 (autenticación propia existente).
31. **Pruebas nuevas:** contexto opcional/redacción, firma/alteración/caducidad, candidato estructurado, 2000 kcal, exclusiones/rechazos, doble clic, aplicar/descartar, objetivo tras PES, protección de Diseño, fuente canónica, ownership y atomicidad SQL.
32. **Totales:** suite frontend de 605 casos; cinco fallos iniciales por el modal en jsdom se corrigieron y los diez casos afectados pasaron en repetición focalizada. 42 pruebas Deno de IA y cuatro de publicación del portal. Cinco suites SQL (core, concurrencia, clínico, portal y Taller) aprobadas. Sin repetir todo el pipeline.
33. **TypeScript:** aprobado sobre árbol de release sin cambios ajenos del landing.
34. **ESLint:** cero errores; una advertencia previa del landing (`SecondShiftVisual` no utilizado), fuera del alcance.
35. **Build:** aprobado, incluida comprobación del artefacto Vercel. Bundle Edge generado desde el motor real, no copia manual de fórmulas.
36. **Commits:** una entrega conjunta objetivo + IA-3; cambios locales ajenos del landing excluidos. SHA exacto en la entrega final.
37. **Push:** destino `origin/main`, sin force; solo después de la validación conjunta.
38. **Vercel:** un despliegue del frontend por el push final. Su estado Ready se comprueba antes de la entrega final.
39. **Producción:** comprobación del flujo de objetivo/PES/consulta/portal/contexto con expediente ficticio en transacción revertida; verificación visual del Taller con IA desactivada. Evidencia y resultado definitivo se comunican en la entrega final, no se presuponen por este documento.
40. **OpenAI:** no se activa la feature ni se configura una nueva clave. Pruebas con mocks; cero llamadas reales realizadas por esta iteración. Registro de generaciones remoto en cero antes de publicar frontend.
41. **Limitaciones:** requiere borrador (no reemplaza planes activos); adopción de nueva plantilla es explícita en borradores/personales; candidatos acotados pueden no cubrir todos los casos; alergias/intolerancias o restricciones libres sin mapeo seguro, vegetarianismo/veganismo/pescetarianismo derivan al Taller manual; no se habilitó proveedor real ni se certifica eficacia clínica del modelo. No hay editor completo duplicado en preview: aplicar y editar normalmente. No compra de créditos, IA en chat/portal, autonomía o publicación automática.

## Operación

- Regenerar el motor Edge cuando cambie el motor compartido: `node scripts/build-workshop-ai-engine.mjs`.
- Prueba SQL reproducible: `node scripts/test-diet-workshop-ai.mjs` (base temporal local y rollback).
- Seguridad: los avisos existentes de Supabase sobre funciones anteriores y protección de contraseñas quedan fuera de esta iteración; no se habilita IA para solventarlos.
