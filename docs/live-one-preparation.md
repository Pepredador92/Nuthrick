# LIVE-1 — preparación controlada

Fecha de auditoría: 25 de septiembre de 2026. Esta entrega prepara el aislamiento y los controles. **No autoriza credenciales Live ni transacciones reales.**

## Punto de detención

Readiness general consultado en la base de producción: **14 listos, 1 pendiente, 0 bloqueados**. Los 15 controles proceden de consultas al estado real. La interfaz muestra el conteo real de pagos Live; no presupone cero.

| Documento | Versión | Fecha efectiva | Estado | Aprobación |
|---|---:|---|---|---|
| Términos | 1 | Sin establecer | `pending_review` | Pendiente de revisión humana |
| Privacidad | 1 | Sin establecer | `pending_review` | Pendiente de revisión humana |
| Reembolsos | 1 | Sin establecer | `pending_review` | Pendiente de revisión humana |

No se cambió ningún estado legal. Un administrador autorizado debe registrar la aprobación y fecha efectiva después de revisión humana. Mientras tanto, el servidor rechaza operaciones Live antes de recuperar credenciales.

## Reporte previo al cobro — todavía no autorizado

| # | Control | Resultado de esta preparación |
|---:|---|---|
| 1 | Legal | Los tres documentos v1 siguen pendientes; sin fecha efectiva. |
| 2 | Readiness | General 14/1/0. Los controles Live adicionales se muestran aparte y exigen evidencia propia. |
| 3 | Cuenta Stripe | Sandbox Nuthrick TEST verificado: `acct_1UJP0ZDdgZFOxyxH`. Cuenta Live pendiente de identificación y verificación; no se asume que tenga el mismo ID. No se usó Avena.io. |
| 4 | Entorno Live | Preparación y checkout deshabilitados en configuración; lista de pilotos vacía. Sin credenciales Live introducidas. |
| 5 | Productos Live | No creados. La sincronización preparada genera productos independientes después de superar Legal y configurar la cuenta. |
| 6 | Precios Live | No creados. Admin conserva Esencial $349/mes y $3,490/año; Profesional $499/mes y $4,990/año, MXN. Se releerá Admin antes de sincronizar. |
| 7 | Webhook Live | Ruta preparada `/functions/v1/billing/webhook/live`. Endpoint Stripe y firma real pendientes. TEST conserva `/functions/v1/billing/webhook`. |
| 8 | Customer Portal Live | Pendiente. Se requiere configuración Live revisada; datos de facturación, método de pago, facturas y cancelación al cierre del período. Cambios de plan deshabilitados en Portal. |
| 9 | Monitoring | Jobs existentes conservados; aislamiento por entorno y soporte de discrepancias de conciliación añadidos. No se creó un segundo job comercial. |
| 10 | Emails | TEST simula entregas. Live tiene cola separada y **no** se marca enviado por el worker TEST. Falta implementar/configurar proveedor real y comprobar entrega; es requisito previo al cobro. |
| 11 | Aislamiento | Claves/Vault, webhooks, IDs, mappings, clientes, suscripciones, promociones, sesiones, operaciones, auditoría y correo identifican el entorno. Restricciones SQL y validaciones `livemode` impiden mezclas. |
| 12 | Pruebas | 49 pruebas Deno; 19 pruebas React focales; regresión SQL ADMIN-2/ADMIN-3, ciclo mensual/anual Live simulado, concurrencia, TypeScript, ESLint y build. Ver comandos abajo. |
| 13 | Security Advisors | Verificado después de aplicar la migración: cero hallazgos nuevos de seguridad. Se conservan: 23 avisos INFO RLS privado, 12 avisos WARN de RPC existentes y 1 WARN de protección de contraseñas filtradas deshabilitada. |
| 14 | Git | Cambios aislados en `codex/live-one-preparation`; commit exacto indicado en la entrega. No se incluyen cambios ajenos de Ajustes o módulos clínicos. |
| 15 | Vercel | Preparación publicada en el proyecto `nuthrick`; [deployment del backend compatible e45bf62](https://vercel.com/pepredador92/nuthrick/Foy9pe2ej4RowuHetntxmURayUAD) confirmado Ready/Production. Publicar este código no habilita Live. |
| 16 | Cuenta piloto | Pendiente de selección explícita. No se agregó ninguna cuenta. Debe ser un profesional controlado por el administrador y sin acceso interno protegido. |
| 17 | Plan piloto | Pendiente. La primera prueba será una suscripción, nunca una recarga IA. |
| 18 | Importe | Pendiente de plan/intervalo; se informará el importe exacto MXN y cualquier promoción antes de solicitar autorización. No se crean precios de $1. |
| 19 | Cobros reales | **0 realizados por esta fase.** Sin pagos Live registrados en la auditoría. |
| 20 | OpenAI | **0 llamadas.** Las funciones IA reales permanecen deshabilitadas. |

## Controles implementados

- La identidad del entorno se decide en el servidor. Solo el administrador puede solicitar explícitamente `sync_prices` o `inspect_live` para Live; los demás usuarios no pueden cambiar de entorno con el cuerpo de una petición.
- La misma cuenta profesional puede tener clientes TEST y LIVE diferentes. Las claves foráneas compuestas impiden relacionar precios, campañas, clientes y suscripciones de entornos distintos. Los IDs de Stripe no se reutilizan entre entornos.
- El SDK comprueba prefijos de clave, cuenta esperada y `livemode` de los objetos antes de mutaciones. La cuenta Live además exige cobros/payouts habilitados, perfil comercial, México/MXN, descriptor y datos requeridos completos.
- `inspect_live` es una inspección administrativa sin cobro: lee productos/precios, configuración del webhook/Portal y compara ID, cliente, precio, estado y cancelación de las suscripciones remotas/locales. Guarda evidencia y discrepancias comerciales, sin tarjetas ni datos clínicos.
- La configuración del endpoint habilitado se combina con recepción de un evento Live cuya firma pasó la verificación. Encontrar un endpoint en Stripe no se presenta por sí solo como prueba de entrega.
- La verificación de cuenta, catálogo, endpoint, Portal y conciliación caduca a las 24 horas. Cambiar cuenta o Portal invalida su evidencia; cambiar precios en Admin exige mappings verificados actuales.
- Repetir webhooks conserva la idempotencia de pago, acceso, créditos, auditoría y correo. Un evento TEST no modifica acceso perteneciente a una suscripción LIVE.
- Créditos mensuales, gracia y suspensión conservan un único job. BETA5 permanece disponible sin tarjeta. No se migran usuarios Beta a pagos.
- `/admin/operations` muestra TEST/LIVE por separado: pagos, webhooks, emails, operaciones sin resolver y discrepancias de suscripción con identificadores comerciales.
- ADMIN-3 y sus precios provisionales permanecen TEST. Las promociones TEST no se copian a Live.

## Evidencia TEST conservada

Producción contiene 2 registros de cliente TEST (uno con ID de Stripe y otro sin cliente remoto), 1 suscripción TEST, 1 pago TEST, 1 compra de créditos TEST y 8 webhooks procesados. La cuenta sintética ya está identificada como **Prueba ADMIN-2 · Stripe TEST** (`admin2-test@example.test`). Las cinco campañas son privadas y plantillas TEST. No se borraron eventos ni se modificaron cuentas reales o expedientes clínicos.

La regresión local cubre Checkout/customer, mensual/anual, promociones, firmas, replay, cancelación, gracia, suspensión, recuperación, recargas, refunds/disputas y Portal. Esto es evidencia de código y SQL con fixtures; **no sustituye verificar Stripe Live real después de Legal**.

## Configuración segura futura — no ejecutar todavía

Primero: aprobación humana de los tres documentos, fechas efectivas y readiness general **15/0/0**. Después se podrá identificar exclusivamente la cuenta Live de Nuthrick, mantener checkout cerrado y preparar credenciales. El procedimiento se detiene hasta que el administrador confirme que las configuró en el sistema seguro.

Esta integración usa **Supabase Vault**, no variables públicas de Vercel:

| Nombre exacto | Runtime / ubicación | Verificación sin revelar valores |
|---|---|---|
| `nuthrick_billing_stripe_test` | Secreto Vault existente; Edge Function `billing`, entorno TEST | Readiness TEST; no sustituirlo. |
| `nuthrick_billing_stripe_live` | Nuevo secreto JSON en Supabase Dashboard → proyecto Nuthrick → Vault → Secrets; lo leerá únicamente `billing` mediante RPC restringida a `service_role` | `credentials_present` en readiness comprueba existencia; `inspect_live` valida identidad y configuración. Nunca imprimir el JSON. |
| `secret_key` | Campo del JSON Live; clave secreta de la cuenta Nuthrick Live | El servidor exige prefijo Live y valida la cuenta; nunca frontend. |
| `webhook_secret` | Campo del JSON Live; secreto de firma del endpoint Live de Nuthrick | Recepción de evento firmado en la ruta Live; no se muestra el secreto. |
| `mode` y `account_id` | Campos del mismo JSON; `mode` debe ser `live`; cuenta debe coincidir con configuración privada aprobada | Readiness y verificación remota de cuenta. |
| `publishable_key` | Campo opcional del JSON Live; validado si se proporciona | Checkout/Portal alojados en Stripe usan redirección: esta aplicación no necesita ni consume una clave publicable en React. No crear una variable frontend innecesaria. |

Los nombres heredados `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y `STRIPE_ACCOUNT_ID`, si existen como Edge secrets, quedan reservados a TEST. **No poner valores Live en esas variables.** `SUPABASE_SERVICE_ROLE_KEY` sigue siendo solo servidor. Ningún secreto se pega en chat, SQL, documentación, Git o logs.

Después de confirmada la configuración segura:

1. Verificar cuenta Live, perfil, payouts, MXN, país, descriptor y requisitos pendientes sin modificar datos comerciales sensibles automáticamente.
2. Sincronizar los cuatro precios vigentes de Admin con `sync_prices` solicitando Live. Aprobar por separado cualquier promoción de lanzamiento. No publicar recargas IA.
3. Revisar/configurar Portal y webhook Live de la misma cuenta; registrar sus IDs en configuración privada. Recibir un evento firmado sin pago para comprobar transporte y firma.
4. Implementar/configurar entrega real de emails y probar destinatario/remitente; no usar el resultado sintético TEST como evidencia real.
5. Ejecutar `inspect_live`, revisar `/admin/operations` y controles Live, seleccionar explícitamente cuenta/plan/intervalo/importe piloto. La lista no se abre al público.
6. Preparar Checkout sin confirmar compra y repetir el reporte de 20 puntos. **Esperar confirmación textual del importe exacto antes del primer cargo.**
7. Tras un cobro autorizado, verificar una suscripción, un pago, acceso, plan, intervalo, renovación, auditoría, correo y recibo. Detenerse de nuevo; cancelar o reembolsar requiere otra autorización.

## Comprobaciones posteriores al despliegue

- Edge Function `billing` v3 activa. Petición sin sesión: 401; webhook TEST con firma inválida: 400; ruta Live: 409 `live_legal_pending`.
- Readiness remoto conserva 14/1/0 y los tres documentos v1 pendientes. Live: 0 clientes, suscripciones, pagos y emails; credenciales ausentes; preparación/checkout deshabilitados.
- Security Advisors: ningún hallazgo nuevo. [Avisos heredados de RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) y [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) siguen fuera de este cambio. Performance no añadió claves foráneas sin índice; informa un [índice nuevo aún sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) para la lista de pilotos vacía.

## Verificación reproducible

```sh
deno test --config supabase/functions/billing/deno.json supabase/functions/billing
deno check --config supabase/functions/billing/deno.json supabase/functions/billing/index.ts
deno lint supabase/functions/billing
node scripts/test-live-one.mjs
```

`test-live-one.mjs` crea y elimina una base desechable en `supabase_db_Nuthrick`; no usa Stripe/OpenAI, no cambia Legal y no toca producción. Incluye ocho entregas concurrentes de webhook y ocho ejecuciones del job mensual.

Desde `frontend`: `npm run typecheck`, ESLint de los archivos modificados, Vitest de `PreLiveReadinessPage`, `BillingPages` y `CreditsPages`, y `npm run build`.

## Referencias y reversión

Separación de objetos/credenciales: [Stripe API keys](https://docs.stripe.com/keys). Configuración y firma: [Stripe webhooks](https://docs.stripe.com/webhooks). Política de Portal: [Stripe Customer Portal](https://docs.stripe.com/customer-management/configure-portal).

Si una publicación falla, conservar los flags Live cerrados y desplegar una corrección compatible. No eliminar tablas, eventos o mappings como reversión. Cuando existan suscripciones Live, no reinstalar código que asuma únicamente TEST ni bloquear su procesamiento para cerrar nuevas ventas: cerrar checkout es una acción distinta a borrar o cancelar suscripciones.
