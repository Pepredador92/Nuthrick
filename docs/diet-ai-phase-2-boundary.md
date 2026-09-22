# Taller IA — Fase 2: frontera determinística

Entrega local, sin proveedor real, sin cambios de UI ni persistencia. Fase 2 permanece sin commit. PES, Objetivo, créditos y landing no se modificaron.

## 1. Checkpoint Fase 1

Commit local `c6a11ca` — `feat(diet-ai): define generation context contracts`.

Se revisaron los tres archivos de Fase 1, convenciones de commits, estado de Git y patrones de secretos sin encontrar coincidencias. Antes del commit pasaron 263 pruebas, TypeScript y ESLint. Solo se incluyeron el contrato, sus 32 pruebas y `docs/diet-ai-phase-1-context.md`. No se incluyeron landing, `output/` o `tmp/`. No hubo push.

## 2. Modelo real de restricciones

Se reutiliza `RecipeCompatibilityRestriction`: `excludedFoodIds`, `excludedGroupCodes`, `excludedAttributes`, `likedFoodIds`, `avoidedFoodIds`. En el plan persiste `diet_menu.food_preferences` con `like/avoid/exclude`. El catálogo representa alérgenos con `contains/free/unknown`. Las reacciones clínicas siguen siendo respuestas revisables; no existe un mapeo completo de texto libre a catálogo.

## 3. Política hard / soft / unknown

Hard: exclusiones del plan más reglas estructuradas suministradas por el futuro loader autorizado. Se combinan, no se reemplazan. Soft: likes/avoid afectan orden y no invalidan un candidato. Unknown: reacciones sin revisar o reglas pendientes bloquean elegibilidad; no se interpretan como ausencia.

Para un atributo excluido se exige `free`: tanto `contains` como `unknown` o ausencia eliminan alimento y recetas que lo contengan. Esta protección adicional pertenece exclusivamente a la frontera nueva; no cambia el filtro del Taller manual.

Las alergias/restricciones clínicas textuales permanecen bloqueadas, aunque exista un filtro estructurado separado. No se añadió un checkbox que permita ignorarlas ni un resolver clínico improvisado. El profesional deberá resolverlas en un flujo posterior auditado antes de autorizar generación real.

## 4. Selector

`selectDietCandidates(context, mealTimeId, catalog, owner, rules, limits)` produce candidatos del tiempo existente. Usa la distribución guardada, no inventa comidas ni equivalentes. El catálogo completo se inspecciona en dominio; únicamente el subconjunto filtrado/acotado entra al payload.

## 5. Hard filtering

Se descartan registros inactivos, ajenos, IDs duplicados, referencias faltantes, grupo/sistema/versión de equivalentes incompatibles, porción no positiva/no finita, unidad no reconocida y nutrientes directos negativos/no finitos cuando están presentes. `recipe_serving` no es unidad de alimento.

Recetas: deben tener ingredientes activos/accesibles, cantidades válidas, unidades exactamente compatibles y porciones/servings válidos. Se reconstruyen snapshots y equivalentes desde alimentos actuales, ignorando aportes incrustados antiguos. Se excluyen recetas incompatibles con el tipo de comida y las que incorporan grupos no previstos en ese tiempo. No hay conversión libre de gramos↔tazas.

La ausencia de nutrientes directos NO significa falta de toda información nutricional: un alimento con porción, unidad y grupo/versionado SMAE válidos tiene los promedios oficiales que el Taller ya usa. Si tampoco existe ese grupo, se elimina.

## 6. Ranking soft exacto

Dentro de cada composición de grupos: un alimento/receta evitado recibe prioridad -1; uno preferido +1; los demás 0. Si una receta contiene ambos, evitar tiene precedencia. Desempate estable por referencia. Se alternan grupos/composiciones para no llenar todo el pool con el primer grupo.

No se infiere precio, tiempo de cocción, hábito, facilidad ni adecuación clínica desde un nombre. No se usa texto de una preferencia para convertirlo en una exclusión automática.

## 7. Pool y evidencia

Consulta de solo lectura al Supabase **local**, únicamente agregados: 131 alimentos activos, 13 grupos con alimentos, 32 recetas activas. Todos esos alimentos tienen kcal directas nulas y usan equivalentes. Recetas por afinidad: 19 Comida/Cena; 9 Desayuno/Cena; 4 Desayuno/Colación. El mínimo de alimentos por grupo es 1 y el máximo 25.

No había planes locales con distribución persistida para calcular una mediana de uso real. El constructor manual actual inicia tres tiempos; ese valor se usó como escenario sintético típico, no como estadística de pacientes ni regla automática.

`DIET_GENERATION_LIMITS`: **12 alimentos + 6 recetas por tiempo**, configurable y centralizado. Permite alternativas por grupo sin enviar 131+32 registros por tiempo. El pool no se rellena con duplicados cuando no hay suficientes opciones. Si pierde cobertura de un grupo prescrito, bloquea con `candidate_coverage_missing`; nunca lo omite silenciosamente.

Límites técnicos adicionales: hasta 12 tiempos, 18 entradas por opción, multiplicadores 0.5–8 en pasos existentes de 0.5, respuesta ≤24000 caracteres y payload ≤20000 bytes. No son tolerancias/recomendaciones clínicas. El adaptador futuro deberá además respetar los límites efectivos de configuración del proveedor.

## 8. Diversidad

Alimentos: nombre normalizado + grupo evita duplicados funcionales. Recetas: `preparationKey`, basado en ingredientes y proporciones, evita contar un simple escalado como receta distinta. Round-robin por composición de grupos; orden estable. No se introdujo un algoritmo clínico nuevo.

## 9. Runtime schema

`dietGenerationOutputSchema` es JSON Schema estricto; `parseDietModelOutput` lo evalúa en runtime usando exclusivamente su vocabulario acotado, sin coerción ni campos extra. Pruebas Deno comparan aceptación/rechazo con AJV ya existente.

```json
{"schema_version":1,"meal_options":[{"meal_ref":"m1","entries":[{"candidate_ref":"c1","portion_ref":"base","multiplier":1}]}]}
```

Sin nombres libres, instrucciones ejecutables, unidades enviadas por el modelo, totales, IDs de paciente o publicación. `candidate_ref` resuelve también el tipo; no se acepta un tipo contradictorio enviado por el modelo.

## 10. Cantidades/unidades

Cada candidato fija unidad y cantidad base. Alimento: porción actual del catálogo (normalización racional existente). Receta: una `recipe_serving`. La respuesta elige referencia y multiplicador permitido, no escribe «200 gramos». El código calcula la cantidad final y rechaza valores no finitos, negativos, cero, fracciones no permitidas o absurdos. Las unidades alternativas no se adivinan.

## 11. Nutrientes

`exchangeContributionForFood`, `recipeExchangeContributions` y `calculateExchangeTotals` siguen siendo autoridad. Se multiplican porciones y se suman los promedios SMAE. Cada ingrediente de receta se rehidrata; una receta de prueba con un snapshot falso de 999 equivalentes produce el aporte real del catálogo, no 999.

Si el mock devuelve kcal/macros extras, falla el schema. Nunca se usan sus números para completar los totales. La salida incluye aportes calculados y diferencias contra la prescripción; no son análisis químico exacto ni decisión clínica automática.

## 12. Validador

`validateDietGenerationDraft(raw, prepared, current)` devuelve errores `{code,path}`, no solo un booleano. Comprueba schema, fingerprint actual, elegibilidad, reconstrucción del pool autorizado, pertenencia candidato↔tiempo, multiplicador, duplicaciones, cobertura de tiempos y totales finitos.

Se reconstituyen los candidatos desde la fuente actual: no se confía en nutrientes o flags almacenados en un manifest manipulado. Cambiar catálogo, reglas, datos clínicos, revisión o menú invalida el contexto. El fingerprint local es una comparación exacta server-private, **no una firma ni sustituto de autenticación**. La integración HTTP deberá usar el loader autorizado y la firma/decisión existente, nunca aceptar este manifest del navegador.

## 13. Tolerancias reales

Se reutilizan sin redefinir: macros vs energía 1 kcal; porcentajes 0.000001; distribución de inventario epsilon 1e-7; menú vs equivalentes 0.1 eq. No se usa el límite 0.15 del buscador anterior como tolerancia clínica de aceptación.

No existe un umbral general de publicación de kcal/proteína/CHO/grasa. Se devuelven todas las diferencias y `requiresTargetReview` cuando alguna no es cero. Eso exige reconocer diferencias, **no implica una nueva tolerancia cero ni prohibición clínica**; se puede aplicar editable tras revisión explícita. No se afirma que un ajuste numérico sea adecuado para el paciente.

## 14. Estados

- `invalid`: schema, referencia, contexto, restricción o estructura inválidos; no draft aplicable.
- `needs_adjustment`: referencias válidas pero diferencias con los equivalentes de tiempos según el comparador existente.
- `valid`: coincide estructuralmente y con la distribución de equivalentes. NO certifica adecuación clínica ni coincidencia exacta de kcal/macros.

En los dos últimos se entregan totales/diferencias y un posible requisito adicional de revisión energética/macronutricional. Las restricciones hard jamás se aceptan por tener buenos totales.

## 15. Una opción por tiempo

Debe aparecer exactamente una entrada de `meal_options` por cada tiempo del manifest. Duplicados, ausencias o tiempos adicionales son inválidos. El draft crea una opción principal, editable y sin confirmar, por tiempo. No crea variantes completas, semana ni alternativas automáticas.

## 16. Regeneración futura parcial

La selección y validación ya se organizan por tiempo/ref. En una fase posterior podrá prepararse un manifest de alcance individual, con un merge explícito que preserve otros tiempos. No se implementa ahora: v1 exige el alcance completo preparado y rechaza comidas ausentes.

## 17. Distribución existente

Elegibilidad requiere equivalentes confirmados contra los targets vigentes, tiempos confirmados y snapshot de inventario coherente; `calculateDistributionStatus` verifica que las celdas consuman exactamente el inventario dentro del epsilon existente. Cada tiempo configurado debe tener distribución positiva. No se usa un default ni se permite que la respuesta altere la distribución.

## 18. Payload futuro

`prepareDietGeneration` construye un payload puro: PES/Objetivo aprobados, prescripción, restricciones/preferencias/rutina proyectadas, indicaciones adicionales, reglas filtradas, tiempos, distribución y candidatos. Un único `portion_policy` evita repetir la lista de multiplicadores en cada candidato.

Se usa un alias `mN` por tiempo y `cN` por candidato. El manifest interno resuelve esos aliases a entidades existentes. Puede inspeccionarse en tests; no se envía a ningún proveedor.

## 19. Datos excluidos

No se transmite el catálogo completo, identidad, IDs del paciente/profesional/plan/consulta, fingerprint, notas privadas, título del expediente, historial médico genérico ni snapshots crudos. El catálogo interno puede tener metadata, pero el payload solo proyecta nombre, tipo, unidad, porción y aportes autorizados.

Se mantiene obligatorio el sanitizador de texto; el futuro loader debe inyectar el redactor existente con los identificadores reales. Los tests usan uno sintético. La frontera no pretende anonimización perfecta del texto libre ni resolver instrucciones maliciosas mediante regex.

## 20. Tamaño offline

Medición de fixtures, no facturación ni benchmark OpenAI:

| Escenario | Caracteres | Bytes UTF-8 | Tokens aproximados (chars/4) | Cota conservadora bytes + schema + 2048 |
| --- | ---: | ---: | ---: | ---: |
| Mínimo, un tiempo/3 candidatos | 3445 | 3447 | 862 | 6206 |
| Con rutina/indicaciones | 3487 | 3490 | 872 | 6249 |
| Tres tiempos/54 candidatos | 16404 | 16407 | 4101 | 19166 |

La cota imita el enfoque conservador del proveedor existente; no incluye instrucciones de sistema todavía inexistentes para esta versión. Estas deberán contarse al conectar el adapter. Un payload demasiado grande bloquea, no trunca restricciones. La primera prueba excedió el límite por repetición de multiplicadores; centralizar esa política redujo tamaño sin aumentar el límite.

## 21. Interfaz del generador

`DietGenerator.generate(DietGenerationRequest): Promise<unknown>`: salida deliberadamente no confiable. Request incluye `feature='diet_workshop'`, idempotency key, generation ID y payload. No importa SDK ni conoce secretos o tarifas.

## 22. Fake

`FakeDietGenerator` recibe un objeto o función de respuesta y devuelve una copia. `fakeFaults` permite respuesta correcta, food/recipe ID inexistentes, unidad inventada, candidato excluido, exceso, schema roto y tiempo falso. No usa fetch ni SDK. Fixtures son sintéticas; no se insertaron registros de prueba.

## 23. Conversión a draft

`applyDietGenerationDraft` vuelve a validar y retorna una copia `NutritionPlan` con `status=draft`, `DietMenu.status=editing`, opciones `draft`, confirmaciones nulas y sin calendario generado. Utiliza los adaptadores existentes de alimento/receta. Conserva kcal, macros y distribución originales y no modifica la versión publicada.

Es una transformación pura, no una escritura de BD. Guardarla requerirá el mecanismo existente de revisión y autorización del servidor. No se genera ni comparte un plan clínico final automáticamente.

## 24. Protección de trabajo manual

Si hay entradas, banco de opciones o calendario, retorna `replacement_confirmation_required` salvo decisión explícita `replaceExisting`. Diferencias de porciones o targets requieren `acceptDifferences`. Ambas decisiones corresponden al profesional; no pueden venir del modelo. El plan original nunca se muta. Una respuesta inválida no modifica ni siquiera la copia.

## 25. UX preparada

Sin cambios visuales conectados. El dominio provee payload resumible, elegibilidad estructurada, diferencias y decisiones para el panel situado **después de tiempos y antes de menú**. Resumen: kcal/macros, tiempos, PES/Objetivo, restricciones, gustos/reglas e indicaciones; no todo el expediente.

Flujo previsto: abrir resumen sin coste → acción explícita → loading sin doble solicitud → preview → revisar diferencias → aceptar/reemplazar conscientemente o descartar → edición manual → publicación independiente. No generación al entrar al Taller. El botón antiguo no se reconecta en esta fase.

## 26. Eligibility

`getDietGenerationEligibility` es la entrada única para UI y devuelve `eligible/reasons/context`, incluyendo cobertura del pool y tamaño. Reutiliza bloqueos Fase 1 y añade confirmación de equivalentes, distribución vigente, revisión/fingerprint presentes, catálogo utilizable y gates de disponibilidad.

Códigos existentes reutilizados: `feature_disabled`, `insufficient_credits`, `provider_outcome_unknown`; además faltantes estructurales y contexto/pool. No hay condicionales nuevos repartidos en componentes porque todavía no se integra UI.

## 27. Créditos/idempotencia

El adapter futuro traducirá esta interfaz al `AIProvider`/`AIStore` existentes. `runAIRequest` seguirá reservando y reconciliando; la frontera no administra saldo. Se reutilizarán `ai_workshop_bind`, firma/decisión, generation ID, estados y auditoría. Retry incierto conserva la misma key; nueva propuesta requiere nueva intención explícita. No se creó ledger, RPC, tabla ni configuración paralela.

## 28. Tests

39 casos nuevos Vitest cubren A–Y y ataques; las 32 pruebas Fase 1 siguen pasando (Z). Incluyen hard filters de ingredientes, unknown alérgenos, soft ranking, catálogo ajeno/inactivo/incorrecto, schema estricto, números no finitos/absurdos, menú previo, revisión, totales y tamaño sin red.

7 pruebas adicionales Deno verifican el módulo generado y concordancia de schema con AJV, sin permisos de red/env. No son una prueba HTTP/autenticación ni una llamada al proveedor.

## 29. Resultados y comandos

Regresión seleccionada: 302 pruebas correctas en 31 archivos. Deno: 7 correctas. No se ejecutó toda la suite del proyecto ni una prueba visual: no hay UI nueva.

```sh
cd frontend
npm test -- src/features/diet-workshop src/features/diet-energy src/features/macros src/features/meal-distribution src/features/exchanges src/features/menu src/features/diet-review src/components/diet src/screens/DietWorkshopPage.test.tsx --reporter=dot
npm run typecheck
cd ..
node scripts/build-diet-generation-domain.mjs --check
deno test --config supabase/functions/ai/deno.json supabase/functions/ai/diet_boundary_test.ts
```

## 30. TypeScript/ESLint

TypeScript y ESLint de los cinco archivos TypeScript nuevos pasaron. Bundle compartido reproducible, comprobado con `--check`; misma implementación de dominio para frontend y Edge, sin duplicar fórmulas. No se agregaron dependencias.

## 31. Archivos de Fase 2

- `frontend/src/features/diet-workshop/generationCandidates.ts`
- `frontend/src/features/diet-workshop/generationSchema.ts`
- `frontend/src/features/diet-workshop/generationBoundary.ts`
- `frontend/src/features/diet-workshop/generationFixtures.ts`
- `frontend/src/features/diet-workshop/generationBoundary.test.ts`
- `scripts/build-diet-generation-domain.mjs`
- `supabase/functions/ai/diet-generation-domain.js` (generado)
- `supabase/functions/ai/diet_boundary_test.ts`
- Este reporte.

## 32. Git status

Fase 1 quedó en `c6a11ca`. Los nueve archivos Fase 2 permanecen nuevos/sin commit. Los cambios anteriores de `LandingPage.tsx`, `LandingPage.test.tsx`, `output/` y `tmp/` se preservaron. Nada staged al cerrar. Sin push/merge/deploy. No se tocó PES, Objetivo ni presupuesto.

## 33. OpenAI

0 llamadas reales; no proveedor nuevo, ninguna credencial leída o incorporada. No se invocó la generación existente. El bundle nuevo no está importado por handlers ni pantallas.

## 34. Costo

Adicional US$0; acumulado de referencia conservado **US$0.022356**. No se auditó facturación externa ni actividad ajena a esta tarea.

## 35. Pendientes antes de conectar OpenAI

1. Loader server-side autenticado, lectura coherente/revisión de fuentes y firma del manifest; nunca confiar en fuente/manifest enviados por el cliente.
2. Flujo auditado para resolver reacciones clínicas, restricciones culturales e instrucciones duras. No existe todavía resolución automática segura.
3. Definir si se quiere una tolerancia clínica de kcal/macros; hoy se muestran diferencias y se exige reconocimiento, sin atribuirles seguridad clínica.
4. Aprobación de multiplicadores/caps técnicos para el primer piloto, y ampliar porciones explícitas si hacen falta sin inventar unidades.
5. Integración con el orquestador de créditos vigente, modelo/prompt versionados, límites de tokens incluyendo instrucciones y manejo de solicitud incierta.
6. UI de resumen/revisión/reemplazo y guardado protegido; pruebas HTTP de autorización, concurrencia, firma e idempotencia antes de un piloto real.
7. Evaluar cobertura real del pool por profesional. Las cifras aquí son del seed local, no de producción; seguridad de alérgenos puede reducir mucho la disponibilidad.

Esta entrega se detiene en la frontera offline. No se conecta OpenAI ni se publica.
