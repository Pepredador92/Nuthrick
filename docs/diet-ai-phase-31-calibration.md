# Taller IA — Fase 3.1: cierre A/C

Fecha: 22 de septiembre de 2026. Base Git: `3473dde`.

**Resultado: Fase 3 técnicamente cerrada en local.** Exactamente dos llamadas nuevas, A y después C; ambas completaron generación, validación, conciliación y aplicación a borrador sintético. No implica publicación, despliegue ni aprobación clínica de los menús.

## Reporte solicitado: 36 puntos

1. **Causa de los tres rechazos anteriores.** Los nodos `schema_version: {const: 1}` y `portion_ref: {const: 'base'}` carecían de `type`. Eran aceptados por el validador JSON Schema general, pero no por el contrato estricto enviado al proveedor. Las tres respuestas conservaron `invalid_json_schema`; no se conservó el mensaje textual completo del proveedor. El diagnóstico se apoya en esos nodos, la regresión local y la posterior aceptación de B con la corrección, ahora confirmada por A/C. No se atribuye al registro histórico un mensaje que no contiene.

2. **Fix.** Ya existía antes de esta iteración: `{type: 'number', enum: [1]}` y `{type: 'string', enum: ['base']}`, con validación de `enum` en el parser compartido. No se cambió nuevamente el contrato, el modelo ni la lógica de dominio.

3. **Prueba preventiva.** `diet_test.ts`: `provider schema regression: every node has explicit supported type, literals use typed enums` rechaza expresamente ambos nodos antiguos. Revisa tipos, objetos cerrados y propiedades obligatorias. Se reforzó la prueba del transporte con igualdad exacta entre el schema enviado y `dietDraftAdapter.schema`. Antes de llamar al proveedor pasaron 31 pruebas, y 28 pruebas de contrato/transporte se repitieron tras esa aserción. El bundle generado coincide con las fuentes. La documentación oficial de [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) respalda el uso del subconjunto estricto; no se usó JSON Schema general como única garantía.

4. **Caso A.** HTTP 200, generación `0e219c64-f71f-4ad4-a31c-200895154a79`, ledger `succeeded`, validación `valid`, aplicación HTTP 200. Contexto requerido completo: PES y objetivo aprobados, prescripción válida y tres tiempos; sin restricciones complejas. Incluye tiempo disponible para cocinar de 30 minutos. Los campos opcionales no capturados permanecen ausentes, no se rellenaron artificialmente para la prueba.

5. **Caso C.** HTTP 200, generación `00092864-7434-441d-8add-59b856207be2`, ledger `succeeded`, validación `valid`, aplicación HTTP 200. Prescripción, PES/objetivo aprobados y tres tiempos válidos; preferencias desconocidas e información de rutina ausente.

6. **Nuevas llamadas:** exactamente **2**. No hubo reintentos ni regeneraciones.

7. **Histórico Fase 3:** **6** solicitudes: tres rechazos iniciales, B corregido, A y C de esta iteración. Los registros anteriores permanecen intactos.

8. **Modelo:** A y C solicitaron `gpt-5.6-terra`; ambas respuestas devolvieron ese modelo y el ledger lo registró igual. No se cambió proveedor ni configuración de inferencia.

9. **Tokens A:** entrada 4,455; salida 529; total 4,984; cached 0. Los 220 tokens de razonamiento están incluidos en salida, no se suman de nuevo.

10. **Tokens C:** entrada 4,456; salida 734; total 5,190; cached 0. Los 425 tokens de razonamiento están incluidos en salida. Se conservó además el metadato `cache_write_tokens` (A: 4,452; C: 4,453), sin contabilizarlo dos veces.

11. **Latencia A:** 9,491 ms de la solicitud al proveedor, no del flujo HTTP completo.

12. **Latencia C:** 13,607 ms bajo la misma medición.

13. **Costo A:** US$0.015258, calculado de usage real: `(4455 × 2 + 529 × 12) / 1,000,000` según la configuración registrada.

14. **Costo C:** US$0.017720: `(4456 × 2 + 734 × 12) / 1,000,000`.

15. **Costo Fase 3.1:** **US$0.032978**. Suma exacta en enteros de microdólares, sin redondeos intermedios. Fase 3 completa: US$0.046618, incluyendo B previo.

16. **Nuevo acumulado:** **US$0.068974** = baseline US$0.035996 + US$0.032978. Es el acumulado de calibración documentado, no una consulta del saldo de la cuenta ni de otros consumos.

17. **Pool A:** 40 posiciones de candidatos por tiempo (no necesariamente 40 alimentos únicos): desayuno 14 (12 alimentos + 2 recetas), comida 12 (12 + 0), cena 14 (12 + 2). Payload clínico de 13,807 bytes; estimación previa por caracteres 3,450 tokens. La entrada real de 4,455 incluye instrucciones y contrato.

18. **Pool C:** misma distribución 14/12/14 y 40 posiciones; payload de 13,812 bytes; estimación por caracteres 3,451 tokens; entrada real 4,456. No se amplió el pool para mejorar la respuesta.

19. **Referencias inválidas observadas:** 0 en ambos casos. Cada `meal_ref` y `candidate_ref` se resolvió exclusivamente en el manifiesto original de su generación. El borrador conserva los IDs resueltos. Sin violaciones hard detectadas; las pruebas negativas de referencias, restricciones y elegibilidad también pasan.

20. **Unidades inválidas observadas:** 0. Cada salida usa `portion_ref: base`; cada multiplicador está permitido por su candidato. La cantidad convertida coincide con `baseQuantity × multiplier` y la unidad procede del catálogo, no de texto generado.

21. **Unknown en C:** `eating_pattern.fact` permanece `{state: 'unknown', reason: 'not_recalled'}`. Preferencias de alimentos y todos los campos de rutina permanecen `unavailable/missing`. El borrador mantiene `food_preferences: {}`. La respuesta restringida solo selecciona candidatos, porciones y multiplicadores; no escribe gustos, restricciones ni hechos del paciente. Esto verifica el comportamiento observable, no una interpretación del razonamiento interno del modelo.

22. **Objetivo vs. recálculo A:** véase tabla; nutrientes calculados por el dominio desde el catálogo/SMAE, sin aceptar cifras generadas como autoridad.

23. **Objetivo vs. recálculo C:** mismo resultado numérico, aunque la selección concreta puede diferir. Se comprobaron ambas respuestas independientemente.

| Magnitud | Objetivo A/C | Recalculado A/C | Diferencia |
| --- | ---: | ---: | ---: |
| Energía, kcal | 1,750 | 1,730 | −20 |
| Proteína, g | 87.5 | 91 | +3.5 |
| Carbohidratos, g | 218.75 | 233 | +14.25 |
| Grasa, g | 58.333333333333336 | 47 | −11.333333333333336 |

24. **Estado A:** `valid`, cero issues; `requiresTargetReview: true`. Cumple distribución de equivalentes. La diferencia con objetivo energético/macros exige revisión, no invalida automáticamente el resultado con las reglas existentes.

25. **Estado C:** `valid`, cero issues; `requiresTargetReview: true`. No se alteraron tolerancias ni se convirtió `needs_adjustment` en `invalid`.

26. **Draft A:** plan `draft`, menú `editing`, opciones `draft`, `confirmed_at: null`, sin plan semanal publicado y cero filas en `nutrition_plan_versions`. Aplicación realizada únicamente sobre un plan sintético nuevo. Una aplicación sin aceptación de diferencias se bloqueó con 409.

27. **Draft C:** mismas garantías. Ambos siguen editables, no aprobados. No había menú manual que sustituir; la protección de reemplazo manual permanece cubierta por las pruebas existentes. No se modificó ningún expediente real.

28. **Snapshot A/C:** hash SHA-256 verificado y payload enviado idéntico al conservado. A: `d6f64a83b509a2b372e1196cbfd437ba6377e83ee7f8041a13e24cf91980aab4`; C: `175769f1b163a5b570de47b943bbbfbd4d1ad254fd4dcef4b45c4982ca4b7ff3`. Validación y replay offline usan esos snapshots, no un catálogo reconstruido posteriormente. El trigger rechazó modificar cada snapshot; alterar su stamp también falla la verificación de hash.

29. **Créditos:** cada generación tiene exactamente un `RESERVE`, un `USAGE` y un `RELEASE`. Estimado US$0.097152 / reserva 9.716 créditos para cada una. A cobra 1.526 créditos y deja disponible la diferencia de 8.190; C cobra 1.772 y deja 7.944. El ledger libera toda la retención de 9.716 y registra el consumo aparte; no son dos devoluciones. La conversión a créditos conserva el redondeo existente a milésimas. Replay de generación y aplicación no repitió llamadas ni cobros. Reservas pendientes de la cuenta sintética al terminar: 0.000/0.000.

30. **Pruebas finales:** 88 pruebas Deno + 19 pasos HTTP pasan (incluye siete nuevas reproducciones offline A/C). Regresión del Taller: 302/302 en 31 archivos. Suite frontend completa: 686 pasan y una falla, únicamente el caso conocido del H1 del landing. Pasan los scripts SQL de core/créditos, concurrencia, 24 escenarios de presupuesto diario y la integración del Taller. Pasan integridad del bundle y `git diff --check`. No se corrigió el landing.

31. **TypeScript/ESLint:** `npm run typecheck` pasa; ESLint focalizado de `generationBoundary.ts`, `generationSchema.ts` y `generationCalibrationFixtures.ts` pasa. `deno check` del ejecutor y el chequeo de tipos de las pruebas pasan; `node --check` del reporte pasa. No se afirma haber ejecutado un lint global de todo el repositorio.

32. **Git status:** HEAD permanece `3473dde`; staging vacío. Los cambios de Fase 3 continúan sin commit: boundary/schema del frontend; core/index/bundle y nuevos adaptadores/tests/fixtures de Edge; migración `20260922054729_diet_draft_snapshot.sql`; documentación y scripts. Esta iteración solo añadió evidencia, reporte, pruebas y el límite A/C del ejecutor, y reforzó una aserción de transporte. `LandingPage.tsx`, `LandingPage.test.tsx`, `output/` y `tmp/` ya tenían cambios o contenido ajeno, preservado. La migración se había aplicado manualmente en la base local en Fase 3; no se reaplicó ni se modificó su historial en esta iteración.

33. **Operaciones no realizadas:** ningún commit, push, merge o deploy. No se activó IA en producción. La bandera local `diet_draft` terminó deshabilitada. No se inició Fase 4, múltiples opciones ni regeneración por comida.

34. **¿Fase 3 cerrada? Sí**, en cuanto al contrato e integración técnica local y a la calibración A/B/C autorizada. El cierre no sustituye la revisión profesional de las dietas ni autoriza publicar cambios.

35. **Defecto que impida el cierre:** ninguno observado dentro del alcance. El fallo preexistente del landing sigue pendiente y separado. La revisión de Git y autorización de publicación siguen siendo pasos de entrega, no pruebas pendientes de calibración.

36. **Pendiente de UX/producto:** variedad y coherencia culinaria, presentación de diferencias para revisión profesional, pulido de la experiencia de borradores y futuros flujos de opciones/regeneración si se autorizan. No se hicieron cambios subjetivos ni más llamadas para obtener menús “más bonitos”.

## Evidencia y reproducción sin consumir API

- `output/diet-phase31/real-attempts.json`: exactamente A y C; registro durable previo a cada llamada.
- `output/diet-phase31/provider-A.json`, `provider-C.json`: payload/usage/respuesta capturados, sin API key.
- `output/diet-phase31/real-A.json`, `real-C.json`: HTTP, ledger, snapshot original y borrador local.
- `output/diet-phase31/summary.json`: métricas y suma exacta.
- `supabase/functions/ai/fixtures/diet-real-phase31.json`: evidencia sintética autocontenida para replay.
- `supabase/functions/ai/diet_phase31_test.ts`: siete pruebas offline; no requieren permiso de red.
- `scripts/report-diet-phase31.mjs`: reconstruye el resumen y fixture desde los archivos, sin proveedor ni SQL.

El ejecutor `diet_local.ts real --phase31` rechaza reiniciarse si ya existe algún intento, limita a dos envíos y exige A aplicado correctamente antes de C. **No volver a ejecutarlo para regenerar esta evidencia.**

Las guías OpenAI Docs y Supabase orientaron la comprobación del contrato estricto y la separación entre autenticación, datos privados y proveedor. Se consultó [seguridad de Edge Functions](https://supabase.com/docs/guides/functions/auth); no motivó cambios a la arquitectura cerrada.
