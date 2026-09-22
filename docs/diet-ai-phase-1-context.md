# Taller con IA — Fase 1: contexto y contratos

Estado: propuesta local para revisión, no conectada a producción. Base: `de0d695` y `4d0b177`. No se modifica PES, Objetivo, presupuesto, landing ni el flujo manual. No se implementa generación ni se habilita la feature.

## 1. Cómo funciona actualmente Taller

La inspección se realizó antes de escribir el prototipo. Las rutas `/app/diet-workshop` y `/app/diet-workshop/:dietPlanId` se registran en `frontend/src/app/ClientApplication.tsx`. `DietWorkshopPage.tsx` admite `patientId` y `consultationId`, abre un borrador existente o permite crear uno con o sin consulta. El paciente se necesita para publicar, no para trabajar manualmente.

| Etapa | Implementación actual | Persistencia/cálculo |
| --- | --- | --- |
| Energía | `DietEnergyStep`, `features/diet-energy/model.ts`, `features/energy` | Fórmula predictiva, medición o captura manual; objetivo profesional explícito |
| Macros | `DietMacrosStep`, `features/macros` | Porcentaje, gramos o g/kg; factores 4/4/9 |
| Equivalentes | `DietEquivalentsStep`, `features/exchanges` | Grupos SMAE, sumas, diferencias, propuestas determinísticas |
| Tiempos | `DietMealDistributionStep`, `features/meal-distribution` | Tiempos configurables, horarios opcionales y equivalentes por celda |
| Menú | `DietMenuStep`, `MenuEditors`, `MenuWeekPlanner`, `features/menu` | Alimentos, recetas, ajustes, sustitución, banco de opciones por tiempo y calendario |
| Revisión | `DietPlanReviewStep`, `PatientPlanPreview`, `features/diet-review` | Validación, vista del paciente y publicación versionada |

Servicios: `dietPlans.ts`, `foodCatalog.ts`, `dietLibrary.ts`, `dietWorkshopAI.ts`. Hooks: `useChangeAutosave`, `usePreparationCatalog`, `useProposalExplorer`; además, efectos y cola de guardado en la pantalla. Tipos compartidos: `frontend/src/types/domain.ts`.

Tablas principales: `nutrition_plans`, `nutrition_plan_versions`, `food_items`, `recipes`, `recipe_items`, `diet_library_items`, `diet_library_contributions`. `nutrition_plans` guarda los snapshots JSON de energía, macros, equivalentes, tiempos y menú. `draft_revision` protege la edición concurrente; el guardado vacía cambios pendientes antes de publicar/aplicar. `publish_nutrition_plan_version` conserva una versión clínica inmutable con idempotencia. El historial no equivale a un historial de cada pulsación del borrador.

## 2. Partes implementadas

Existen selección manual de alimentos/recetas, cantidades, edición de ingredientes, intercambio, propuestas locales, autoguardado, reconciliación de pasos, confirmación profesional, calendario, revisión y publicaciones históricas. La biblioteca permite reutilizar/copiar contenido, conservar o tomar objetivos de referencia y recuperar el borrador previo a aplicar. `newMealOption` duplica una opción con IDs nuevos; no se encontró un servicio independiente para duplicar arbitrariamente cualquier plan completo: no confundirlo con reutilizar biblioteca.

La cobertura ejecutada incluye el Taller manual y sus componentes. Esto confirma los caminos probados, no certifica todos los escenarios clínicos ni el despliegue remoto.

## 3. Qué falta para esta nueva fase de IA

Ya hay `DietWorkshopAI`, `ai/workshop.ts`, `aiEngine.ts` y RPC `ai_workshop_source/bind/decision`. El asistente previo construye hasta tres opciones por código y pide al modelo elegir un índice. No es un generador libre de alimentos. Aplica una propuesta firmada como borrador y comprueba revisión/fingerprint.

Brechas encontradas, documentadas sin alterar ese flujo:

- El objetivo de `ai_workshop_source` procede del objetivo más reciente del paciente (`private.portal_goals`), no necesariamente del objetivo aprobado de la consulta fuente. Debe sustituirse por la aprobación de esa misma consulta en la futura integración.
- PES se incluye si está aprobado, pero el asistente anterior no exige simultáneamente PES y Objetivo aprobados para generar.
- `workshopTargets` lee gramos derivados y exige valores estrictamente positivos; el dominio de macros sí admite cero. El prototipo recalcula `input_value` y conserva cero válido. Habrá que alinear el adaptador antes de conectarlo, no cambiar la fórmula.
- El contexto anterior incluye conjuntos genéricos de antropometría, composición y laboratorios. El nuevo contrato no los exporta por defecto.
- Las restricciones clínicas textuales aún no tienen resolución fiable a catálogo. `isFoodRestricted` detecta atributos `contains`, pero `unknown` no certifica ausencia del alérgeno.
- Faltan loader server-side del nuevo contrato, esquema de salida ejecutable, validación runtime completa, adaptación al banco de opciones/calendario, resumen de contexto y pruebas de integración de todo ese circuito.

El nuevo código es un prototipo puro, sin importaciones desde pantallas, servicios de red ni handlers. `ready` significa que pasó sus verificaciones locales; NO concede autorización ni habilita una llamada.

## 4. Fuentes reales disponibles

| Fuente | Campos reales | Uso en esta fase |
| --- | --- | --- |
| `patients` | `birth_date`, `equation_sex`, `weight_kg`, `height_cm` | Disponibles para cálculos; no reenviar identidad ni duplicar parámetros ya resueltos |
| `consultation_measurements`, `patient_measurements` | Valores y unidades de peso/talla, consulta de origen | Referencia energética existente; no exportar toda antropometría |
| `consultation_answers` de la revisión elegida | `usual_pattern`, `daily_schedule`, `cooking_time`, `food_equipment`, `food_reactions_status`, `food_reactions_v2`, `eating_preferences`, `food_preferences` | Proyección explícita incluida |
| Otras respuestas | `main_reason`, antecedentes, síntomas, `access_barriers`, `exercise_status`; plantillas antiguas: `meal_schedule`, `recall_24h` | No enviar en bloque. Futuras ampliaciones justificadas y versionadas |
| R24h aprobado | `consultation_snapshots.clinical_records.recall`, `approved_at`, `items` | Disponible, potencialmente útil; resumen acotado pendiente, no exportado por este prototipo |
| PES/Objetivo | `clinical_records.pes/objective` + `pes_statement` de respuestas | Aprobaciones y texto de la misma revisión/consulta |
| `nutrition_plans` | `target_calories`, `energy_calculation`, `macro_distribution`, `meal_distribution`, `diet_menu.food_preferences` | Prescripción y estructura canónicas |
| Catálogo | `food_items`, `recipes`, `recipe_items`, catálogo de grupos | Subconjunto activo y accesible, proyectado sin metadata privada |

`daily_schedule` son ventanas disponibles: no es una prescripción automática de horarios. El número de filas del R24h tampoco define el número prescrito de comidas. Los campos son opcionales y varían según plantilla/revisión; no se inventan sustitutos.

## 5. Obligatorios para el futuro flujo clínico propuesto

Borrador propio, paciente y consulta fuente coherentes, revisión vigente, kcal válidas, tres macros calculables/coherentes, PES aprobado, Objetivo aprobado contra ese PES, al menos un tiempo configurado, catálogo utilizable y restricciones revisadas. Son condiciones del nuevo flujo de IA, no del Taller manual.

El prototipo acepta explícitamente «No» en reacciones y bloquea «Sí»/desconocido/ausente o exclusiones clínicas aún no resueltas. Es una propuesta conservadora para revisión de producto; no una modificación del comportamiento publicado.

## 6. Opcionales

Horarios, distribución de equivalentes por tiempo, gustos, patrón habitual, equipo y tiempo para cocinar e indicaciones adicionales. PES/Objetivo ya aportan el contexto clínico aprobado: no obligar a recapturarlos.

Edad, sexo para ecuaciones, peso, talla, actividad, R24h y hallazgos clínicos selectivos son potencialmente útiles, no requisitos adicionales después de una prescripción válida. El prototipo deliberadamente no los incluye. Si se agregan, deberán conservar unidades, fecha, procedencia y selección explícita de relevancia; nunca tomar un laboratorio aislado para prescribir automáticamente.

## 7. Desconocidos y ausencia

`Fact<T>` distingue:

- `known` con valor, incluso cero cuando es válido para el campo.
- `unknown`: no recuerda o prefiere no responder.
- `unavailable`: falta, `null`, blanco, arreglo vacío o valor inválido, conservando el motivo.
- `not_applicable`: declaración explícita, nunca inferida de ausencia.

«No» a reacciones es un dato declarado, no una garantía médica. `[]` en reacciones no lo reemplaza. Una fila de reacción junto a «No» bloquea por contradicción. Horario `null` queda no disponible; no se inventa una hora. Cero kcal es inválido; cero gramos de un macro puede ser matemáticamente válido. Tokens ajenos al vocabulario del campo no se convierten a negativos.

## 8. DietGenerationContext propuesto

`frontend/src/features/diet-workshop/generationContext.ts` define:

```text
DietGenerationContext v1
  clinical: PES y objetivo aprobados
  prescription: kcal y macros recalculados
  meals: IDs de tiempos, tipo, nombre, orden y horario opcional
  meal_distribution: equivalentes por celda + totales derivados
  restrictions: estado de reacciones, registros, IDs excluidos
  preferences: patrón, alimentos, likes/avoid de catálogo
  routine: patrón habitual, ventanas, cocina y equipo
  professional_instructions: texto adicional opcional
  catalog: alimentos/recetas disponibles, con cantidades y unidades
```

El resultado local incluye `context`, `blockers`, `ready` y `audit`. Solo `context` sería candidato a payload del modelo. `audit` mantiene plan/revisión/consulta/fingerprint fuera de ese payload. IDs de catálogo/tiempos sí son referencias necesarias, no IDs de paciente/profesional.

## 9. Procedencia

Cada grupo de hechos lleva `source`, `path` y `kind`: declarado por paciente, capturado por profesional, calculado por sistema, PES aprobado, objetivo aprobado o registro de catálogo. Se usa `response_area` de la respuesta, no se supone que toda captura la declaró el paciente.

Las preferencias por ID y exclusiones de catálogo proceden siempre de `nutrition_plans.diet_menu.food_preferences`; no se deducen de una alergia. Las celdas de distribución son capturadas/aceptadas por el profesional y sus totales son calculados. La trazabilidad de fórmula, versión, inputs y origen (`consultation/patient/plan_override/manual`) permanece en `energy_calculation`, no se duplica en el payload. Las referencias precisas a filas, revisión, aprobaciones y versión de catálogo deben formar parte de la auditoría interna/fingerprint del futuro loader.

## 10. Datos excluidos

Necesarios: prescripción, aprobaciones, restricciones, estructura y referencias del catálogo. Útiles si existen: gustos/rutina, instrucciones; en una fase posterior, resumen R24h relevante. Excluidos por defecto: nombre, correo, teléfono, fecha exacta de nacimiento, domicilio, CURP, ID del paciente/profesional, fotos, chats, notas privadas, agenda/pagos, expediente completo, diagnósticos o laboratorios sin selección de relevancia.

También se excluyen motivos íntimos de preferencias, identidad de quien confirmó una reacción, lugar específico de trabajo, metadata de uso del catálogo, URLs y documentos fuente. El constructor usa listas permitidas, no serialización de objetos completos.

Todo campo textual proyectado pasa por un sanitizador obligatorio inyectado. La integración deberá reutilizar `redactClinicalText` con identificadores del paciente (sin modificar PES). El test usa un doble explícito, no acredita anonimización perfecta. Texto libre seguirá siendo dato no confiable; la redacción no elimina por sí sola todos los riesgos de privacidad o prompt injection.

## 11. Fuente canónica de kcal

`nutrition_plans.target_calories`: objetivo prescrito. Al guardar Energía se copia de `energy_calculation.prescribed_target_kcal`. `results.total_kcal` es gasto estimado/medido derivado, no autorización para sustituir el objetivo.

El prototipo comprueba el validador existente (>0 y ≤10000 kcal) y bloquea discrepancias con `prescribed_target_kcal` cuando está presente. Un plan manual puede tener objetivo válido sin cálculo energético completo. No se inventa una fórmula ni se usa el consumo del R24h como requerimiento.

## 12. Fuente canónica de macros

`macro_distribution.macros[code].input_mode/input_value`, con el peso de referencia cuando usa g/kg. `grams`, `kcal`, `percentage`, `totals` y `complete` son derivados. `calculateMacroDistribution` los recalcula; el prototipo no confía en un `complete=true` ni en gramos persistidos alterados.

Debe coincidir `macro_distribution.target_energy_kcal` con `target_calories`. Se reutilizan los factores del catálogo (4/4/9) y su regla de completitud. El constructor no reconcilia silenciosamente una prescripción desactualizada ni cambia entradas del profesional.

## 13. Tiempos

`MealTime`: `id`, `meal_type` (BREAKFAST/SNACK/MAIN_MEAL/DINNER/CUSTOM), `display_name`, `time|null`, `display_order`. `MealDistributionEntry`: `meal_time_id`, `group_code`, `portions`. Energía por tiempo se calcula desde esas celdas, no existe aquí una nueva prescripción porcentual por horario.

El Taller manual crea inicialmente tres tiempos (Desayuno/Comida/Cena), no cinco. El constructor nuevo no llama a ese creador: usa únicamente lo guardado. Si faltan tiempos, propone «Configura los tiempos de comida». Si faltan celdas pero hay estructura, la distribución se mantiene no disponible: la futura propuesta podrá presentarla para revisión sin afirmar que estaba prescrita.

## 14. Restricciones

Respuestas reales: `food_reactions_status` (Sí/No/No sabe...), `food_reactions_v2` (`food`, `classification`, `management`), preferencias «No consume»/culturales. No transformar automáticamente texto libre a un alérgeno o a un ID.

El dominio ya tiene `RecipeCompatibilityRestriction`: IDs/grupos/atributos excluidos. Los alimentos tienen atributos `contains/free/unknown`. El prototipo conserva esta incertidumbre, filtra IDs excluidos y deja bloqueadas las restricciones clínicas no resueltas. Resolver trazas, ingredientes compuestos y atributos desconocidos requiere una política posterior; el filtro actual no basta para certificar seguridad alérgica.

## 15. Preferencias

Se preservan `eating_preferences`, filas de `food_preferences` y valores por ID `like/avoid/exclude`. `like` y `avoid` son preferencias suaves; `exclude` es restricción. No convertir «no le gusta» en alergia ni «vegetariano» en una lista de exclusiones incompleta. Ausencia de preferencias no bloquea por sí sola.

## 16. Papel del PES

Contexto nutricional revisado, nunca algo que IA deba rediagnosticar. Se usa `pes_statement` asociado al `approved_at` del PES de la consulta/revisión fuente. Problema/etiología/evidencia existen por separado, pero reenviarlos además del enunciado duplicaría texto en esta primera versión. No se envían borradores PES sin aprobación.

## 17. Papel del Objetivo

Usar `clinical_records.objective.content` aprobado en esa consulta. Verificar revisión y vínculo `pes_approved_at/pes_statement`, no tomar el último objetivo de otra consulta por conveniencia. El objetivo orienta la propuesta, no cambia kcal/macros ni publica automáticamente una meta nueva.

## 18. Indicaciones adicionales

Campo opcional propuesto, dentro del panel de contexto, vacío por defecto: «Ej. desayunos transportables o preparaciones sencillas». No pedir de nuevo kcal/macros/objetivo. El prototipo admite texto y bloquea >1200 caracteres (límite técnico provisional, no regla clínica); no lo trunca silenciosamente. No hay UI ni columna nueva en esta fase.

Si contradice la prescripción, no prevalece sobre ella. Restricciones expresadas aquí no pueden considerarse verificadas por un algoritmo solo porque están escritas: requieren revisión estructurada antes de generar. Ese detector/resolución queda pendiente de integración.

## 19. Reglas profesionales

No crear un segundo lenguaje de reglas. Reutilizar preferencias duras por ID y opciones existentes del solver (`groupPreferences`, `lockedGroups`, `limits`). Estas últimas existen como parámetros del motor y no todas tienen persistencia/UI general del plan: no afirmar que ya se recuperan automáticamente.

«Máximo dos equivalentes de lácteos» necesita distinguir familia vs subgrupo; no se implementa como texto mágico. «No suplementos» tampoco tiene una taxonomía universal certificada en el catálogo. Permanecen decisiones de modelado pendientes. El texto adicional sirve para logística; reglas verificables deben almacenarse estructuradas en una fase posterior.

## 20. Salida futura

Tipo `DietGenerationDraft`: `schema_version`, `meal_options[]` con tiempo existente, nombre, entradas `{type, source_id, quantity, unit}` y `warnings[]`. Alimento usa `FoodUnitCode`; receta usa `recipe_serving`. Sin kcal/macros/equivalentes calculados por el modelo, IDs de pacientes, estado publicado ni aprobación inventada.

El servidor rehidratará referencias a `DietMenuEntry` y `MealOption` existentes, asignando IDs, snapshots, `status=draft`, revisión y aportes. Recetas conservarán preparación del catálogo; alimentos sueltos se mostrarán unidos a la opción mediante la vista compacta existente. Generar recetas inéditas e instrucciones culinarias nuevas queda fuera del primer contrato: necesita otra validación y autorización.

La primera propuesta es un banco de opciones por tiempo; no inventa siete días ni sustituye el calendario. El profesional podrá asignarlas usando `MenuWeekPlanner`. Cantidad de opciones y sustituciones siguen sujetas a reglas del dominio (`MAX_MEAL_OPTIONS=7`) y decisión de producto.

Es un contrato TypeScript y fixture, NO JSON Schema ni validador runtime de salida ya conectado.

## 21. Responsabilidad de IA

Proponer combinaciones/selecciones entre referencias accesibles, priorizar practicidad y preferencias dentro del contexto, advertir cuando no pueda proponer. No es la autoridad que verifica unidades, restricciones, suficiencia clínica o sumas. No decide kcal/macros ni diagnostica ni confirma opciones.

El selector anterior de candidatos puede servir como primera implementación conservadora; pasar a generación libre por catálogo exige revisar ese cambio de alcance.

## 22. Responsabilidad determinística

Antes de llamar: propiedad y vigencia de fuentes, aprobaciones, prescripción recalculada, catálogo acotado, reglas resueltas, presupuesto e idempotencia. Después: esquema exacto, máximos de tamaño, finitud/positividad, IDs activos/accesibles, unidad exacta del alimento o conversión explícita soportada, ingredientes de receta, restricciones, sumas y diferencias.

Reusar `exchangeContributionForFood`, `recipeExchangeContributions`, `calculateExchangeTotals`, `calculateMenuUsage/Status`, `optionCanConfirm`, revisión/publicación. El Taller trabaja principalmente con promedios por equivalentes: no presentar esos aportes como análisis químico exacto. No recalcular fórmulas con el modelo.

Al aplicar: releer revisión/fingerprint, conservar targets, persistir únicamente borrador y rechazar contexto viejo. El constructor puro NO sustituye autenticación, RLS, validación del RPC ni control de tokens. Se consultó la guía Supabase de pruebas de funciones; no hubo cambios de BD o permisos que requieran migración/advisor.

## 23. Tolerancias encontradas

| Regla | Valor/alcance real |
| --- | --- |
| Macros vs kcal objetivo | `MACRO_ENERGY_TOLERANCE_KCAL = 1` |
| Suma porcentajes (si todos se ingresan como porcentaje) | `MACRO_PERCENTAGE_TOLERANCE = 0.000001` puntos |
| Distribución de inventario por tiempos | epsilon numérico `1e-7` |
| Comparación menú/equivalentes | `MENU_COMPARISON_TOLERANCE = 0.1` eq; no umbral clínico |
| Buscador de equivalentes | `PROPOSAL_POLICY.maximumError = 0.15`; comparables hasta mejor error +0.035, acotado a 0.15 |

El último es error relativo máximo por componente para filtrar candidatos, NO una nueva tolerancia de aceptación clínica. Las diferencias por opciones pueden confirmarse con advertencia y se reflejan en revisión. No se encontró una regla general de publicación «±X %» individual para kcal/proteína/CHO/grasa. No se agrega ninguna. La política de aceptación de borradores IA con diferencias requiere decisión explícita.

## 24. UX propuesta

Tras Energía y Macros válidos, acceso discreto «Crear propuesta con IA» en el Taller, sin convertirlo en la primera etapa. Abrir un panel compacto no consume créditos:

```text
Crear propuesta con IA
2000 kcal · P 100 g · CHO 250 g · G 66.7 g
Objetivo aprobado: Organizar la alimentación.
PES aprobado: [resumen breve; ver completo]
Restricciones: Sin reacciones declaradas / Pendientes de revisar
Tiempos: [los configurados]
Preferencias: [resumen o No registradas]
Indicaciones adicionales [opcional]
[Crear propuesta con IA]  [Continuar manualmente]
```

Precisión visual redondeada, cálculo interno sin redondeo intermedio. Mostrar solo faltantes que requieren acción, con enlace a su paso. No llenar el panel de mensajes de datos opcionales ausentes ni desplegables por cada alimento.

## 25. Habilitación y estados

Condiciones de §5 más feature habilitada, cuenta autorizada, saldo/presupuesto disponibles y ninguna solicitud pendiente sin resolver. Estado loading «Preparando propuesta…», bloqueo de doble envío. Error conserva el borrador, explica qué falta y ofrece seguir manualmente; nunca cambia el gasto/plan por un fallo.

Si faltan kcal/macros: «Completa Energía y Macros». Si faltan aprobaciones: «Revisa PES y Objetivo en la consulta fuente». Si hay restricciones: «Revisa las restricciones antes de crear una propuesta». Sin generación al montar componentes o al cambiar de pestaña. La UI nueva no se implementa aquí.

## 26. Borrador → revisión → aceptación

Preview separado → revisar diferencias/opciones → aceptar en el borrador → editar con Taller → confirmar opciones/calendario → revisión final → publicar versión con el RPC existente. Aceptar propuesta IA NO equivale a publicar ni compartir en Superlink. Descartar deja el borrador intacto. Editar antes de aceptar debe pasar por la misma validación determinística; no permitir que un patch del navegador evada la firma.

No se crean tablas paralelas ni una segunda máquina de estados: propuesta pendiente/decisión en infraestructura IA, opciones `draft/confirmed`, menú `editing/ready` y plan `draft/active` existentes.

## 27. Créditos e idempotencia

Reusar `feature=diet_workshop`, `runAIRequest`, idempotency key, `private.ai_generations`, `ai_workshop_bind`, reserva/reconciliación y configuración de modelo/precios/prompt. Modelo y tarifas se resuelven en servidor, no en instrucciones del profesional.

Una intención de generar tiene una key; retry incierto consulta/reutiliza esa misma intención. «Otra propuesta» explícita tras resolver la anterior es una intención nueva. Coste real, generation ID, prompt/context version y decisión quedan auditados. No duplicar tablas de créditos ni modificar `de0d695`.

El fingerprint futuro debe cubrir consulta/revisión/aprobaciones, plan/revisión, instrucciones normalizadas y versión/selección de catálogo. Presupuesto/token caps deben verificarse antes del proveedor; si sobra texto, informar/reducir deliberadamente, no suprimir una alergia. Reaplicar validación al aceptar. Nada de esto habilita llamadas en esta fase.

## 28. Fixtures y pruebas agregadas

`generationContext.test.ts`: fixture mínima sintética y ampliaciones A–L. Incluye completos/mínimos, restricciones presentes, preferencias desconocidas, kcal sin macros y viceversa, aprobaciones ausentes/obsoletas, instrucciones, 4/4/9, unidades, cero, privacidad y ausencia de red. Extras: propiedad de catálogo, exclusiones, valores no finitos, snapshots energéticos distintos, horario inválido, IDs/celdas de tiempos incoherentes, contexto cruzado y no mutación.

No se crean pacientes, consultas o planes de prueba en BD.

## 29. Resultado de pruebas

Resultado final: **263 pruebas aprobadas en 30 archivos**, incluidas **32 pruebas nuevas** del contrato; `npm run typecheck` y ESLint de los dos archivos nuevos terminaron sin errores. `git diff --check` sin errores. No se ejecutó toda la suite del proyecto ni una prueba visual/E2E de producción: no hay cambios de UI en esta fase. Comando de regresión:

```sh
cd frontend
npm test -- src/features/diet-workshop src/features/diet-energy src/features/macros src/features/meal-distribution src/features/exchanges src/features/menu src/features/diet-review src/components/diet src/screens/DietWorkshopPage.test.tsx --reporter=dot
npm run typecheck
```

Las pruebas de esta fase son locales y no solicitan inferencia. No se ejecuta calibración real ni se modifica el límite de gasto.

## 30. Archivos de esta fase

Nuevos: `frontend/src/features/diet-workshop/generationContext.ts`, `frontend/src/features/diet-workshop/generationContext.test.ts`, este documento. No hay cambios en módulos existentes ni archivos generados del motor Edge.

## 31. Git status

Cambios previos preservados: `frontend/src/screens/LandingPage.tsx`, `frontend/src/screens/LandingPage.test.tsx`, directorios no versionados `output/` y `tmp/`. A ellos se suman exclusivamente los tres archivos nuevos de §30. Sin staging, commit, push, merge o deploy. No se eliminaron borradores ni otros datos.

## 32. Llamadas OpenAI

Cero llamadas realizadas en esta fase. No se invoca proveedor, endpoint de generación, script de calibración ni se abre la UI para generar.

## 33. Costo

Costo adicional: US$0. El acumulado de referencia entregado por el usuario se conserva en **US$0.022356**. No se consultó facturación remota ni se afirma auditar consumos de otros procesos.

## 34. Decisiones de producto pendientes

1. Ratificar el flujo clínico con PES/Objetivo obligatorios, y mantener separada una eventual generación de plantillas sin paciente.
2. Ratificar bloqueo ante reacciones desconocidas y definir revisión/mapeo seguro de restricciones, incluidos atributos desconocidos del catálogo. No liberar con un simple checkbox genérico de seguridad.
3. Elegir selector de candidatos (arquitectura actual) vs generador de opciones por referencias; este documento no cambia el mecanismo existente.
4. Definir cuántas opciones por tiempo se solicitan y si habrá generación de semana en otra fase; no asumir cinco tiempos/siete días.
5. Definir política de diferencias nutricionales para propuestas IA, sin convertir límites del solver en tolerancia clínica.
6. Selección justificada de R24h/datos demográficos/hallazgos, con mínimo de datos; no transmitir toda la consulta.
7. Persistencia y revisión de reglas estructuradas (suplementos, límites por familia, logística), y resolver contradicciones de instrucciones libres.
8. Confirmar límite/vida útil de indicaciones adicionales y condiciones de nueva receta. Hoy son contrato/prototipo, no funcionalidad publicada.

La siguiente fase deberá cerrar estas decisiones, conectar loader/validadores sin duplicar infraestructura y hacer integración con mocks ANTES de autorizar inferencia real. Esta fase termina aquí.
