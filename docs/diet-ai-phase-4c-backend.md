# Taller IA — Fase 4C: backend real, proveedor controlado

Fecha: 2026-09-22. Base visual aprobada: `5d9af4c`. Sin cambios de componentes, estilos, textos ni layout de Fase 4B.

## Instalación y arquitectura

1. Faltaban en producción los RPC `ai_diet_source` / `ai_diet_draft`, snapshots privados y prerrequisitos de aprobación clínica/presupuesto ya presentes en el código local. Se compararon historial y objetos reales antes de instalar.
2. Operación canónica: **diet_draft**. `diet_workshop` deja de ser invocable; se conserva únicamente su historial, configuración apagada y código histórico de pruebas.
3. Se instalaron exclusivamente estas migraciones faltantes, en orden:
   - `20260922035457_clinical_pes_objective_review.sql` (aprobaciones y contexto obsoleto).
   - `20260922044231_clinical_http_service_permissions.sql` (permisos del servicio).
   - `20260922045147_ai_atomic_daily_budget.sql` (reserva concurrente).
   - `20260922054729_diet_draft_snapshot.sql` (snapshot, resultado y aplicación).
   - `20260922202619_diet_draft_backend_closure.sql` (feature canónica, simulación sin precio y retiro de RPC antiguo).
   El administrador MCP asigna timestamps remotos al aplicar: comparar también nombres, no reaplicar por diferencia de timestamp.
4. Edge Function existente **ai**, versión **10**, `ACTIVE`, `verify_jwt=true`, proyecto exclusivo `qlsqhvyrslclmlstlemn`. No nuevo framework ni servicio paralelo. Sin cambios de secretos. Acceso anónimo comprobado: HTTP 401.

## Contratos y seguridad

5. Request tipado: `feature: diet_draft`, `idempotencyKey`, `planId`, `revision`, identificadores opcionales de paciente/consulta que deben coincidir con el plan, `narrative` (máximo 1200 caracteres), `previousProposalId` opcional y `rejectedItems` opcional (máximo 30 referencias opacas `cN`). Se rechazan owner/professional, modelo y modo de ejecución enviados por cliente.
6. Response: generationId/status/replay; para resultado final, `validation`, `hasManualMenu`, `snapshotHash` y decisión. No se entrega JSON arbitrario del proveedor como menú confiable. Errores tipados existentes conservados.
7. Contexto construido server-side por IA-3: prescripción, PES aprobado, objetivo aprobado, preferencias/reacciones/rutina y catálogo autorizado. Sin identificadores personales en payload del proveedor. No se amplió el prompt para agregar R24h crudo, antropometría ni laboratorios: el builder cerrado no consume esos campos. No confundir esta fase de conexión con una ampliación clínica.
8. Schema y motores existentes validan referencias, grupos, cantidades, equivalentes, distribución, recetas y menú. Nuthrick recalcula la comparación nutricional. El proveedor no prescribe kcal/macros definitivos.
9. Snapshot hash + source stamp + revisión se verifican nuevamente al aplicar; un cambio de contexto invalida la propuesta.
10. Reserva y claim del servicio compartido conservan idempotencia concurrente y secuencial por profesional/request.
11. Aplicación transaccional real mediante `ai_diet_draft`: modifica **diet_menu del draft**, preserva `exchange_prescription` y `meal_distribution` (contrato IA-3), exige confirmación si reemplaza contenido. Fallo forzado revierte plan y decisión. No crea versiones ni comparte mediante Superlink.
12. Alternativas: descartar guarda temporalmente en memoria el generationId/revisión, sin contexto clínico. Regenerar envía previousProposalId. Backend verifica dueño/plan/stamp, obtiene el manifiesto anterior, excluye referencias previas y recalcula cobertura autorizada; conserva exclusiones acumuladas en snapshot privado. Máximo 30 intentos deterministas, sin llamadas de reparación. `rejectedItems` está soportado por contrato; no se agregó un control visual nuevo. Al aplicar o cambiar revisión se abandona la alternativa anterior.
13. `SimulatedDietProvider` produce salida estructurada determinista en el mismo AI Service, no en React. Modos válido, inválido, requiere revisión y error. Solo habilitable con flag explícito y URL local; dominio hospedado rechazado. Pruebas Deno restringen red a loopback y vacían la key.
14. Simulación: precios y tokens cero, reserva monetaria cero, misma cuenta/acceso/ledger/settlement. Constraint impide precio no cero para modo simulado. Ningún saldo comercial remoto tocado.
15. Kill switch global IA-1 conservado. Barrera adicional `NUTHRICK_DIET_REAL_PROVIDER_ENABLED` debe ser `true`; por defecto está apagada. Además requiere configuración habilitada, acceso profesional y configuración/modelo válidos. Rate limit existente 10/min, límites piloto y presupuesto se mantienen. Proveedor real reintenta solo rechazo explícito 429 una vez, nunca incertidumbre de timeout/red; no loops de herramientas.
16. Auth profesional no anónima y ownership plan→paciente→consulta antes de leer contexto. Profesional B no puede generar/aplicar datos de A. Plan libre sigue rechazado por el contrato IA-3; no se inventa una modalidad clínica nueva.
17. Snapshots privados con RLS y sin políticas cliente; RPC con acceso exclusivo service_role. Sin exposición de claves. Logs ordinarios no contienen prompts, contexto ni respuestas clínicas completas.
18. Advisors posteriores: ningún WARN nuevo; permanecen 11 advertencias históricas de funciones SECURITY DEFINER y la protección de contraseñas filtradas desactivada. Nuevo INFO de RLS sin políticas en `private.ai_diet_snapshots` es intencional (deny-by-default). No se corrigieron asuntos históricos ajenos.

## Verificación

19. Frontend: **307 pruebas / 29 archivos**, Taller/Copilot/Entrevista/Menú/Equivalentes/distribución/servicio.
20. Backend: **105 pruebas**, más **19 subcasos HTTP** de las suites Deno.
21. Incluye 3 pruebas nuevas específicas de proveedor, contrato y alternativa; fixtures históricos de IA se reproducen sin llamadas remotas.
22. SQL: **7 controles de seguridad** y **24 escenarios** de presupuesto/concurrencia.
23. HTTP real local: **22 casos** con Auth, Postgres, PostgREST y handler reales; sin interceptar respuestas del backend. Cubre apagado, permisos, inexistente/ajeno/libre/con paciente, PES/objetivo/minimización, falta de cuenta/saldo, válida/inválida, alternativa, stale, apply, discard, replacement, rollback, idempotencia y error. El caso de contexto verifica el builder vigente; no se afirma incorporar R24h al prompt. Pruebas visuales: normal/context/valid/needs adjustment/replace y retorno a Menú tras aplicar.
24. TypeScript: `npm run typecheck` pasa.
25. ESLint focal pasa; `git diff --check` pasa.
26. Build de release: se ejecuta desde el índice seleccionado, excluyendo el landing pendiente, con `VERCEL=1 npm run build`.
27. Commit: solamente los archivos de esta fase; ver hash en entrega final.
28. Push autorizado a origin/main sin force; cambios previos del landing, rollback fixtures, output y tmp fuera del commit.
29. Vercel: un deployment a partir del push; URL, commit y estado final en entrega.
30. **OPENAI CALLS = 0** en esta fase. No se invocó generación real en producción.
31. **ADDITIONAL COST = US$0**. Ledger remoto antes/después: 8 generaciones, US$0.001741. Acumulado documentado de calibraciones anteriores (incluyendo pruebas locales): US$0.068974, no costo de esta fase.
32. Estado final: backend instalado; `diet_draft.enabled=false`, ejecución real bloqueada por flag adicional. UX aprobada preservada; mensaje de inactividad existente. Provider simulado solo local, no ofrecido a usuarios de producción.
33. Fase 4D pendiente: autorizar activación controlada, revisar key existente sin exponerla, piloto, acceso, créditos, modelo/tarifas, límites y primeras llamadas reales. No se inició calibración.

## Reproducir sin OpenAI

```sh
# Requiere Supabase local en 127.0.0.1:54321 y migraciones instaladas.
SUPABASE_CLI=/ruta/a/supabase node scripts/test-diet-backend-local.mjs
# Agregar --visual, PLAYWRIGHT_MODULE y PHASE4C_CAPTURES para las cinco capturas.
deno test --config supabase/functions/ai/deno.json --allow-read --allow-env --allow-net=127.0.0.1 supabase/functions/ai/*test.ts
node scripts/test-ai-daily-budget.mjs
```

El runner crea profesionales/pacientes exclusivamente ficticios en DB local y restaura la configuración del proveedor en finally. Conserva los registros locales como evidencia; no crea pacientes remotos. Capturas de esta ejecución: `/tmp/nuthrick-phase4c-visual/`. La ruta `/tests/visual/taller-phase4c.html` funciona mientras se ejecuta el runner visual; no se publica como pantalla clínica.

Landing y Entrevista se comprobaron con SHA-256 antes/después. No se cambió ningún componente aprobado ni se creó segundo editor.
