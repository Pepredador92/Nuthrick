# IA — Fase 4D: calibración real controlada

Fecha: 2026-09-22. **Calibración cerrada: seis llamadas reales, US$0.058401, proveedor real nuevamente apagado.** Una ejecución por modelo de Taller, sin regeneraciones ni aplicación clínica.

## Alcance y seguridad

- Base: `22ca877`, Fase 4C. Sin cambios de UX/UI. Cambios previos de landing y archivos locales ajenos preservados.
- Runtime: Supabase Edge Function `ai`; `OPENAI_API_KEY` consumida mediante `Deno.env`, exclusivamente servidor. Se verificó existencia sin revelar valor. No se escribió en código, documentación, frontend ni logs.
- Piloto: únicamente el profesional solicitante. Solo expediente expresamente ficticio nuevo; sin correo, teléfono ni paciente real. Sus IDs permanecen fuera de este reporte.
- Provider: POST a Responses API. Se revisó la minimización: no nombre, correo, teléfono, dirección ni UUID de paciente/profesional/consulta en el payload.
- Tarifas estándar verificadas: [modelos oficiales](https://developers.openai.com/api/docs/models/compare). USD/millón entrada/cache/salida: Luna 0.20/0.02/1.20; Terra 2/0.20/12; Sol 4/0.40/20. Sin tarifas en componentes.
- Guard transaccional bajo lock de cuenta: máximo US$1 estimado+consumido, 9 admisiones totales; límites por feature/modelo 3/3/2/1, solo expediente ficticio y ejecución real. Los intentos fallidos también cuentan conservadoramente.
- Un intento de provider por generación; sin reintentos automáticos pagados. Sin llamadas de reparación. Metadata operacional privada: request ID, modelo devuelto y latencia.
- Migración `20260922211806_ai_calibration_guard.sql` aplicada. Único deploy de backend hasta ahora: **ai v11, ACTIVE, JWT habilitado**. Sin deploy frontend, push ni commit de 4D.

## Consumo observado directamente en usage del proveedor

| Caso | Modelo | Input | Cached | Output | Total | Latencia ms | USD | Créditos |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| R24h explícito | gpt-5.6-luna | 385 | 0 | 642 | 1027 | 7530 | 0.0008474 | 0.085 |
| R24h ambiguo | gpt-5.6-luna | 358 | 0 | 460 | 818 | 4842 | 0.0006236 | 0.063 |
| PES sin laboratorio | gpt-5.6-terra | 463 | 0 | 437 | 900 | 8277 | 0.0061700 | 0.617 |
| PES con laboratorio | gpt-5.6-terra | 482 | 0 | 415 | 897 | 6460 | 0.0059440 | 0.595 |
| Taller A | gpt-5.6-terra | 4516 | 0 | 575 | 5091 | 9437 | 0.0159320 | 1.594 |
| Taller B | gpt-5.6-sol | 4516 | 0 | 541 | 5057 | 7689 | 0.0288840 | 2.889 |

Todos `succeeded`, schema validado. **6 requests reales**, ningún caso opcional ejecutado. La autorización final se endureció en DB a seis admisiones totales y una por modelo del Taller (sin ampliar los US$1 originales).

| Feature/modelo | Requests | Input | Cached | Output | Latencia media ms | USD total | USD/request | Créditos medios |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| R24h/Luna | 2 | 743 | 0 | 1102 | 6186 | 0.001471 | 0.0007355 | 0.074 |
| PES/Terra | 2 | 945 | 0 | 852 | 7368.5 | 0.012114 | 0.006057 | 0.606 |
| Taller/Terra | 1 | 4516 | 0 | 575 | 9437 | 0.015932 | 0.015932 | 1.594 |
| Taller/Sol | 1 | 4516 | 0 | 541 | 7689 | 0.028884 | 0.028884 | 2.889 |

PREVIOUS_DOCUMENTED_COST = **US$0.068974**.
4D_COST = **US$0.058401** (5.84% del máximo autorizado).
TOTAL_DOCUMENTED_COST = **US$0.127375**.
Créditos cobrados = **5.843**, distintos de USD. No se define precio comercial.

Asignación piloto mediante ledger existente `PLAN_ALLOCATION`: fijó 25 créditos incluidos por un día, no sumó 25 al saldo previo. Saldo previo 24.824; delta de asignación +0.176. Tras seis llamadas: 19.157. Se revirtió exclusivamente el incremento temporal con `ADMIN_ADJUSTMENT -0.176` y se restauraron las fechas originales del período. **Saldo final 18.981 = 24.824 - 5.843**; comprados 0, reservas 0. Usage y ledger conservados, sin reembolso artificial del gasto real.

## Observaciones humanas

### R24h

Narrativas reproducibles: las dos especificadas en la solicitud (huevos/tortillas/frijoles/manzana/pollo/arroz/naranja/tacos; segundo caso sin cantidades).

- Primer caso: 9 alimentos; cantidades explícitas preservadas. Pollo, arroz y frijoles de comida sin cantidades inventadas. Tacos con advertencia sobre composición/tamaño.
- Segundo: 5 alimentos, todas las cantidades vacías. Señala tipo de tortilla, proporciones del plato mixto y cantidad/relleno de tacos como desconocidos.
- Matching requiere revisión profesional: huevo/tortilla/pollo/arroz tienen ambigüedad; manzana pequeña seleccionada por catálogo no confirma tamaño reportado. Tacos sin coincidencia automática. No se confirmó ni guardó ninguno de los borradores.
- Nutrición final calculada por Nuthrick/catálogo, no por OpenAI. Los 180 kcal preliminares del primer caso corresponden solo a coincidencias parciales, **no al día completo**.
- Luna sigue como candidato inicial; no se gastó en Terra para R24h.

### PES

Contexto ficticio: omite desayuno cuatro días por semana por trabajo temprano, hambre intensa al llegar a comida; alimentos disponibles y posibilidad de preparar la noche anterior; objetivo desayunar al menos cinco días/semana durante dos semanas. Peso 70 kg, talla 170 cm. Caso B agrega glucosa sérica 5.6 mmol/L, ayuno desconocido, sin intervalo de referencia ni fecha de muestra.

- Ambos proponen patrón de ingesta inconsistente ligado a rutina laboral, con evidencia referida. No inventan datos clínicos ni diagnostican automáticamente.
- B reconoce laboratorio disponible, pero indica que faltan ayuno, fecha, método y rango; no inventa interpretación de glucosa.
- Información faltante: composición/cantidad/horarios de ingesta, duración del patrón y efectos nutricionales.
- Corrección humana identificada: deseo de mejorar regularidad y objetivo no deberían figurar como signos/síntomas. La causalidad también exige juicio profesional. Borradores no aprobados como diagnóstico definitivo.
- Terra candidato provisional como asistente PES, no diagnóstico autónomo.

## Proyección (muestra pequeña; no precio de venta)

| Feature/modelo | 10 usos USD | 100 usos USD | 1000 usos USD |
|---|---:|---:|---:|
| R24h/Luna | 0.007355 | 0.07355 | 0.7355 |
| PES/Terra | 0.06057 | 0.6057 | 6.057 |
| Taller/Terra | 0.15932 | 1.5932 | 15.932 |
| Taller/Sol | 0.28884 | 2.8884 | 28.884 |

## Controles y pruebas a esta altura

- Kill switch comprobado antes de llamadas: deshabilitar feature config bloquea admisión sin deploy.
- Saldo insuficiente probado en la admisión real con transacción revertida: bloqueo antes de provider, sin generación/cobro adicional.
- Solo piloto habilitado; otros profesionales sin asignación de prueba.
- Idempotencia: SQL y HTTP local prueban duplicados/concurrencia. Doble clic real en Generar para Terra: una generación, un request ID, un RESERVE, un USAGE y un RELEASE; botón deshabilitado mientras espera. No se afirman dos peticiones HTTP emitidas: la interfaz absorbió el doble clic.
- Prompt injection automatizado: narrativa no reemplaza instrucciones ni añade herramientas.
- Deno: **107 pruebas + 19 subcasos**, cero fallos; estas pruebas no hacen llamadas OpenAI.
- Frontend focal: **212 pruebas / 23 archivos**, cero fallos.
- SQL guard: **8 controles**; presupuesto/concurrencia: **24 escenarios**, todos pasan.
- HTTP local Auth/Postgres/PostgREST/handler: **22 casos**, pasan sin provider remoto.
- TypeScript pasa. ESLint focal frontend pasa. ESLint no cubre archivos Deno fuera de su base; Deno sí comprueba tipos en sus pruebas. `git diff --check` pasa.
- Build `VERCEL=1 npm run build` pasa, incluyendo tres smoke SSR. No se publicó su resultado.

## Taller: contexto, comparación y límites

Contexto normalizado: [ai-phase-4d-context.json](ai-phase-4d-context.json). Resultados sin UUID clínicos: [ai-phase-4d-results.json](ai-phase-4d-results.json). Ambos snapshots reales compartieron exactamente el hash `55e76f30c97f1bc1a87f7395c115faeb66c800de7f24b41c51d462f6ffdf2977`, misma revisión 1, mismo source stamp, catálogo, prompt y ausencia de indicaciones adicionales. Solo cambiaron modelo/tarifas. El preflight local representaba indicaciones ausentes como `missing`; el frontend envió campo vacío (`blank`) en ambas ejecuciones reales. El archivo documenta el payload real común, no el preflight.

Fixture: 1750 kcal, CHO 50%/218.75 g, proteína 20%/87.5 g, grasa 30%/58.333 g; PES y objetivo sintéticos aprobados como fixture, antropometría 70 kg/170 cm. R24h confirmado por el mecanismo clínico existente con tortillas, frijoles, manzana, pollo y arroz en cantidades explícitas. Preferencias por preparaciones sencillas; tortilla/frijoles favorecidos y atún en agua escurrido excluido por ID de catálogo. Sin alergia declarada.

**Límite del contrato actual:** R24h y antropometría permanecen en expediente pero no entran al builder vigente de `diet_draft`. No se amplió el prompt. `usual_pattern` tenía texto donde el builder espera otro formato y fue marcado `unavailable/invalid`; el PES conserva la rutina relevante. La exclusión se aplica server-side al catálogo, no exponiendo su UUID al modelo. Esta prueba de exclusión no demuestra manejo de alergias: atún tampoco correspondía al grupo AOA bajo elegido.

| Comprobación | Propuesta A: Terra | Propuesta B: Sol |
|---|---|---|
| Schema / validación | Pasa / `valid` | Pasa / `valid` |
| Grupos, alimentos o recetas inválidos | 0 | 0 |
| Exclusión infringida | 0 | 0 |
| Residuos de equivalentes por tiempo | 0 | 0 |
| Issues de validador | 0 | 0 |
| Reparaciones / retries / llamadas de repair | 0 / 0 / 0 | 0 / 0 / 0 |
| Recetas elegidas | 1: licuado plátano/leche | La misma |
| Entradas desayuno/comida/cena | 4 / 5 / 8 | 4 / 6 / 8 |
| Totales recalculados | 1730 kcal, CHO 233 g, P 91 g, G 47 g | Idénticos |
| Diferencias objetivo | -20 kcal, +14.25 g CHO, +3.5 g P, -11.333 g G | Idénticas |
| Revisión de objetivo requerida | Sí | Sí |

`valid` significa cierre de equivalentes, **no adecuación clínica automática**. La diferencia procede de la prescripción de equivalentes ya fijada, no de aritmética del modelo. Se mantuvo la confirmación humana existente. No hubo reparación matemática posterior: solo resolución de referencias/multiplicadores y recálculo determinista habitual.

Observación práctica: ambos ofrecen desayuno de tortillas/jamón/guacamole y licuado, comida y cena de tortillas/frijoles/arrachera/verduras/guacamole. Sol sustituye una de las dos piezas de jitomate de comida por media taza de ejotes. Desayuno y cena son iguales, salvo orden. No hay fracciones inusuales nuevas ni referencias duplicadas por tiempo. Sol añade una entrada en comida, sin ventaja demostrada de compactación. Ambos repiten tortillas y guacamole en tres tiempos, arrachera/frijoles en dos; cena con ocho entradas exige valorar variedad y facilidad de preparación.

**Correcciones humanas:** cero correcciones estructurales o de equivalentes obligatorias detectadas por modelo. Dos revisiones profesionales pendientes comunes: (1) decidir si ajustar las diferencias frente al objetivo, (2) valorar repetición/organización culinaria. No se realizaron esas ediciones ni se inventó un conteo de futuras ediciones o quality score. La revisión no fue verdaderamente ciega: se ejecutó en orden conocido; A/B son etiquetas documentales.

La selección acotada del servidor no ofreció pollo, arroz ni huevo en este caso; por tanto su ausencia no es una falla comparativa del modelo. La diversidad del catálogo candidato limita a ambos. No se cambió selección/prompt en medio de la prueba.

Sol costó **US$0.012952 más (+81.30%)**, con latencia **1748 ms menor** y 34 tokens de salida menos. Una muestra por modelo no permite generalizar velocidad ni superioridad. **Candidato inicial: Terra** para Taller, al obtener las mismas validaciones y nutrición a menor costo. Luna se mantiene para R24h y Terra para PES, siempre bajo revisión profesional.

## Cierre operativo

- `NUTHRICK_AI_ENABLED=false` y `NUTHRICK_DIET_REAL_PROVIDER_ENABLED=false` en runtime; no se borró la key.
- Todas las feature configs deshabilitadas, accesos piloto deshabilitados y piloto `enabled=false`. Resto de profesionales nunca habilitado. `diet_draft` vuelve a modelo candidato Terra/tarifas Terra, apagado.
- Ledger: seis RESERVE, seis USAGE y seis RELEASE; reservas acumuladas 41.928 créditos liberadas íntegramente, consumo 5.843; cero pendientes, sin dobles cargos. Metadata operacional/request IDs conservados en tabla privada, no interfaz clínica.
- Limpieza remota verificada: eliminados exclusivamente paciente ficticio de esta fase, su consulta draft, respuestas, mediciones, laboratorio, draft de Taller y dos snapshots privados de propuesta. Cero versiones publicadas, portales, Superlinks o citas asociados. Ningún paciente real modificado. Borrado permanente de estos registros de prueba; el resumen anonimizado y auditoría contable permanecen.
- Se eliminaron también los dos archivos temporales locales de fuente/snapshot creados en esta parte, conservando las demás carpetas locales. Uso histórico y seis generaciones de auditoría permanecen.
- Advisors: sin advertencias nuevas; 11 avisos históricos de SECURITY DEFINER y uno de contraseñas filtradas. Referencias: [funciones expuestas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). RLS sin políticas en tablas privadas es deny-by-default deliberado.
- Esta última parte cambió configuración, fixtures y documentación, no código de aplicación. Las pruebas indicadas arriba corresponden a los cambios técnicos de la primera parte de 4D y no se repitieron suites completas por cada request. Sin nuevo deploy, commit vacío ni push. Cambios técnicos de 4D continúan locales sin commit; Edge v11 ya fue desplegada una sola vez en la primera parte.
- Habilidades Supabase y OpenAI Docs utilizadas para controles server-side, auditoría y comprobación de tarifas. No se implementó otra fase.
