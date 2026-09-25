# ADMIN-2 · Suscripciones, pagos y promociones

## Estado de la entrega

Implementación sobre `f8b916e`, en la rama `codex/admin-two`.
La cuenta independiente **Nuthrick** ya está creada. La integración usa únicamente
**Entorno de prueba de Nuthrick**, Sandbox `acct_1UJP0ZDdgZFOxyxH`, asociado a
la cuenta Nuthrick `acct_1UJP0IDDGKbaZsh7`. Se verificó el ID con la API antes de
crear objetos. La cuenta **avena.io no se ha utilizado**.

Los cuatro Checkouts alojados, promociones, prorrateo, portal y recuperación de
pagos pasaron contra Stripe Test real, usando una base SQL local aislada y
profesionales ficticios. Migración aplicada en `qlsqhvyrslclmlstlemn` y función
`billing` versión 1 activa. Webhook firmado remoto configurado con 15 eventos,
cuatro precios sincronizados, secretos cifrados en Vault y job cada 15 minutos.
El frontend se publica con un único push y despliegue automático de Vercel.

No hubo cobros reales. **OPENAI CALLS = 0.** Las pruebas de IA usan respuestas
simuladas; las pruebas HTTP únicamente pueden acceder a `127.0.0.1`.

## Diseño

`supabase/functions/billing/domain.ts` contiene el contrato `BillingProvider` y
los estados de cobro independientes del proveedor. `stripe-provider.ts` traduce
Stripe al contrato. `handler.ts` autentica usuarios, verifica eventos y coordina
operaciones; no contiene reglas específicas de códigos promocionales.

Nuthrick conserva planes, precios comerciales, promociones, límites y permisos.
Stripe conserva customers, Checkout, suscripciones e invoices. El webhook
actualiza la copia local. Las pantallas consultan esa copia mediante RPC; las
consultas clínicas habituales no consultan Stripe.

El adaptador futuro de Mercado Pago deberá implementar el mismo contrato y su
propia verificación de eventos. No está implementado en ADMIN-2.

### Almacenamiento

La migración `20260925032712_billing_subscriptions_promotions.sql` agrega:

- Configuración Test, días de gracia y profesionales habilitados para pruebas.
- Customers por UUID profesional; el correo no identifica la relación.
- Precios inmutables por plan, intervalo, moneda e importe y su mapping remoto.
- Campañas, snapshots de beneficios, mappings y redenciones.
- Intentos de Checkout, suscripciones, pagos, eventos y operaciones idempotentes.
- Un job cada 15 minutos para asignaciones mensuales y vencimiento de gracia.

Las tablas están en `private`, con RLS y sin acceso directo para clientes. Las
RPC de usuario usan `auth.uid()`. Las administrativas comprueban el administrador
activo. `billing_server` y la lectura de credenciales son exclusivamente del
servidor. Se reutilizan grants, overrides, access, auditoría y ledger de ADMIN-1.

La migración no altera registros clínicos ni asignaciones existentes. BETA5
conserva su política interna: 90 días, cinco usos, cero créditos. Founder sigue
siendo un grant; no se convierte en suscripción.

### Seguridad y consistencia

- JWT validado con Auth en el servidor; la función no confía en un JWT decodificado.
- `verify_jwt=false` permite recibir Stripe; las ramas autenticadas validan al usuario.
- Webhook firmado sobre el body original, con tolerancia de 300 segundos.
- Eventos, operaciones, clientes, invoices, precios y redenciones se deduplican.
- Lease por profesional y locks SQL serializan cambios y asignaciones.
- Bajo el lease se consulta el estado actual de Stripe: un evento retrasado no
  impone una copia antigua. Una suscripción antigua no sustituye a una nueva.
- Un error después de reclamar el evento registra un código seguro y devuelve
  un fallo reintentable. No se almacena el mensaje original del proveedor.
- Checkout y respuestas de operaciones no activan acceso. Solo el webhook
  verificado puede aplicar la suscripción. La URL de éxito solo espera confirmación.
- No se aceptan objetos Live. Las claves deben comenzar por `sk_test_` y la cuenta
  devuelta por Stripe debe coincidir con `STRIPE_ACCOUNT_ID`.
- Sin PAN/CVC, formularios propios de tarjeta, cuerpos de webhook completos ni
  secretos en el frontend. Los enlaces de Checkout, portal e invoice validan
  protocolo HTTPS y el host de Stripe correspondiente.

## Políticas comerciales

| Caso | Política implementada |
|---|---|
| Esencial | 349 MXN/mes o 3,490 MXN/año; precio administrable |
| Profesional | 499 MXN/mes o 4,990 MXN/año; precio administrable |
| Cambio de precio en Admin | Nuevo mapping para futuras contrataciones; los contratos anteriores conservan su precio |
| Mensual | Activación al confirmar invoice pagada por webhook |
| Anual | Pago anual, créditos incluidos asignados por mes calendario desde el ancla |
| Créditos | Ledger existente; saldo incluido no se acumula; saldo adicional se conserva |
| Upgrade mismo intervalo | Inmediato con prorrateo de Stripe `always_invoice`; el acceso requiere prueba de pago |
| Upgrade con pago incompleto | Conserva el plan anterior pagado; sin activación optimista |
| Créditos tras upgrade | Sin segundo abono en el mismo período; nueva cuota en la siguiente asignación mensual |
| Downgrade o cambio de intervalo | Programado al final del período pagado, sin prorrateo manual |
| Exceso de pacientes | Conserva todos; permite trabajar con existentes; bloquea agregar/reactivar por encima de cuota |
| Cancelación del profesional | Al final del período pagado; puede reanudarse antes del vencimiento |
| Cancelación inmediata administrativa | `CANCELAR AHORA`, motivo de al menos ocho caracteres y auditoría; sin factura ni prorrateo extra |
| Pago de renovación fallido | Gracia inicial de siete días, administrable; uso permitido con aviso |
| Gracia vencida | Consulta disponible; escrituras relevantes suspendidas, incluso antes del siguiente cron |
| Recuperación | Invoice pagada verificada restaura acceso; los datos nunca se borraron |
| Cambios manuales de Admin | Prevalecen; un webhook posterior no anula una suspensión/cortesía administrativa |

Las cancelaciones programadas y los vencimientos de descuentos se conservan al
combinar schedules. Reanudar una suscripción sin cancelación pendiente se rechaza
para no borrar un cambio de plan programado.

## Promociones

Una campaña contiene audiencia, código, beneficios, duración, elegibilidad,
vigencia, visibilidad y límites de uso. Audiencias: estudiantes, universidades,
consultorios, influencers, convenios, campañas y personalizada. La audiencia
sirve para atribución; no concede permisos por sí misma.

| Beneficio | Implementación |
|---|---|
| Porcentaje | Coupon sobre el precio contratado |
| Descuento fijo | Coupon por importe en MXN |
| Precio personalizado | Diferencia respecto al precio normal contratado; mapping por precio y versión |
| Período gratis | Coupon de 100%; admite combinar créditos u otros beneficios |
| Créditos iniciales | Una entrada idempotente en el ledger adicional tras Checkout confirmado |
| Entitlement temporal | Override con inicio, fin y referencia a la redención |
| Upgrade promocional | Grant al plan de destino, con retorno al plan base al vencer |

Puede combinarse un beneficio financiero con créditos y beneficios de acceso.
Las duraciones son una factura, meses, hasta fecha o indefinida según el tipo.
Los créditos iniciales son un beneficio único. Los descuentos mensuales sobre
planes anuales afectan las facturas emitidas dentro de esa ventana. Para evitar
confundir meses gratuitos con un año completo, `free_period` por meses/hasta fecha
requiere intervalo mensual; en anual se puede regalar una factura completa.

Al vencer el descuento se aplica el precio normal contratado. Los grants y
overrides vencidos vuelven a los valores del plan base. Cambiar o desactivar una
campaña no modifica los beneficios ya concedidos: cada Checkout conserva su
snapshot y versión.

Los límites total y por profesional consideran reservas de Checkout y se
protegen con locks; dos clientes no pueden obtener el último uso. La vigencia,
plan, intervalo y condición de cliente nuevo se comprueban en servidor. Una
reserva incierta no se libera mientras Stripe aún pueda completar la sesión.

### Ejemplos disponibles sin lógica especial por código

| Código | Configuración |
|---|---|
| UAZ2026 | Universidad, Esencial mensual a 249 MXN por 12 meses, 20 créditos iniciales, 100 usos, luego precio normal |
| NUTRIMARIA | Influencer, Profesional mensual, 20% durante tres meses, 50 usos |
| CONSULTORIOABC | Consultorio, Profesional mensual a 399 MXN durante seis meses, 20 usos |
| ESTUDIANTE50 | Estudiante, Esencial mensual, 50% durante seis meses, solo clientes nuevos |

No se crean campañas reales al aplicar la migración. Estos ejemplos se usan en
fixtures y pruebas. El administrador puede crearlos desde la interfaz.

## Pantallas

- `/planes`: selección mensual/anual y Checkout. Login, registro y onboarding
  conservan la selección con destino interno validado y caducidad de 24 horas.
- `/app/my-plan`: suscripción, precio contratado, beneficios, créditos, renovación,
  cancelación, cambio de plan, portal e historial. Accesible durante suspensión.
- `/admin/promotions`: listado, creación progresiva, edición, desactivación,
  redenciones, suscripciones atribuidas y mappings.
- `/admin/subscriptions`: estado, profesional, plan, próximo período, último pago
  y cancelación administrativa.
- `/admin/payments`: historial con importe, moneda, estado y plan histórico.
- `/admin/billing`: gracia, habilitación Test, cuentas autorizadas y sincronización
  de los cuatro precios públicos actuales.

El Customer Portal permite método de pago, facturas e información de billing.
Los cambios y cancelaciones se gestionan en Nuthrick para conservar sus políticas.

## Verificaciones realizadas

| Verificación | Resultado |
|---|---|
| Frontend | 763 pruebas, 92 archivos, aprobadas |
| Billing, webhook y adaptador Stripe | 29 pruebas aprobadas, sin permiso de red |
| IA existente | 108 pruebas aprobadas; dos pruebas HTTP adicionales aprobadas con 19 pasos y red limitada a loopback |
| Agenda | Seis pruebas aprobadas |
| Backend Python | Una prueba aprobada |
| SQL ADMIN-1/comercial | Resolver, cuotas, créditos, grants, suspensión, concurrencia y permisos PostgREST aprobados |
| SQL ADMIN-2 | Migración sobre clon local; activación, estados, beneficios, secretos restringidos, créditos y facturas aprobados |
| Concurrencia ADMIN-2 | Ocho reintentos del mismo evento procesan una vez; ocho jobs mensuales asignan una vez; último uso de campaña reservado por un solo profesional |
| Cambio de plan SQL | Pago incompleto conserva Esencial; pago confirmado activa Profesional; downgrade conserva 60  pacientes y permite editar existentes |
| TypeScript | Aprobado |
| Deno check y lint | Aprobados |
| ESLint | Cero errores; un warning previo de `SecondShiftVisual` en LandingPage |
| Build | Aprobado en preset habitual y preset Vercel |
| SSR Vercel aislado | Once rutas responden 200 sin depender de node_modules del repositorio, incluidas las nuevas de billing |
| Revisión visual | Formularios/listados y Mi plan en escritorio y móvil; fixtures locales |
| Security Advisors remoto | 35 antes y 35 después: cero regresiones; 23 INFO y 12 WARN preexistentes |
| Stripe Test real | Cuatro Hosted Checkouts pagados: Esencial 349/3490 y Profesional 499/4990 MXN; anual asigna solo 10/50 créditos iniciales |
| Promociones Stripe Test | UAZ249+20 créditos; influencer399.20, consultorio399 y estudiante174.50 MXN; mapping y atribución únicos |
| Operaciones Stripe Test | Upgrade con invoice prorrateada149.97 MXN, downgrade al vencimiento, cancelar/reanudar y portal con facturas |
| Fallos y recuperación Stripe Test | Test Clocks y método rechazado: gracia/suspensión; ambos vuelven a activo tras pagar |
| Fallback Stripe Test | UAZ: doce invoices de 249 MXN y la decimotercera de 349 MXN; 20 créditos una vez y una atribución |
| Vencimiento por fecha | Descuento termina y vuelve a 349 MXN; renovaciones posteriores no recrean el schedule |
| Auth remoto y permisos | Inicio de sesión real; RPC propias disponibles; servidor, secretos y Admin denegados al profesional; webhook sin firma rechazado |
| Conservación de datos | Conteos y digests idénticos: 13  pacientes, 22  consultas, 9  planes nutricionales y dos perfiles existentes |

Comandos de reproducción desde la raíz:

```sh
node scripts/test-admin.mjs
node scripts/test-billing.mjs
deno test --config supabase/functions/billing/deno.json supabase/functions/billing
deno check --config supabase/functions/billing/deno.json supabase/functions/billing/index.ts
deno lint --config supabase/functions/billing/deno.json supabase/functions/billing
```

En `frontend`: `npm test`, `npm run typecheck`, `npm run lint`,
`NITRO_PRESET=vercel npm run build`. En `backend`: `uv run pytest`.
El script SQL de billing crea y elimina exclusivamente un clon desechable en
`supabase_db_Nuthrick`; no se conecta al proyecto remoto.

## Configuración de la entrega

- Cuenta propia verificada: Sandbox `acct_1UJP0ZDdgZFOxyxH`.
- Migración remota `20260925032712_billing_subscriptions_promotions.sql`.
- Edge Function `billing`, versión 1, autentica profesionales mediante Auth y
  verifica los eventos Stripe con su firma sobre el body original.
- Webhook Test `we_1UJPnpDdgZFOxyxH2Bbn3DoA`, 15 eventos, API `2026-08-26.dahlia`.
- Cuatro precios remotos asociados a los UUID de los planes publicados.
- Billing habilitado en Test, con lista explícita de profesionales autorizados.
  Solo se agregó la cuenta ficticia **Prueba ADMIN-2 · Stripe TEST**, sin datos
  clínicos. José conserva Full Access y sigue siendo el único administrador.
- UI de promociones y configuración disponible para el administrador. No se
  crean campañas públicas ni se aplican descuentos a cuentas existentes.
- Un solo push de la entrega a `main`; Vercel ejecuta el despliegue automático
  correspondiente. La referencia exacta del commit y su URL se entregan en el
  mensaje final, evitando un segundo despliegue por CLI.

### Secretos del servidor

Primera opción: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y
`STRIPE_ACCOUNT_ID` completos en Edge Function Secrets. El endpoint es
`https://qlsqhvyrslclmlstlemn.supabase.co/functions/v1/billing/webhook`.
`BILLING_SITE_URL` es `https://nuthrick.vercel.app` por defecto.
No hace falta una publishable key de Stripe para Hosted Checkout.

Si no se dispone de la CLI autenticada, existe una alternativa implementada:
un único JSON cifrado en Supabase Vault, llamado `nuthrick_billing_stripe_test`,
con `mode`, `secret_key`, `webhook_secret` y `account_id`. La RPC de nombre fijo
solo puede invocarla `service_role`, valida Test y nunca se expone en Admin.
La función cachea el provider validado por instancia. Una configuración de
variables de entorno parcial falla cerrada; no mezcla dos fuentes de secretos.
**La opción Vault está configurada**; se verificó que un profesional común no
puede invocar la RPC de credenciales. No hay claves Stripe en el frontend.

### Seguimiento operativo

Los eventos fallidos conservan `attempts` y un `last_error` seguro. Una vez
corregida la causa se reenvía el evento desde Stripe; la clave única permite
reintentar sin duplicar acceso, invoice ni ledger. Revisar el job
`nuthrick-billing-monthly-and-grace` y el estado de las sesiones pendientes.

Una intervención administrativa marca `manual_hold`: debe revisarse antes de
devolver la cuenta a sincronización automática. No se habilita automáticamente
por una invoice posterior. La versión inicial no ofrece un botón específico
para quitar ese hold.

## Matriz de los 44 puntos de entrega solicitados

| # | Punto | Estado |
|---|---|---|
| 1 | BillingProvider | Implementado y probado localmente |
| 2 | Stripe Test integration | Conexión verificada a Sandbox propio de Nuthrick |
| 3 | Checkout | Cuatro flujos Hosted Checkout pagados en Test |
| 4 | Customer | UUID estable y creación idempotente |
| 5 | Subscription | Modelo local y estados implementados |
| 6 | Price mappings | Cuatro combinaciones configurables, sincronización administrativa |
| 7 | Webhooks | Endpoint remoto activo, 15 eventos firmados |
| 8 | Signature validation | Body original, firma y timestamp probados |
| 9 | Idempotency | Eventos, operaciones, invoices, campañas y ledger probados |
| 10 | Mensual | Hosted Checkout real Test aprobado |
| 11 | Anual | Hosted Checkout real Test aprobado |
| 12 | Credits allocations | Mensuales e idempotentes; no entrega anual anticipada |
| 13 | Upgrade | Prorrateo Stripe y acceso condicionado a pago |
| 14 | Downgrade | Fin de período; prueba con 60  pacientes aprobada |
| 15 | Cancelación | Al vencimiento o inmediata administrativa |
| 16 | Grace | Siete días administrables |
| 17 | Recuperación | Probada con pagos Test y webhook firmado |
| 18 | Suspensión | Lectura clínica conservada |
| 19 | Customer Portal | Verificado con método de prueba e historial de invoices |
| 20 | Modelo de promociones | Campañas, condiciones, snapshots y redenciones |
| 21 | Beneficios soportados | Siete tipos implementados |
| 22 | Códigos universidad | UAZ2026 probado en Stripe Test y SQL |
| 23 | Estudiantes | Audiencia y regla de nuevos clientes |
| 24 | Consultorios | Precio y duración configurables |
| 25 | Influencers | Porcentaje y atribución, sin comisiones |
| 26 | Attribution | Campaña, profesional, audiencia y suscripción |
| 27 | Provider mapping | Coupon por versión y precio; IDs idempotentes |
| 28 | Admin promociones | Implementado y revisado localmente |
| 29 | Admin suscripciones | Implementado |
| 30 | Admin pagos | Implementado con plan histórico |
| 31 | Auditoría | Reutiliza infraestructura ADMIN-1 |
| 32 | RLS | Permisos remotos verificados; cero regresiones de Advisors |
| 33 | Migraciones | Aplicada y verificada localmente y en el proyecto autorizado |
| 34 | Tests | Suites y flujos Stripe Test reales aprobados; evidencia arriba |
| 35 | TypeScript | Aprobado |
| 36 | ESLint | Cero errores, un warning preexistente |
| 37 | Build | Aprobado, incluido SSR aislado de Vercel |
| 38 | Commit | Commit exclusivo de ADMIN-2; referencia en mensaje de entrega |
| 39 | Vercel | Despliegue automático del commit de esta entrega, una sola publicación |
| 40 | Confirmación TEST MODE | Código y credenciales restringidos a Sandbox Test |
| 41 | Cero cobros reales | Confirmado |
| 42 | OPENAI CALLS = 0 | Confirmado |
| 43 | Qué falta para Live | Cuenta comercial verificada, decisión explícita de activar cobros, secretos/mappings Live separados, operación y pruebas de producción; fuera del alcance actual |
| 44 | ADMIN-3 | Posibles extensiones: conciliación y salud de webhooks en Admin, devoluciones, reanexar sincronización tras hold, Mercado Pago; CFDI/SAT y comisiones requieren alcance propio |

## Observaciones preexistentes de seguridad

Se conservaron las 35 observaciones anteriores; ADMIN-2 no añade hallazgos.
Las remediaciones de los avisos previos están documentadas por Supabase:
[funciones SECURITY DEFINER expuestas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[tablas privadas sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) y
[protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Documentación oficial consultada

- [Webhooks de suscripciones](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Cambiar precios y prorrateo](https://docs.stripe.com/billing/subscriptions/change-price)
- [Actualización de suscripciones](https://docs.stripe.com/api/subscriptions/update)
- [Schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules)
- [Cupones y duración](https://docs.stripe.com/billing/subscriptions/coupons)
- [Verificación de firma](https://docs.stripe.com/webhooks/signature)

SDK fijado a Stripe `22.6.2`, API `2026-08-26.dahlia`; Supabase JS `2.112.4`.

Los Test Clocks siguen la [documentación oficial](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage); los rechazos usan `pm_card_chargeCustomerFail`, sin tarjetas reales.
