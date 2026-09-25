# ADMIN-3 · Recargas de créditos IA

## Alcance y uso

Se amplían ADMIN-1 y ADMIN-2. La unidad es Nuthrick AI Credit. No se crea otra wallet ni otro motor de cupones.

- Profesional: **Créditos IA** en el menú y **Ver créditos y recargar** en Mi plan (`/app/credits`).
- Administración: **IA y créditos → Paquetes de créditos / Compras de créditos**.
- Promociones: el selector **Aplica a** permite suscripciones o paquetes de créditos. El destino queda fijo al crear la campaña.
- Catálogo publicado exclusivamente TEST: 100 / 500 / 1000 créditos, con importes provisionales de 20 / 25 / 50 MXN. Estos importes no son precios comerciales definitivos.
- Solo las cuentas incluidas explícitamente en la lista de pruebas de ADMIN-2 pueden abrir un Checkout. El administrador controla esa lista en **Cobros · Test**. Tener saldo o ser administrador no activa OpenAI.

## Modelo y seguridad

`private.ai_credit_packages` guarda código, nombre, descripción, cantidad, bonus, precio, MXN, activo, interno, orden y versión. `private.ai_credit_price_mappings` congela cada versión comercial y vincula un Stripe Price de pago único. El producto del proveedor se identifica por la huella de esa versión para que una edición futura no cambie el nombre de una sesión anterior.

`private.ai_credit_purchases` conserva el propietario autenticado, paquete y precio originales, créditos base/bonus, importe esperado/pagado, promoción y política de crédito originales, referencia de Checkout/PaymentIntent/Charge, estados y reversiones. La política versión 1 registra vencimiento nulo y consumo de incluidos primero. La caducidad `expires_at` de la compra corresponde a la sesión de Checkout, no a los créditos.

Los saldos siguen en `ai_accounts`. El registro sigue en `ai_credit_ledger`; cada compra confirmada añade un `PURCHASE` vinculado a `credit_purchase_id`. El índice único por compra impide un segundo grant. Un trigger rechaza UPDATE/DELETE del ledger, también en mantenimiento privilegiado. Una reversión siempre añade un movimiento.

Las tres tablas nuevas tienen RLS y denegación de acceso directo. Los RPC públicos son `SECURITY INVOKER`; delegan en funciones privadas con autenticación, comprobación de administrador o permisos de servicio. El profesional lee exclusivamente su resumen; administración puede consultar paquetes y compras. El checkout acepta solo identificador de paquete, código e idempotencia, y obtiene el propietario de Auth. No acepta importes, cantidades ni profesional desde el cliente.

Se reutilizan el cliente del proveedor, la exclusión por profesional, `billing_webhook_events`, las campañas, redenciones, auditoría y el endpoint `billing/webhook`. No hay claves secretas en React ni IDs de Price fijos.

## Flujo y concurrencia

1. El profesional consulta saldo y elige un paquete activo y público.
2. El servidor verifica `ai.credit_purchase`, perfil profesional completado y lista TEST; valida precio/descuento y reserva la compra y el uso de promoción.
3. Reutiliza el Customer y la sesión pendiente. La creación usa claves idempotentes deterministas.
4. Stripe Hosted Checkout usa **`mode=payment`**, tarjeta TEST y cantidad 1. No crea suscripción ni recarga automática.
5. Un webhook con firma válida y tolerancia de 300 segundos reclama el evento y la exclusión por propietario.
6. El servidor obtiene el estado canónico actual de Checkout, PaymentIntent, cargo, reembolsos y disputa desde Stripe. Comprueba cuenta TEST, cliente, referencia local, Price, cantidad, moneda e importe; la metadata por sí sola no autoriza.
7. Pago confirmado, ledger PURCHASE, incremento de adicionales, redención promocional y auditoría se confirman en una transacción.
8. La URL de retorno solo consulta. Muestra “Estamos confirmando tu pago…” hasta observar `credited_at`; realiza hasta 12 consultas separadas por 5 segundos y ofrece actualización manual.

La exclusión compartida y el orden cliente → cuenta → compra evitan escrituras simultáneas del mismo propietario. El paquete se bloquea para lectura al crear su snapshot. La campaña se bloquea al reservar su uso. Hay restricciones únicas sobre Checkout, PaymentIntent, Charge y grant. Los eventos concurrentes reciben un error transitorio para el reintento de Stripe; eventos ya procesados responden como replay.

Límite: cinco nuevas compras por hora y veinte por 24 horas, por profesional. Reintentar la misma compra abierta reutiliza la sesión. Una sesión completada no se libera antes de confirmar su pago. Las sesiones anteriores conservan sus condiciones al editar o desactivar un paquete; las nuevas compras de paquetes inactivos se rechazan. Una sesión no recuperable cuya creación quedó interrumpida puede liberarse tras su vencimiento.

## Saldos, promociones y reembolsos

- Incluidos: se renuevan según el ciclo existente. Adicionales/comprados/cortesías: permanecen hasta consumirse; no caducan.
- Consumo: se mantiene el motor existente, incluidos primero y adicionales después. El resumen de Mi plan usa el mismo saldo efectivo que Créditos IA.
- Esencial y Profesional permiten comprar mediante entitlement. Founder hereda el permiso de su plan. Beta y Full Access conservan su configuración administrativa.
- Campañas de créditos: un descuento porcentual o fijo, más un bonus opcional. Se reutilizan vigencia, audiencia, límites totales/por profesional, nuevos clientes y atribución de ADMIN-2. Un cliente nuevo no tiene suscripciones pagadas ni compras de créditos acreditadas anteriores.
- El mínimo no nulo de cobro en MXN es $10.00. Se valida antes de reservar un checkout, incluyendo el descuento. Un descuento completo puede resultar en cero y requiere confirmación de Checkout sin pago pendiente. [Límites oficiales de Stripe](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts).
- Reembolso total: revierte exactamente créditos base + bonus. Conserva PURCHASE y añade REFUND.
- Reembolso parcial: reversión acumulada proporcional al importe devuelto, truncada a tres decimales; el total revierte el remanente exacto. Se consideran solo refunds `succeeded`. Si Stripe invalida uno previamente exitoso, un `REFUND_REVERSAL` restaura únicamente la diferencia. [Estados y eventos oficiales de refund](https://docs.stripe.com/refunds).
- Si los créditos ya se consumieron, se registra toda la reversión, pudiendo dejar adicionales negativos. Un saldo negativo o reservas sin cobertura bloquean nueva reserva/dispatch. El settlement de una operación ya enviada y su liberación siguen permitidos. Una recarga o ajuste positivo puede regularizar la deuda.
- Refund pendiente: compra en revisión y nuevos usos de IA pausados hasta conocer su resultado.
- Disputa/chargeback: compra en revisión, sin nuevos beneficios ni doble grant. La disputa ganada o advertencia cerrada levanta la revisión; una disputa perdida conserva el bloqueo para revisión administrativa. No se ejecutan reembolsos ni defensas automáticas. [Ciclo de disputas](https://docs.stripe.com/disputes/how-disputes-work).
- Las cortesías históricas sin referencia de compra se muestran como adicionales/cortesía, sin presentarlas como pagos de Stripe.

## Validación

Todos los datos utilizados para comprar son sintéticos. Solo se usa **Entorno de prueba de Nuthrick**, `acct_1UJP0ZDdgZFOxyxH`; nunca avena.io ni Live.

| Prueba | Resultado |
| --- | --- |
| Frontend completo | 93 archivos, 771 pruebas correctas |
| Pantallas de billing/recargas tras los ajustes finales | 17 pruebas correctas |
| Backend IA, llamadas simuladas y HTTP local | 110 pruebas y 19 pasos correctos; red limitada a localhost |
| Billing, firma, proveedor y recargas | 40 pruebas correctas |
| SQL ADMIN-2 sobre esquema con ADMIN-3 | Correcto |
| SQL ADMIN-3 | CRUD, historial inmutable, precios, promociones, saldos, reservas, refunds, deuda, permisos, planes internos y límites correctos |
| Concurrencia PostgreSQL | 8 workers / 2 eventos: un solo PURCHASE; último uso de promoción: solo un comprador |
| TypeScript y Deno | Sin errores |
| ESLint | 0 errores; 1 warning previo en LandingPage (`SecondShiftVisual` sin uso) |
| Build Vinext/Vercel | Correcto |
| Security Advisors | 0 regresiones: mismos 23 INFO + 12 WARN de referencia |

Los avisos previos son tablas privadas sin políticas (acceso por gateways), 11 funciones públicas históricas SECURITY DEFINER y protección de contraseñas filtradas desactivada. [RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [funciones](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

### Stripe TEST real

Se completaron Hosted Checkouts de 100, 500 y 1000 créditos contra el handler y una copia local de la base. El de 100 aplicó 20% de descuento +20 créditos bonus, cobró 16 MXN ficticios y acreditó 120. Los tres reutilizaron el mismo Customer y no crearon suscripciones.

Compra de 500: `d41f2b7f-4e60-470d-9fb8-e649e7953481`, PaymentIntent `pi_3UJQeoDdgZFOxyxH3CCsTnzM`. Webhook real firmado → un PURCHASE de +500; repetición firmada del mismo evento → ningún grant extra; refund parcial + total → reversión acumulada de 500 y saldo adicional de cero.

También se completó la compra `fe2886a5-185b-4ddb-8b91-763c93909267` con JWT real del profesional sintético de ADMIN-2 en el proyecto remoto: +500 créditos en un único PURCHASE, repetición firmada sin duplicación y reembolso total con -500. El saldo quedó en 10 incluidos y 0 adicionales. El RPC de administrador rechaza ese usuario y el endpoint rechaza un importe enviado por el cliente. La cuenta real de José y los registros clínicos se mantienen intactos. Los hashes antes/después coinciden para los 13 pacientes, 22 consultas, 9 planes alimenticios y 3 perfiles profesionales.

### Reproducción local

```sh
node scripts/test-credit-purchases.mjs
deno test --config supabase/functions/billing/deno.json supabase/functions/billing
deno test --allow-env --allow-net=127.0.0.1 --config supabase/functions/ai/deno.json supabase/functions/ai
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

El harness SQL crea una base descartable en `supabase_db_Nuthrick` y la elimina al terminar. Los scripts `stripe-credit-test-server.ts` y `test-stripe-credits.ts` exigen directorio privado de credenciales y nombre de base local; nunca son parte del frontend o del endpoint publicado. El listener usa su propio secreto local. Las credenciales del endpoint remoto permanecen en Vault.

## Entrega: 38 puntos

| # | Punto | Implementación / evidencia |
| --- | --- | --- |
| 1 | Modelo de paquetes | Catálogo versionado, bonus y política de no caducidad |
| 2 | Admin de paquetes | Crear, editar, activar, desactivar, ordenar y ocultar |
| 3 | Vista profesional | `/app/credits`, saldo y recarga sencilla |
| 4 | Checkout | Hosted Checkout del proveedor compartido |
| 5 | Payment mode | `payment`, pago único |
| 6 | Customer reuse | Mismo Customer en las tres compras reales TEST |
| 7 | Webhooks | Endpoint existente ampliado a 27 eventos |
| 8 | Firma | Firma sobre cuerpo original, ventana de 300 s, TEST obligatorio |
| 9 | Purchase record | Compra con snapshots y referencias únicas |
| 10 | Ledger PURCHASE | Entrada única por compra, créditos + bonus |
| 11 | Idempotencia | Evento, pago, compra y claves de operaciones |
| 12 | Concurrencia | Exclusión compartida + transacción + índices únicos |
| 13 | Balances | Cuenta existente y saldo efectivo tras reservas/deuda |
| 14 | Included/purchased | Separación visible y persistida |
| 15 | Consumo | Incluidos primero; reserva/settlement existente probado |
| 16 | Renovaciones | Conservan los adicionales |
| 17 | Promociones | Campañas y redenciones ADMIN-2 ampliadas |
| 18 | Bonus | Paquete y campaña; snapshot, grant y refund conjuntos |
| 19 | Refund | Total y parcial proporcionales; reversión append-only |
| 20 | Chargeback | Revisión y bloqueo de nuevos usos; resolución idempotente |
| 21 | Historial profesional | Compras, reembolsos y movimientos de plan/cortesía |
| 22 | Historial admin | Profesional, paquete, cantidad, importe, estado, código y fecha |
| 23 | RLS | Denegación directa; RPC por propietario o administrador |
| 24 | Importes/cantidades | Calculados en servidor, cotejados con Stripe |
| 25 | Rate limit | 5/h y 20/día por profesional |
| 26 | Migración | `20260925035115_ai_credit_purchases.sql` |
| 27 | Tests | Matriz anterior; pruebas de regresión y concurrencia |
| 28 | E2E Stripe Test | Tres tamaños, descuento/bonus, webhook, duplicados y refunds |
| 29 | Advisors | Cero hallazgos nuevos |
| 30 | TypeScript | Correcto |
| 31 | ESLint | Cero errores, un warning ajeno previo |
| 32 | Build | Correcto |
| 33 | Commit | Commit de esta entrega en `main`; cambios ajenos conservados |
| 34 | Vercel | Un push final; despliegue automático del repositorio |
| 35 | Stripe TEST | Cuenta Sandbox de Nuthrick, `livemode=false` |
| 36 | Cobros reales | 0 |
| 37 | OpenAI calls | 0; proveedor real continúa deshabilitado |
| 38 | Pendiente para Live | Decisiones y activación explícita descritas abajo |

## Antes de Live

Se necesita definir y aprobar precios comerciales, impuestos, condiciones de compra y política de reembolsos; completar los datos legales/fiscales y verificación de la cuenta Nuthrick; habilitar un entorno y credenciales Live separados con productos, precios y webhook propios; revisar los flujos operativos de disputas y atención; realizar una autorización explícita de lanzamiento. La aplicación actual restringe provider, credenciales y compras a TEST. Activar OpenAI es una decisión independiente.
