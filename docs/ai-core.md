# IA-1 — Núcleo central y créditos de Nuthrick

## Alcance

Infraestructura reusable; no PES, R24h, dietas, resúmenes ni agentes clínicos. `core_check@1` es una prueba técnica con contexto fijo y sintético. Todas las funciones se crean **deshabilitadas**, sin modelo/tarifa por defecto y sin asignar créditos a profesionales. No hay checkout ni panel administrador.

## 1–3. Arquitectura, proveedor y secretos

UI → servicio `frontend/src/services/ai.ts` → Edge Function `ai` → `auth.getUser()` → configuración/adaptador server-side → reserva SQL → única llamada OpenAI Responses → validación JSON Schema → liquidación/auditoría → respuesta.

`AIProvider` permite sustituir el proveedor sin cambiar módulos. `OpenAIResponsesProvider` es el único archivo con el endpoint OpenAI. `AIStore` separa la contabilidad del proveedor y permite pruebas sin red. No se reutiliza la función Agenda para IA: se separan secretos, despliegue y responsabilidad.

Secretos únicamente en **Supabase Edge Function Secrets**, proyecto `qlsqhvyrslclmlstlemn`:

- `OPENAI_API_KEY`: clave de un proyecto OpenAI de Nuthrick con presupuesto/límites propios; nunca prefijo `VITE_`/`NEXT_PUBLIC_`, repositorio, navegador ni tabla pública.
- `NUTHRICK_AI_ENABLED=true`: interruptor global; ausente significa deshabilitado.
- `AI_SITE_URL=https://nuthrick.vercel.app`: origen autorizado; no es secreto.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`: entorno administrado de Edge, jamás frontend.

Configurar la clave directamente en Secrets, no pegarla en conversaciones, comandos con literal ni archivos versionados. No se debe copiar ningún secreto existente de Agenda. No se necesita una clave real para ejecutar las pruebas de esta entrega. Mantener el interruptor apagado hasta configurar tarifas y probar con autorización. El saldo no es dinero disponible en OpenAI: es contabilidad interna por profesional.

## 4–7. Tablas, ledger, reserva y settlement

Cuatro tablas en esquema **private**:

| Tabla | Contenido |
| --- | --- |
| `ai_feature_config` | Feature, proveedor, modelo, versión del prompt, límites, reasoning/temperatura, timeout, tarifas y regla de crédito |
| `ai_accounts` | Saldos incluidos/comprados, reservas separadas y periodo |
| `ai_generations` | Referencias internas, estado, configuración congelada, tokens/costos/cargos; sin texto clínico |
| `ai_credit_ledger` | Movimientos inmutables para el rol de servicio; sin UPDATE/DELETE |

Tipos: PLAN_ALLOCATION, PURCHASE, USAGE, REFUND, ADMIN_ADJUSTMENT, RESERVE, RELEASE. REFUND y ADMIN_ADJUSTMENT se reservan para una futura operación administrativa validada; no existe un endpoint de navegador para ellos. Liberar una reserva no es un reembolso de una compra y se registra como RELEASE.

`ai_server('reserve',…)` bloquea **la fila de la cuenta**, valida pertenencia del contexto y configuración vigente, calcula la reserva máxima y la anota junto al evento en la misma transacción. Primero usa créditos incluidos vigentes, después comprados. Un profesional no puede financiarse con otra cuenta. Máximo 3 solicitudes sin cerrar y 10 nuevas por minuto por cuenta. No se mantiene una transacción abierta durante la llamada de red.

`claim` cambia reserved → running una sola vez. Un idempotency key repetido no reserva ni llama otra vez; cambiar el contexto bajo la misma clave da conflicto. El hash identifica feature/referencias internas, no almacena hashes de texto clínico de baja entropía.

`settle` bloquea cuenta y generación en el mismo orden: registra tokens/costo, cobra uso real y libera toda la reserva; la diferencia vuelve a estar disponible. Liquidaciones repetidas son idempotentes. Si el costo excediera anormalmente la reserva, se conserva el costo real para auditar pero no se cobra más de lo autorizado: Nuthrick absorbe el exceso. La configuración queda congelada durante la ejecución, por lo que cambiar una tarifa no recalcula eventos pasados.

## 8–10. Aislamiento, tokens y moneda

El cliente no puede enviar professionalId, prompt, modelo, precio, saldo ni contexto arbitrario. La identidad se deriva del JWT verificado por `auth.getUser()`. El gateway SQL es **SECURITY INVOKER y ejecutable exclusivamente por service_role**. El `p_owner` de este gateway lo construye Edge, no se copia de la petición.

Si hay patientId se comprueba `patients.professional_id` y que no esté eliminado. Si hay consultationId debe pertenecer al mismo profesional **y al patientId indicado**, no estar eliminada y no puede enviarse sola. Las referencias son auditoría interna y nunca se envían al proveedor por el adaptador actual.

Uso real: `input_tokens`, `output_tokens`, `cached_tokens`, `total_tokens=input+output`. Output incluye razonamiento según el reporte del proveedor. Uso ausente/inconsistente **no se interpreta como cero**.

`USD = ((input − cached) × tarifa_input + cached × tarifa_cached + output × tarifa_output) / 1_000_000`.

`Créditos = ceil(USD × credits_per_usd × credit_multiplier × 1000) / 1000`.

Moneda interna con precisión 0.001; USD con 9 decimales. La conversión inicial configurable es 100 créditos/USD y multiplicador 1, **no una tarifa de OpenAI**. Las tarifas por millón y `pricing_version` deben configurarse explícitamente por modelo; no se inventa un precio actual. La reserva usa límites completos de input/output sin descuento de caché. Input se limita conservadoramente por bytes UTF-8 + 2048 de framing; IA-1 no acepta imágenes, herramientas, historial ni texto libre. Revisar este límite al implementar cada futuro adaptador/modelo.

## 11–14. Versionado, esquemas, privacidad y RLS

Adaptadores server-side emparejan feature + prompt_version + selección mínima de contexto + JSON Schema. La configuración no puede convertir una feature clínica futura en implementación: un adaptador inexistente falla cerrado. Añadir un proveedor requiere registrar su implementación; no se admiten URLs de proveedor arbitrarias.

Responses usa `text.format.type=json_schema`, `strict:true`, `store:false`, sin background. Ajv valida otra vez en servidor. Rechazo, JSON inválido o respuesta incompleta nunca devuelve una propuesta aplicable ni escribe el expediente. Sí se contabilizan los tokens que realmente se consumieron. El núcleo **no escribe entidades clínicas**; una futura aceptación deberá hacerlo explícitamente en su módulo.

No se guardan automáticamente instrucciones, contexto, prompt ni respuesta en DB/logs. No se propagan mensajes brutos del proveedor/SQL. No se envían nombres, correo, teléfono, dirección ni UUID internos en el body de OpenAI. Se utiliza un ID técnico de generación en `X-Client-Request-Id` para correlación, no como garantía de idempotencia del proveedor.

`store:false` desactiva almacenamiento de estado de Responses; **no garantiza Zero Data Retention** ni elimina por sí solo registros de abuso del proveedor. Revisar condiciones de tratamiento/retención y consentimiento antes de habilitar cualquier función clínica.

RLS habilitado en las cuatro tablas, sin permisos para anon/authenticated. Las funciones de saldo/estado son fachadas de solo lectura: pequeño helper **private SECURITY DEFINER**, `search_path=''`, filtro explícito `(select auth.uid())`; wrapper público INVOKER, sin acceso anon. No se exponen payloads ni referencias de otros profesionales. Service role no puede editar/borrar ledger; solo insertar. No se agregan vistas públicas.

## Periodos y asignaciones futuras

`ai_grant_credits` es una interfaz **solo servicio** para futura facturación, no un checkout. PLAN_ALLOCATION establece periodo y sustituye saldo incluido anterior (sin rollover), registrando el delta. PURCHASE añade saldo comprado sin caducidad en IA-1. La clave de operación evita duplicar una asignación. Un periodo anterior o una segunda asignación del mismo periodo se rechazan. No se cambia de periodo mientras existan reservas de créditos incluidos: se requiere conciliarlas antes para evitar consumir/restaurar saldos de otro periodo. Incluidos vencidos no están disponibles, aunque su saldo contable permanece hasta la siguiente asignación. No hay asignación mensual automática en esta fase.

## Fallos, reintentos y conciliación

- Rechazo explícito antes de consumo: settlement cero + RELEASE.
- 429: un reintento limitado dentro del mismo timeout/reserva, sin nueva generación.
- Timeout, fallo de transporte, 5xx o uso desconocido: **uncertain**, reserva retenida, sin reenvío automático.
- Fallo al guardar settlement: reintento SQL idempotente, nunca nueva llamada OpenAI. Si no se confirma, evento queda sin cerrar para conciliación.
- `ai_generation_status(idempotencyKey)` permite consultar estado sin gastar ni depender de que la feature siga habilitada.
- Repetir una ejecución terminada devuelve estado, **no repite la salida** porque no se almacena. La UI conserva en memoria la respuesta original; futuros módulos deberán guardar explícitamente propuestas aceptadas.
- `release_unclaimed` permite liberar únicamente `reserved` de más de 10 minutos. No libera running/uncertain. No hay cron que asuma que un timeout fue gratis.
- Para resolver running/uncertain: un operador de confianza debe comprobar el consumo por ID de correlación en OpenAI, y usar `settle` con uso real; únicamente con evidencia de no consumo puede liquidar cero. No hay panel ni conciliación automática porque no existe garantía de recuperar respuestas con `store:false`.

## UX reusable

`AIButton`, `AIGenerationState`, `AIUsageIndicator`. Indicador discreto del saldo en navegación profesional, recarga al recuperar foco y al finalizar solicitud. Fallo de consulta muestra «Saldo no disponible», no un cero inventado. Sin créditos: «Ya utilizaste los créditos de IA incluidos en tu plan». No se muestra compra ficticia. Estado incierto bloquea regenerar. No se añade un botón de IA a PES/R24h/Taller.

## 15–20. Verificación y entrega

Pruebas locales sin OpenAI ni datos reales:

```sh
node scripts/test-ai-core.mjs
node scripts/test-ai-concurrency.mjs
deno check --config supabase/functions/ai/deno.json supabase/functions/ai/index.ts
deno test --config supabase/functions/ai/deno.json supabase/functions/ai/core_test.ts
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
```

SQL cubre separación de profesionales, permisos, saldo, prioridad, caché, settlement, liberación, incertidumbre y ledger append-only. Concurrencia usa dos conexiones PostgreSQL reales para reserva y cinco para settlement en base efímera local eliminada al terminar. Tests del proveedor usan fetch simulado; no son una prueba de acceso a una cuenta/modelo real. No se introducen pacientes de prueba en producción.

Migración: `20260922005406_ai_core_credit_ledger.sql` (nombre sincronizado con el historial remoto de Supabase). Función Edge: `ai`, autenticación JWT de plataforma más `auth.getUser`. La configuración/clave faltante mantiene ejecución cerrada. **Un despliegue del núcleo no equivale a habilitar IA clínica**.

Resultados verificados: 582 tests frontend / 79 archivos en copia limpia de entrega; 15 pruebas Deno; TypeScript, Deno check, lint y build correctos. Los cambios no relacionados de LandingPage se conservaron sin incluir en la entrega (tienen un fallo de test propio en el árbol de trabajo). PostgreSQL serial y concurrencia pasaron. Edge `ai` v1 desplegada; acceso sin autenticar responde HTTP 401. Auditoría remota: cero features habilitadas, cero generaciones, ledger vacío, sin permisos monetarios para authenticated/anon y sin UPDATE/DELETE del ledger para service_role.

Commit principal: `71ae3c2` (núcleo, migración, controles y pruebas), enviado a main. Vercel publicó el núcleo en [nuthrick.vercel.app](https://nuthrick.vercel.app) con estado Ready. Verificación visual autenticada: indicador «IA 0 créditos disponibles» debajo de Diseño de consulta, sin errores de saldo. No se asignaron créditos ficticios, no se hicieron llamadas reales a OpenAI ni se modificaron pacientes. El ajuste de refresco del saldo también cubre errores con consumo/reserva y cuenta con pruebas adicionales.

Supabase Advisors no agregó advertencias de seguridad: reporta cuatro avisos informativos esperados de [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) en las tablas privadas de IA, inaccesibles al cliente por diseño. Permanecen advertencias preexistentes ajenas a IA, incluida [protección de contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se cambió Auth ni otro módulo para silenciarlas.

Fuentes verificadas para implementación:

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
- [Responses y store:false](https://developers.openai.com/es-419/api/docs/guides/migrate-to-responses).
- [Retención y controles de datos](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint).
- [Autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth).
