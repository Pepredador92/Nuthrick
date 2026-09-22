# IA-4 — Calibración controlada

## Primera tanda R24H · 21 de septiembre de 2026

Estado: R24H probado con cuatro entradas sintéticas. PES y comparación del Taller pendientes; no declarar completada IA-4.
Modelo `gpt-5.6-luna`, prompt `recall_24h@1`. Sin confirmación ni incorporación al expediente de pacientes reales.

| Caso | Entrada / salida / caché (tokens) | USD calculados por el servidor | Créditos internos | Latencia (s) |
| --- | --- | --- | --- | --- |
| A: huevos, tortillas y media taza de frijoles | 353 / 139 / 0 | 0.0002374 | 0.024 | 3.178 |
| B: pollo, arroz, frijoles y naranja | 347 / 165 / 0 | 0.0002674 | 0.027 | 2.819 |
| C: plato de arroz y unos tacos | 345 / 139 / 0 | 0.0002358 | 0.024 | 3.371 |
| D: cinco tiempos con cantidades incompletas | 394 / 768 / 0 | 0.0010004 | 0.101 | 6.348 |

Total: **USD 0.001741**, 0.176 créditos internos. Costos calculados con los tokens reportados y la configuración de precios; no equivalen a una consulta del saldo facturado de OpenAI. Cuatro rechazos anteriores por falta de saldo registraron cero tokens y cero costo.

Extrapolación ilustrativa de esta muestra: USD 0.043525 por 100 recordatorios. No es precio comercial ni garantía: longitud, modelo y salida cambian el consumo.

## Hallazgos y correcciones locales

- Cantidades ambiguas quedaron pendientes: no se inventó el tamaño de un plato ni el número de “unos tacos”.
- La interfaz infería una unidad del catálogo aunque la extracción no la proporcionara. Corregido: una naranja no se convierte automáticamente en una taza de naranja.
- Una coincidencia parcial única podía seleccionar un alimento más específico. Ahora queda como sugerencia; los elementos que necesitan confirmación no se seleccionan automáticamente.
- La búsqueda exige límites de palabra: “agua” ya no coincide dentro de “aguacate”.
- Una unidad incompatible se muestra como “por verificar”; no desaparece visualmente del selector.
- Se limpian ambigüedades y reemplazos de la extracción anterior al iniciar otra.
- Verificación: 15 pruebas de frontend aprobadas y TypeScript sin errores. Estas correcciones aún requieren despliegue y revisión visual.

## Pendiente antes de ampliar las llamadas

- Endurecer la reserva del presupuesto diario: debe comprobar `gasto + nueva reserva`, no solo el gasto ya acumulado. La cuenta piloto tiene un saldo interno limitado; no se repuso ese saldo con los USD 5 del proveedor.
- Calibrar los cuatro casos PES y comparar Terra/Sol en Taller con el mismo contexto sintético.
- Comprobar aislamiento, límites y costo final de esos flujos antes de habilitarlos para otros profesionales.

No se utilizaron los USD 5 como objetivo de gasto. No hay generación automática en segundo plano autorizada por esta prueba.

## Iteración local PES → Objetivo · 21 de septiembre de 2026

### Estado reconstruido

- PES UI: `PesCopilot` y hook `useClinical`, dentro de `ConsultationPage`.
- Servicio: `clinicalWorkspace` → RPC pública invoker → función privada con autenticación/propiedad y bloqueo de consulta/revisión.
- IA: `services/ai.ts` → Edge `ai/index.ts` → `ai_clinical_source` del servidor → `buildPesClinicalContext` → `pes_diagnosis@1` → Responses → AJV + comparación literal de evidence → propuesta, nunca guardado automático.
- Modelo configurado del piloto: Terra, razonamiento bajo, 8192 tokens de entrada / 1024 de salida máximos. No se cambió modelo ni prompt.
- Persistencia: `pes_problem`, `pes_etiology`, `pes_evidence`, `pes_statement` en las respuestas existentes; procedencia/aprobación en `consultation_snapshots.clinical_records.pes`.
- Objetivo inicial: respuestas `treatment_objective`, legado `objectives`, seguimiento `next_objectives`; sin aprobación independiente. `PortalGoal` permite compartir una copia seleccionada de consultas finalizadas. No se cambió el portal.
- Energía: `features/energy/engine.ts` y `features/diet-energy/model.ts`, con unidades/fórmulas/validaciones determinísticas. Objetivo textual, `prescribed_target_kcal` / `target_calories` y `macro_distribution` ya eran datos diferentes. No se modificaron esos motores ni el Taller.

### Cambios locales

- `ClinicalObjective` presenta el PES aprobado y contexto registrado sin reescribirlo. Se mantiene el campo existente y se agrega aprobación/revocación independiente.
- La aprobación requiere un PES aprobado, consulta en borrador, revisión vigente, objetivo no vacío y stamp actual. Un objetivo no aprueba ni modifica PES.
- RPC `clinical_objective` conserva referencia al PES y revisión, contenido y fecha de aprobación, sin escribir planes, kcal o macros.
- Ediciones de respuestas relevantes, mediciones, laboratorios, cálculos o recordatorio invalidan aprobaciones del borrador. Cambiar únicamente el objetivo conserva PES. Autosaves sin cambios reales conservan aprobaciones. Revisiones históricas no se reescriben.
- PES manual se puede revisar/aprobar sin generar IA.
- Se alinearon límites de problema/etiología con SQL. El validador rechaza una etiología/signos no sustentados cuando no hay evidence, incluso si problema/enunciado están vacíos.
- Contexto omite datos ausentes; conserva valores y unidades, incorpora nombre de catálogo y fecha de medición. No convierte una unidad ni calcula con IA.
- Hay tres fixtures sintéticos A/B/C y ejecutor opt-in de un caso por invocación, sin reintento automático ni acceso a Supabase. Emite tokens/costo/latencia/schema/evidence y exige revisión semántica humana.

### Verificación

- Inicio: 62 pruebas frontend relevantes y SQL aislado pasaban. Deno inicialmente necesitó indicar `--config supabase/functions/ai/deno.json`; con esa configuración pasaron 32 pruebas de base.
- Final: **84/84** pruebas frontend relevantes en 8 archivos; incluyen todas las 15 previas.
- **38/38** pruebas Deno (21 clínicas + 17 core) con transporte simulado; cero llamadas pagadas.
- SQL transaccional aislado: **33 aserciones/rechazos esperados**, final `ROLLBACK`, salida exitosa. Usa tablas mínimas representativas, no una clonación completa de producción.
- TypeScript frontend y `deno check` del ejecutor: aprobados. `git diff --check`: aprobado.
- Suite frontend completa: **613 aprobadas / 1 fallida / 614 total**, en 84 archivos. Fallo ajeno a esta iteración: `LandingPage.test.tsx` espera un H1 diferente al texto actual; ambos archivos tenían cambios previos y se preservaron.
- Navegador local: comprobado bloqueo sin PES, generación simulada, aprobación PES, objetivo editable, aprobación separada y mensaje de kcal/macros intactos.
- No se ejecutó build de producción ni se aplicó migración a una base remota. No hubo commit, push, merge o deploy.

### Consumo y cierre

- Llamadas nuevas a OpenAI: **0**. Tokens nuevos: **0**. Costo nuevo: **USD 0**.
- Acumulado según referencia solicitada: **USD 0.00174 + 0 = USD 0.00174** (primera tanda exacta registrada: 0.001741).
- No hay clave OpenAI disponible en el entorno local inspeccionado. La clave guardada en secretos de Supabase no es recuperable como texto. Se solicitó configuración local segura; no se habilitó PES en producción ni se desplegó para eludir esa limitación.
- **PES no cerrado**: faltan llamadas A/B/C reales con el código actualizado y revisión semántica del resultado. La coincidencia de evidence no demuestra por sí sola ausencia total de alucinaciones en el razonamiento.
- **Objetivo no cerrado de extremo a extremo**: aprobación, persistencia aislada y UI simulada funcionan; falta validar integración sobre el esquema completo y el PES calibrado.
- El objetivo aprobado y el PES estructurado quedan disponibles con procedencia/revisión; datos dietéticos, mediciones y cálculos registrados conservan sus fuentes. Las kcal y macros continúan siendo datos determinísticos independientes. No se implementó ningún nuevo consumidor del Taller.
- El límite diario de reserva señalado en la tanda anterior sigue pendiente; no se amplió el piloto ni se hicieron llamadas para probarlo.

### Archivos de esta iteración

Modificados:

- `frontend/src/components/consultations/ClinicalCopilot.tsx`
- `frontend/src/components/consultations/ClinicalCopilot.test.tsx`
- `frontend/src/features/consultations/clinicalCopilot.ts`
- `frontend/src/screens/ConsultationPage.tsx`
- `frontend/src/services/clinicalCopilot.ts`
- `frontend/tests/visual/clinical-copilot.tsx`
- `frontend/tests/visual/clinical-copilot-fixtures.ts`
- `supabase/functions/ai/clinical.ts`
- `supabase/functions/ai/clinical_test.ts`
- `scripts/test-clinical-copilot.mjs`
- `scripts/test-clinical-copilot.sql`
- `docs/ai-calibration.md`

Nuevos:

- `frontend/src/components/consultations/ClinicalObjective.tsx`
- `frontend/src/components/consultations/ClinicalObjective.test.tsx`
- `supabase/functions/ai/clinical_calibration_fixtures.ts`
- `supabase/migrations/20260922035457_clinical_pes_objective_review.sql`
- `scripts/calibrate-clinical.ts`

Se preservaron los cambios anteriores de R24H y los ajenos del landing. No se modificó Taller.

## Calibración PES real — 2026-09-21 local / 2026-09-22 UTC

Esta sección reemplaza únicamente el estado de cierre de la fase previa, no su historial.

### Entorno y alcance

OPENAI_API_KEY local detectada: sí. Se cargó con Deno --env-file desde supabase/functions/.env, ignorado por Git; staging vacío. No se imprimió ni copió el secreto. No se encontraron snapshots de variables de entorno en los tests inspeccionados. Los logs del proveedor contienen solo metadatos técnicos.

Se ejecutó el proveedor real y los adaptadores/validadores de la Edge Function desde un ejecutor local; no fue una prueba HTTP completa de la Edge Function ni de Supabase remoto. Los tres casos son sintéticos. Exactamente una llamada secuencial por caso, sin reintentos ni llamadas de Objetivo. Inputs exactos y respuestas intactas quedan en supabase/functions/ai/fixtures/pes-real-calibration-20260922.json.

### Resultados reales

Feature pes_diagnosis, prompt pes_diagnosis@1, reasoning low, máximo de salida 1024. Modelo solicitado y devuelto: gpt-5.6-terra, identificador público real, no alias interno. Cada respuesta completed, parser válido, schema válido y evidencias literales válidas.

| Caso | Entrada | Salida | Total | Latencia ms | USD estimados |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 396 | 390 | 786 | 8169 | 0.005472 |
| B | 290 | 195 | 485 | 8946 | 0.002920 |
| C | 380 | 455 | 835 | 10039 | 0.006220 |
| Total | 1066 | 1040 | 2106 | — | 0.014612 |

Tokens cacheados: 0. Precio verificado en https://developers.openai.com/api/docs/models/gpt-5.6-terra : USD 2/millón entrada y USD 12/millón salida. Costos calculados sobre uso real, no lectura de factura/saldo. Acumulado solicitado: 0.001740 + 0.014612 = USD 0.016352.

- A: «Patrón de ingesta irregular», relacionado con omitir desayuno por iniciar temprano el trabajo, sustentado en omisión cuatro días/semana y hambre intensa posterior. Problema y etiología respaldados. No prescribe ni inventa enfermedad. La motivación de regularizar comidas aparece también en signos: conviene distinguirla de evidencia clínica durante revisión profesional; el sustento principal sí es real y suficiente. La etiología es algo redundante, sin ser inventada.
- B: abstención informativa. Problema, etiología y enunciado vacíos; explica falta de historia alimentaria, síntomas y otros datos. No convierte «no registrado» en ausencia clínica. No es un PES aprobable y no se presenta como tal; no se fuerza diagnóstico para rellenar campos.
- C: abstención informativa por porciones no cuantificadas y contexto incompleto. Reconoce que se desconoce ayuno para glucosa; no inventa conversiones, fechas, pesos de alimentos ni interpreta enfermedad. No repite todos los valores numéricos, pero conserva los originales en el input y no los contradice.

### Problema descubierto y corrección acotada

B/C dejaban visualmente campos vacíos con la explicación en detalles secundarios. Se añadió un aviso corto de información insuficiente, conservando bloqueada la aprobación. No hubo cambios de arquitectura, prompt o selección de modelo ni nuevas llamadas para mejorar redacción.

Se incorporaron 7 pruebas Deno sobre las respuestas reales, 2 pruebas UI de abstención B/C y 8 comprobaciones SQL con el PES real A. El test SQL simula la revisión profesional y el registro de generación en una transacción aislada; no crea registros de paciente ni consumo en producción. La entrada del objetivo se simula con el propietario del fixture porque el stub mínimo de guardado no reproduce los grants del RPC completo. Las aprobaciones sí se ejecutan con rol authenticated.

### Verificación final

- Deno: 45/45 (38 previas + 7 reales).
- Frontend completo: 615 pasan, 1 fallo previo del landing, 616 total en 84 archivos. Las dos nuevas pruebas pasan.
- SQL: 41 comprobaciones (33 previas + 8 de integración real), salida exitosa y ROLLBACK.
- TypeScript: pasa. git diff --check: pasa.
- El fallo independiente del landing espera «Tu consulta termine cuando termina la consulta», mientras su H1 actual dice «Termina cada consulta con el trabajo hecho». No importa código clínico. No se cambió ninguno de esos archivos durante esta calibración.
- El PES no aprobado no llega como aprobado a Objetivo. Una vez revisado, el objetivo usa ese PES, requiere aprobación independiente, conserva revisión/procedencia y ambos estados se invalidan al cambiar mediciones. Las kcal 2100 y proteína 100 g del fixture permanecen intactas.

PES: cerrado para los tres casos y criterios de esta calibración local; no equivale a validación clínica exhaustiva. Objetivo: cerrado para la integración probada con PES real y aprobación simulada; sigue pendiente prueba HTTP/esquema completo antes de publicación. La abstención fundamentada en B/C es un resultado seguro, no un diagnóstico vacío presentado como válido.

Antes de publicar/ampliar piloto: validar migración y flujo completo en entorno de integración, atender por separado el límite diario de reserva ya documentado y el fallo del landing. No se inicia Taller. No hubo commit, push, merge, deploy ni cambios remotos. Los cambios locales previos, output/ y tmp/ se conservan; staging vacío.

### Actualización: cierre HTTP real

Completado posteriormente con una sola llamada real a través del runtime local de Supabase, autenticación y esquema completo. Entrada 404, salida 433, total 837; 8793 ms; USD 0.006004. Acumulado USD 0.022356. Persistencia/aprobaciones mediante RPC HTTP verificadas sin más llamadas. Véase [informe de cierre técnico](pes-http-technical-close.md) para correcciones, pruebas y diagnóstico separado del límite diario. Sin publicación ni cambios de Taller.
