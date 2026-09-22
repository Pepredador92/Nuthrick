# Presupuesto diario de IA: corrección local

## Checkpoint y alcance

Checkpoint clínico local: `4d0b177` — `fix(clinical): close PES and objective approval with HTTP validation`.
Antes del commit: 47 tests Deno/18 pasos HTTP, 41 comprobaciones SQL clínicas, 24 pruebas frontend clínicas; todo aprobado. `.env` ignorado, staging inspeccionado sin secretos. Landing y output/tmp excluidos. Este arreglo no modifica PES/Objetivo/Taller ni el landing y no utiliza OpenAI.

## Sistema original reconstruido

- `private.ai_feature_config`: modelo, cotas de tokens, precios y conversión por feature; bandera global por feature.
- `private.ai_accounts`: créditos incluidos/comprados y reservados, periodo, cuenta habilitada.
- `private.ai_generations`: estado, clave idempotente, propietario, snapshot de configuración, reserva, consumo confirmado y timestamps.
- `private.ai_credit_ledger`: movimientos inmutables de asignación, compra, reserva, uso y liberación; unicidad por propietario/operación/tipo.
- `private.ai_feature_access` y `private.ai_pilot_limits`: acceso por profesional, límites total/diario por feature y presupuesto diario compartido entre features del profesional.
- `public.ai_server`: RPC exclusivo service_role, acciones config/reserve/claim/uncertain/settle/release_unclaimed. `ai_grant_credits` también exclusivo servidor. Cliente solo consulta saldo/estado propios mediante RPC ligados a auth.uid().
- Edge `ai`: auth → parse → contexto → configuración/reserva → claim → proveedor → validar → settle. No hay transacción SQL mantenida abierta durante la llamada de red.
- Estados: reserved, running, uncertain, succeeded, failed, invalid_output.
- Límites adicionales existentes: 3 operaciones pendientes, 10 intentos/minuto; banderas globales de activación. No existe un presupuesto monetario global de todos los profesionales.

Originalmente cada reserva obtenía `FOR UPDATE` sobre la cuenta, luego comprobaba solo `spent >= max_daily_credits`. La nueva reserva se calculaba después y por eso no entraba en la comparación. También contaba todas las generaciones para los topes diario/total, aunque hubieran fallado sin costo. `date_trunc('day',now())` dependía del timezone de la sesión (UTC en la base Supabase local comprobada).

## Política de créditos conservada

Reserva USD máxima = `(max_input_tokens * input_price + max_output_tokens * output_price) / 1_000_000`.
Reserva en créditos = `max(0.001, ceil(USD * credits_per_usd * credit_multiplier * 1000) / 1000)`.
No es un límite en dólares: 5 significa cinco créditos internos, con conversión ponderada por configuración. Actualmente la configuración usa 100 créditos/USD y multiplicador 1. El snapshot conserva las tarifas de cada operación.

Consumo USD confirmado = tokens de entrada no cacheados y cacheados a sus tarifas + salida, dividido entre un millón. Costos de auditoría tienen 12 decimales. Créditos cobrados se redondean hacia arriba a 0.001 y se limitan a la reserva, como ya hacía el producto. Si un proveedor reportase uso por encima de su máximo, el costo USD completo sigue en auditoría, pero el cobro al usuario permanece limitado a la reserva; no se cambió esa política ni se oculta esa diferencia.

Se utilizan créditos incluidos vigentes primero y luego comprados. La conciliación descuenta únicamente el consumo confirmado y libera la reserva completa de los acumuladores (incluida la diferencia sin utilizar). No son dos cobros: reservado es capacidad retenida, consumido es descuento definitivo.

Reproducción original: 0.601 créditos confirmados + 2.868 reservados + otra reserva de 2.868 = **6.337**, permitido indebidamente con tope **5**. Ahora la segunda reserva se rechaza y permanecen 3.469 computables.

## Invariantes y fallos

La admisión exige `consumido del día + todas las reservas pendientes + nueva reserva <= tope`. Igualdad permite; exceso de 0.001 rechaza sin escrituras. El cálculo se hace dentro del bloqueo de cuenta, antes del INSERT. No se libera ni redespacha una generación incierta automáticamente.

| Resultado | Presupuesto/créditos | Cupo diario/total |
| --- | --- | --- |
| Auth, request, contexto o presupuesto rechazan antes de reservar | Nada | Nada |
| Error confirmado antes del proveedor o rechazo inequívoco sin uso | Reserva liberada completamente | No cuenta al terminar sin costo |
| Red/timeout/5xx o uso desconocido | Reserva retenida, running/uncertain | Cuenta hasta conciliación |
| Respuesta exitosa con usage | Uso real; libera diferencia | Cuenta |
| Parser/schema inválido con usage | Uso real; no se devuelve PES inválido | Cuenta si hubo costo |
| Fallo de persistencia después del proveedor | No se inventa costo cero; reserva pendiente | Cuenta hasta conciliación |
| Reserva sin claim con más de 10 minutos | RPC existente release_unclaimed puede liberarla | Deja de contar después de liberarla |

No se añadió limpieza automática: una operación running/uncertain no es prueba de falta de consumo y nunca se libera por simple antigüedad. El límite antiabuso de 10 intentos/minuto sigue contando intentos fallidos; es una pausa corta deliberada, no gasto ni bloqueo del cupo diario.

## Atomicidad, idempotencia y fecha

- Bloqueo exclusivo `ai_accounts FOR UPDATE` por profesional; después lectura bloqueada de límites y registro de generación. Reserva y decisión se confirman o revierten juntas. Los demás profesionales no comparten ese bloqueo.
- Unicidad `(professional_id,idempotency_key)` y replay revisado bajo el mismo lock. Payload incompatible produce idempotency_conflict. Una clave puede existir en dos usuarios, pero no permite leer/modificar la del otro.
- Settle usa bloqueo de cuenta y generación; un estado terminal devuelve lo ya conciliado. El ledger también impide duplicar USAGE/RELEASE.
- Día fijado explícitamente en **UTC**, conservando el comportamiento actual comprobado y evitando variaciones de sesiones/pool. No se cambia a la zona del nutriólogo.
- El reloj se lee después del lock: una espera alrededor de medianoche no usa la fecha vieja del comienzo de la transacción. `started_at` usa esa misma hora.
- Consumo confirmado se atribuye al día de admisión, como antes. Mejora deliberada: las reservas todavía pendientes de días anteriores continúan restando capacidad actual hasta conciliarlas. No desaparecen a medianoche ni se cobran dos veces. Al resolverse, su consumo queda en el día original.

## SQL y seguridad

Migración `20260922045147_ai_atomic_daily_budget.sql`:

1. Dos helpers privados: inicio del día UTC y total computable.
2. Sustitución de ai_server conservando conversión, ledger y conciliación; reserva se incluye en comparación, y fallos terminales sin costo se excluyen de cupos.
3. Privilegios de helpers solo para service_role; ai_server mantiene prohibición a PUBLIC/anon/authenticated. No cambian RLS ni grants de tablas.

El cliente no controla precios, usage ni propietario de la llamada Edge. RPC monetarios no son ejecutables por clientes; no tienen INSERT/UPDATE sobre cuentas/generaciones. Uso de service_role permanece únicamente servidor. Advisors locales, nivel error: sin incidencias.

## Pruebas y resultados

`node scripts/test-ai-daily-budget.mjs`: **24 escenarios**, sin HTTP ni API; usa base/roles efímeros con identificadores aleatorios y los elimina al terminar. Cubre menor/igual/exceso mínimo, 6.337 aislado y reproducción original, uso confirmado/activo, liberación, conciliación, fallos con costo, vencimiento seguro, incertidumbre entre días, UTC a medianoche con sesión México, aislamiento y permisos.

Concurrencia usa procesos PostgreSQL independientes, no Promise mocks: mantiene el primer lock hasta observar al segundo esperando en pg_stat_activity. Reserva 3+3/tope5: exactamente una pasa. Clave duplicada concurrente: una generación. Cinco settles concurrentes: un USAGE y una conciliación. También pasa el script previo test-ai-concurrency.mjs.

- Deno: **50 pruebas y 19 pasos HTTP**, todo aprobado. Nuevas pruebas verifican rechazo diario sin dispatch, fallo de binding con liberación y persistencia fallida sin devolución insegura ni redespacho.
- SQL core previo: **22**; SQL clínico: **41**; ambos pasan con rollback.
- Frontend clínico relevante: **24/24**. TypeScript aprobado.
- No se repitió la suite frontend completa en esta fase: el fallo conocido e independiente del landing sigue fuera de alcance y sus archivos no se modificaron.
- Migración aplicada únicamente en Supabase local; no push de Git, merge ni deploy remoto.
- OpenAI real: **0 llamadas**, **USD 0 adicional**; acumulado **USD 0.022356**. Kill switch local desactivado, fixture piloto previo deshabilitado.

Control diario cerrado para estas invariantes. No bloquea empezar desarrollo de Taller, que no se inicia aquí. Queda la conciliación operativa deliberada de resultados inciertos y la revisión/autorización antes de publicar; no se creó una política de facturación distinta.
