# Taller IA — Fase 3: integración y calibración controlada

Estado al 22/09/2026: **integración local operativa; cierre de calibración parcial**.
Se respetó el máximo absoluto de **4 solicitudes reales**. Las tres iniciales
fueron rechazadas por schema; una corrección local seguida de regresión permitió
que la cuarta completara el recorrido HTTP → OpenAI → validación → DRAFT.
No se han vuelto a ejecutar A ni C con el contrato corregido. No afirmar que
los tres casos reales quedaron aprobados. No hacer más llamadas bajo esta autorización.

## 1. Commit local de Fase 2

`3473dde feat(diet-ai): add deterministic generation boundary`.
Incluye exclusivamente los nueve archivos de Fase 2. Previo al commit:
302 pruebas Taller, 7 Deno, TypeScript, ESLint y escaneo de secretos aprobados.
Landing, `output/` y `tmp/` quedaron fuera. Fase 3 **sin commit**.

## 2. Feature integrada

`diet_draft`, prompt `diet_draft@1`, en la misma Edge Function `/ai`.
Contrato separado de `diet_workshop@1` y del Copilot clínico, con el mismo
`ai_server`, cuentas, reservas, conciliación y ledger. Hereda la configuración
servidor del Taller. Se crea deshabilitada y quedó deshabilitada al acabar.
No se sustituyó ni activó el botón del asistente anterior: UX definitiva pendiente.

## 3. Flujo HTTP real

El runner local carga **el `index.ts` de producción**, lo sirve mediante Deno
en loopback y utiliza Supabase Auth, PostgREST y Postgres locales reales.
No llama directamente solo al adapter. Recorre:

plan local del Taller → sesión autenticada → configuración autorizada → consulta
fuente/propietario → PES y Objetivo vigentes → prescripción confirmada → selector
→ reserva atómica → snapshot persistido → claim → Responses API → schema/dominio
→ recálculo → evidencia del resultado → conciliación → confirmación explícita
→ guardado atómico de `diet_menu` con `status=draft`.

Solicitud:

```json
{"feature":"diet_draft","idempotencyKey":"UUID","planId":"UUID","patientId":"UUID","consultationId":"UUID","revision":1}
```

Aplicación: `action=apply_diet_draft`, `generationId`, `replaceExisting` y
`acceptDifferences`. No admite patches, modelo, catálogo, reglas o nutrientes del cliente.

## 4. Estrategia de snapshot

`private.ai_diet_snapshots`, una fila por generación, creada antes del proveedor.
La vinculación revisa nuevamente propietario, revisión y sello del contexto.
El snapshot es inmutable por trigger; SHA-256 canónico detecta alteraciones;
la copia en memoria se congela recursivamente. El hash no sustituye autorización:
RPCs exclusivamente `service_role`, tabla privada con RLS y sin grants al cliente.
La respuesta se valida contra ese snapshot, **sin reconstruir candidatos B**.

## 5. Datos conservados

Pool seleccionado y sus alias `mN/cN`, referencias privadas de catálogo,
porciones/unidades/multiplicadores, snapshots de alimentos/recetas seleccionados,
contexto mínimo redactado enviado al modelo, distribución y prescripción,
preferencias/exclusiones guardadas, existencia de menú manual, versión/hash/sello.
No se persiste el expediente ni el catálogo completo ni el fingerprint de texto
crudo de Fase 2: este último se convierte a hash. El resultado se escribe una sola
vez y conserva validación determinística, modelo devuelto, latencia y uso.
El uso/costo autoritativo permanece en el ledger existente.

## 6. Contexto obsoleto

Al aplicar se vuelve a comprobar el sello de la fuente y la revisión del plan
bajo bloqueo. Cambios en consulta, aprobaciones, prescripción, catálogo o menú
impiden aplicar la propuesta anterior. La prueba HTTP modifica el plan entre
generar y aplicar y recibe `context_changed`, sin reemplazo.

## 7. Payload exacto

La muestra exitosa completa está en
`supabase/functions/ai/fixtures/diet-real-calibration.json`,
`snapshot.prepared.payload`. Los cuatro payloads y respuestas técnicas locales
están en `output/diet-phase3/provider-*.json`.
Campos: `schema_version`, `portion_policy`, `clinical`, `prescription`,
`restrictions`, `preferences`, `routine`, `professional_instructions`, `rules`, `meals`.
La salida contiene solo schema_version y meal_options con referencias, `base`
y multiplicadores. No acepta nutrición propuesta por el modelo.

## 8. Datos excluidos deliberadamente

Nombre completo, email, teléfono, UUID de paciente/profesional/consulta/plan,
chats, notas privadas, expediente completo, catálogo completo, claves y tokens.
El redactor existente se aplica también a nombres personalizados de candidatos
y tiempos. Pruebas con identidad/email/teléfono centinela inspeccionan la entrada
final del proveedor. Encabezado de correlación: solo generation ID.

## 9. Adapter

`OpenAIDietGenerator` implementa el contrato conceptual de `DietGenerator`;
`DietRoutingProvider` lo conecta a `OpenAIResponsesProvider` sin duplicar llamadas
ni reservas. El dominio generado sigue siendo puro, sin SDK, fetch o cliente DB.
`FakeDietGenerator` sigue funcionando sin permisos de red.

## 10–11. Modelo solicitado y devuelto

Solicitado en los cuatro intentos: **gpt-5.6-terra**, desde configuración del servidor.
Devuelto en la llamada exitosa: **gpt-5.6-terra**. Los rechazos HTTP 400 no
devuelven modelo ejecutado. Se conservan ambos datos por separado.

## 12. Pruebas Fake anteriores al consumo real

20 pruebas nuevas iniciales, 7 de frontera y regresión clínica existente.
Cobertura A–O: válida; candidato, unidad y tiempo inventados; hard; schema;
fuera de tolerancia; timeout; error de proveedor; fallo posterior con uso
confirmado; idempotencia secuencial/concurrente; contexto obsoleto; menú manual;
presupuesto insuficiente; acceso ajeno. Tres recorridos HTTP locales con proveedor
simulado validaron guardado, replay, confirmaciones y bloqueo de contexto obsoleto.
24 escenarios SQL del presupuesto atómico también aprobaron.

## 13–20. Casos, llamadas, tokens, latencia y costo

| Intento | Generación | Resultado | Entrada / salida / total | Latencia proveedor | Costo USD |
|---|---|---|---|---|---:|
| A | `2df0d2c1-f1f2-4b73-9f54-8f4d72928920` | HTTP 400 `invalid_json_schema` | No reportados | 7504 ms | 0 |
| B | `76acf4b0-b3bf-4ab6-8888-213b0524db58` | HTTP 400 `invalid_json_schema` | No reportados | 254 ms | 0 |
| C | `f344d0f7-ef48-4dac-b122-bba1b4305cf4` | HTTP 400 `invalid_json_schema` | No reportados | 265 ms | 0 |
| B correctivo | `5c32571c-51f5-4318-92bc-3c3e252f838f` | HTTP 200, `valid`, DRAFT aplicado | 4336 / 414 / 4750 | 6046 ms | 0.013640 |

**16. Número exacto: 4 solicitudes reales; 1 generación con usage confirmado.**

**17. Motivo de la única adicional:** el schema neutral tenía literales `const`
sin `type`. Eran válidos para el validador local, pero el proveedor rechazó el
contrato. Se sustituyeron por enums tipados equivalentes, sin aflojar restricciones.
Se agregó una regresión recursiva del contrato del proveedor, se ejecutaron
28 pruebas Deno, 71 de contexto/frontera, typecheck/lint y HTTP Fake antes del
cuarto intento. El éxito posterior confirma compatibilidad del contrato corregido.
No se cambió el selector ni se repitió por estética.

Los tres rechazos no entregaron `usage`; se conciliaron a cero por rechazo
explícito antes de generación. No se presentan tokens desconocidos como medidos.
Llamada exitosa: cached_tokens=0; reasoning_tokens=121 incluidos en salida=414.
El reporte conserva además el campo informativo `cache_write_tokens=4333`.

## 21–22. Costo total y acumulado

Tarifas configuradas: USD 2/millón entrada, 0.20/millón entrada cacheada,
12/millón salida. Cálculo sobre uso real, **no lectura de factura**:

`4336 × 2 / 1 000 000 + 414 × 12 / 1 000 000 = US$0.013640`.

Fase 3: **US$0.013640**.
Anterior: **US$0.022356**.
Acumulado: **US$0.035996**.
Los cargos simulados del ledger local no son gastos de OpenAI y no entran en esta suma.

## 23–24. Candidate pool y estimación vs uso

| Caso | Desayuno / Comida / Cena | Total candidatos | Payload UTF-8 | Estimación chars/4 | Input real |
|---|---|---:|---:|---:|---:|
| A | 14 / 12 / 14 | 40 | 13807 bytes | 3450 | No disponible |
| B | 14 / 12 / 13 | 39 | 13438 bytes | 3357 | No disponible |
| C | 14 / 12 / 14 | 40 | 13812 bytes | 3451 | No disponible |
| B correctivo | 14 / 12 / 13 | 39 | 13438 bytes | 3357 | 4336 |

En B: 12 alimentos por tiempo; recetas: 2/0/1. El estimado se refiere solo al
payload; los 4336 tokens incluyen instrucciones, schema y framing. Diferencia:
979 tokens, aproximadamente 29.2% por encima de chars/4. No son medidas
directamente equivalentes. La sección `meals` ocupa 10841 bytes, alrededor del
80.7% del payload. Es coherente con enviar candidatos; no hay expediente oculto.

## 25–27. Referencias, unidades y restricciones

En B correctivo: **0 referencias inventadas, 0 unidades inválidas, 0 exclusiones
incumplidas**, tres tiempos respetados. Se verifican tanto alimentos directos
como ingredientes de recetas. B excluye IDs explícitos guardados en el plan
(incluidas tortillas del catálogo local); no intenta resolver alergias ambiguas.
A/B/C iniciales no tuvieron salida, por lo que estas comprobaciones no aplican.
Los casos de ataque Fake permanecen rechazados e imposibles de aceptar.

## 28. Recálculo frente al objetivo

| Variable | Objetivo capturado | Recálculo catálogo | Diferencia |
|---|---:|---:|---:|
| kcal | 1750 | 1730 | −20 |
| Proteína g | 87.5 | 91 | +3.5 |
| Carbohidratos g | 218.75 | 233 | +14.25 |
| Grasa g | 58.333333… | 47 | −11.333333… |

Se conservó la autoridad SMAE del Taller. El modelo no aporta valores nutricionales.
El fixture contiene deliberadamente diferencias entre equivalentes y objetivo
macro, que no se ocultan ni se interpretan como adecuación clínica automática.

## 29–30. Estado y conversión a DRAFT

B correctivo: `valid` respecto a la distribución de equivalentes, issues vacíos,
`requiresTargetReview=true` por diferencias respecto a kcal/macros. Aplicar sin
aceptar diferencias fue rechazado. Tras aceptación explícita de prueba, se
guardó `nutrition_plans.status=draft`, revisión 2, menú `editing`, opciones `draft`,
sin confirmación, sin semana publicada y `current_version_id=null`.
No se creó ninguna `nutrition_plan_version`.
A/B/C iniciales: generación `failed`, sin propuesta ni borrador aplicado.

## 31. Idempotencia

El mismo key concurrente en HTTP Fake hizo una única llamada y una reserva.
Replay secuencial y repetición de apply no duplicaron cargos ni cambios de revisión.
La llamada real exitosa también se repitió con el mismo key antes de aplicar:
devolvió el resultado persistido sin contactar al proveedor. Repetir apply devolvió
`replay=true`. Un cambio posterior de contexto no autoriza una nueva generación
con el mismo key: se rechaza el conflicto.

## 32. Créditos y conciliación

Reserva máxima configurada por solicitud: USD 0.097152 = 9.716 créditos.
Los tres rechazos liberaron toda la reserva. B correctivo consumió 1.364 créditos,
liberando 8.352 de su reserva; un único `USAGE`.
Timeout incierto retiene reserva; fallo confirmado antes del proveedor libera;
schema inválido o fallo de persistencia posterior conservan usage confirmado.
Se añadió `recordResult` al orquestador compartido y se cubrió el fallo posterior
con conciliación usando el uso real. No existe ledger nuevo del Taller.

## 33. Menú manual

El snapshot guarda el indicador de contenido previo, no una copia del menú privado.
El servidor exige `replaceExisting=true`; la prueba HTTP devuelve
`replacement_confirmation_required` sin esa aceptación. La vigencia también
impide que un menú editado después se sobrescriba con una aceptación antigua.

## 34–35. Pruebas finales y calidad

- Taller: **302/302**, 31 archivos.
- Contexto/frontera: **71/71**, incluidos en lo anterior.
- Deno: **81 pruebas + 19 pasos HTTP**, sin fallos, incluyendo replay offline de
  la respuesta real y su snapshot original.
- HTTP con Auth/Postgres reales y proveedor Fake: A/B/C aprobados.
- Presupuesto SQL: **24 escenarios**, incluidas concurrencia e idempotencia.
- Scripts SQL AI core, concurrencia y Taller anterior: aprobados.
- Suite frontend completa: **686 aprobadas, 1 fallo conocido del landing**;
  85 archivos aprobados y 1 fallido. No se corrigió ni alteró ese trabajo ajeno.
- TypeScript, ESLint de archivos modificados del dominio, Deno check y bundle
  reproducible: aprobados. `git diff --check` limpio.
- Supabase advisors local, seguridad nivel error: sin hallazgos.
- Grants comprobados: cliente autenticado no lee snapshots ni ejecuta source;
  anon no ejecuta acciones. Trigger de inmutabilidad comprobado con UPDATE real.

## 36. Archivos de Fase 3

Modificados:

- `frontend/src/features/diet-workshop/generationBoundary.ts`
- `frontend/src/features/diet-workshop/generationSchema.ts`
- `supabase/functions/ai/core.ts`
- `supabase/functions/ai/index.ts`
- `supabase/functions/ai/diet-generation-domain.js` (generado)

Nuevos:

- `frontend/src/features/diet-workshop/generationCalibrationFixtures.ts`
- `scripts/build-diet-calibration-fixtures.mjs`
- `scripts/report-diet-calibration.mjs`
- `supabase/functions/ai/diet-contract.ts`
- `supabase/functions/ai/diet.ts`
- `supabase/functions/ai/diet_test.ts`
- `supabase/functions/ai/diet_local.ts`
- `supabase/functions/ai/diet_calibration_test.ts`
- `supabase/functions/ai/fixtures/diet-phase3.json`
- `supabase/functions/ai/fixtures/diet-real-calibration.json`
- `supabase/migrations/20260922054729_diet_draft_snapshot.sql`
- Este reporte.

Evidencia no versionada: `output/diet-phase3/` (payloads, intentos, respuestas,
contabilidad, guards de llamadas y resumen exacto).

## 37. Git y estado local

HEAD: `3473dde`; staging vacío; cambios anteriores de Landing preservados;
`output/` y `tmp/` continúan no rastreados. Los archivos anteriores de Fase 3
permanecen modificados/nuevos para revisión. No se incluyeron claves ni `.env`.
La migración se verificó mediante SQL en Docker local, sin registrar historia
durante la iteración; `migration list --local` la muestra pendiente. Al preparar
el siguiente checkpoint habrá que reconciliar el esquema local antes de volver
a ejecutar esa migración allí. **No aplicarla otra vez a ciegas** sobre esas tablas.

## 38. Límites respetados

Sin push, merge, deploy, commit de Fase 3 ni publicación de planes. Datos de
prueba únicamente locales, con propietario sintético y feature deshabilitada
al terminar. Cuatro solicitudes reales en total; sin reintentos automáticos
ni regeneraciones estéticas; sin cambios del selector; sin rediseño de UX,
múltiples opciones o regeneración por tiempo.

## 39. ¿Fase 3 técnicamente cerrada?

**No, como fase de calibración completa.** La integración técnica y un recorrido
real con restricciones están comprobados, pero A y C no tienen salidas reales
válidas con el schema corregido. No se gastó una quinta llamada para completar
esa evidencia. El estado parcial es explícito, no un fallo silenciado.

## 40. Pendientes concretos antes de UX definitiva

Revisar este contrato y evidencia; decidir si se autoriza una nueva ronda
acotada para A/C en una fase posterior; reconciliar la migración local antes de
su checkpoint; después diseñar la presentación/aceptación del nuevo `diet_draft`.
El botón anterior no se cambió para no mezclar UX con calibración.
La conservación de snapshots clínicos mínimos necesita una política de retención
antes de habilitación productiva; no se inventó aquí un plazo de eliminación.
No hay autorización para más llamadas ni para publicar o desplegar en esta fase.

## 41. Recomendación sobre pool/payload

Mantener **12 alimentos + hasta 6 recetas por tiempo** por ahora. El caso real
usó 39 candidatos, 13.4 KB, 4336 tokens de entrada y USD 0.013640 total: no hay
evidencia de un costo excesivo que justifique recortar el contexto.
Sí hay evidencia de baja cobertura de recetas para Comida (0 elegibles) y cierta
repetición de alimentos entre tiempos. Revisar cobertura culinaria del catálogo
en una fase futura, no cambiar filtros para favorecer tres respuestas ni confundir
`valid` técnico con calidad culinaria o adecuación clínica aprobada.

## Referencias consultadas

Compatibilidad del schema y validación estricta: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
Autenticación de funciones: [Supabase Edge Functions Auth](https://supabase.com/docs/guides/functions/auth).
Se revisó el [changelog de Supabase](https://supabase.com/changelog) antes de implementar.
