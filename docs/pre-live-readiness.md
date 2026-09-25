# Nuthrick · PRE-LIVE / Beta comercial

Fecha de revisión: 24 de septiembre de 2026  
Entorno revisado: Nuthrick en Vercel + Supabase `qlsqhvyrslclmlstlemn` + Stripe Sandbox de Nuthrick.  
Estado: **Stripe TEST solamente, OpenAI deshabilitado, cobros reales = 0**.

## Qué quedó preparado

PRE-LIVE agrega una vista administrativa de solo lectura en [`/admin/readiness`](https://nuthrick.vercel.app/admin/readiness). La vista consulta `pre_live_readiness()` y muestra estado, evidencia y pendientes sin exponer claves, cuentas de Stripe, tokens ni secretos de webhook.

La arquitectura conserva una separación explícita:

- `private.billing_settings.mode`, `billing_price_mappings.mode` y `ai_credit_price_mappings.mode` permanecen en `test`.
- Las credenciales se leen únicamente desde Vault por el gateway server-side. PRE-LIVE solo devuelve si la configuración Test es válida.
- Los productos y precios Live deberán ser nuevos mappings; no se pueden reutilizar IDs Test.
- No se añadió `STRIPE_LIVE_SECRET_KEY`, no se cambiaron credenciales Live y no se activó OpenAI.

La migración es [`20260925120000_pre_live_readiness.sql`](../supabase/migrations/20260925120000_pre_live_readiness.sql) y la corrección compatible con el JSON histórico de Vault es [`20260925121000_pre_live_readiness_credentials.sql`](../supabase/migrations/20260925121000_pre_live_readiness_credentials.sql).

## Recorrido comercial auditado

Las suites existentes de ADMIN-1/2/3 cubren el recorrido con identidades sintéticas y proveedores simulados:

1. Registro sintético crea una cuenta sin acceso implícito.
2. Onboarding guarda solo nombre, título, país y zona horaria. Ahora admite un código opcional, por ejemplo `BETA5`, y lo canjea server-side al completar el perfil.
3. Sin código, la cuenta llega a su espacio sin plan y puede consultar `/planes`.
4. Con código Beta, la cuenta obtiene `trial`, fecha de término y cero créditos IA mensuales. La fecha se presenta en Mi plan.
5. La selección de plan conserva modalidad y promoción durante el inicio de sesión. El checkout se crea en Stripe Test y la URL de éxito solo espera el webhook.
6. El webhook firmado activa la suscripción y asigna el primer periodo de créditos. Un pago incompleto no activa acceso.
7. Renovaciones mensuales y anuales asignan un periodo de créditos a la vez. No acumulan meses; los adicionales permanecen.
8. Pago fallido pasa por `grace` y después `suspended`/solo lectura cuando vence la gracia. La cuenta conserva expedientes y conserva una acción para resolver el pago.
9. Cambio de plan no confirmado conserva el acceso pagado. Upgrade confirmado cambia el plan; downgrade queda programado y conserva los datos.
10. Cancelación al vencimiento conserva acceso hasta la fecha pagada y los datos. Cancelación inmediata termina acceso según el evento de Stripe, sin borrar datos.
11. Recarga sigue el flujo de ADMIN-3: saldo → Checkout pago único → “confirmando” → webhook → saldo e historial. Un refund aparece como reembolso, sin mostrar `ledger reversal`.
12. Un downgrade que excede el límite de pacientes marca `over_limit`, conserva todos los pacientes y bloquea solamente nuevas altas hasta regularizar la cuenta.

La prueba SQL comercial existente (`scripts/test-commercial.sql`) verifica precios exactos: Esencial `$349 MXN/mes` y `$3,490 MXN/año`; Profesional `$499 MXN/mes` y `$4,990 MXN/año`. También verifica 30 pacientes, ilimitados, downgrade, sobrelímite, suspensión, gracia, renovación y conservación de datos. `scripts/test-admin.sql` verifica canje, expiración y suspensión de códigos Beta. `scripts/test-billing.sql` verifica checkout, promoción, webhook, renovación, cancelación, resuscripción, recibo, gracia y concurrencia. `scripts/test-credit-purchases.sql` verifica recarga, promoción de créditos, refund, deuda, renovación y aislamiento.

## Beta / BETA5

La función de canje ya es hash-only y server-side. El código no se guarda en claro ni se devuelve a administración. Para una prueba BETA5:

1. Crear o reutilizar un código Beta activo con 90 días, máximo de usos controlado y `initial_ai_credits = 0`.
2. Registrar una cuenta sintética y completar `/onboarding` con `BETA5`.
3. Confirmar `status=trial`, `ends_at` aproximadamente 90 días adelante y `ai.monthly_credits=0`.
4. Simular expiración actualizando la vigencia en el fixture; confirmar que la cuenta ve “Tu acceso de prueba termina…” antes del vencimiento y “Selecciona un plan para continuar” al terminar.
5. Confirmar que no se crea una suscripción ni un cobro automático.

El código no sustituye un plan comercial activo y no puede canjearse sobre una cuenta con acceso vigente. Estas reglas evitan que una promoción interna reemplace una suscripción pagada.

## Estados visibles

| Estado | Qué significa para el profesional | Acción mostrada |
| --- | --- | --- |
| Activa | El plan está pagado y operativo. | Administrar pago, facturas y cambio de plan. |
| En prueba | Beta/cortesía con fecha de término. | Ver fecha y elegir un plan. |
| Período de gracia | El último intento de renovación requiere atención. | Actualizar método de pago desde Stripe. |
| Suspendida | El periodo pagado y la gracia terminaron. | Consultar expedientes y resolver pago; no escribir/generar IA. |
| Sobre el límite | Hay más pacientes activos que el plan actual. | Conservar datos, archivar o revisar planes; no borrar automáticamente. |
| Cancelada | La suscripción terminó. | Datos conservados y enlace para elegir un plan. |
| Sin acceso / vencida | No hay un acceso vigente. | Elegir un plan o contactar a administración si corresponde. |

Los códigos internos no se muestran en estas superficies. Las acciones server-side siguen siendo la autoridad, incluso si se manipula la interfaz.

## Promociones y recibos

La validación cubre universidad, influencer, consultorio y campañas, además de código inexistente, vencido, agotado, modalidad incorrecta, plan no elegible, cliente existente y repetición por profesional. La redención conserva audiencia, campaña y snapshot de beneficios.

La página de pagos enlaza únicamente URLs HTTPS de `invoice.stripe.com` verificadas por dominio. Stripe aloja los recibos/invoices cuando el proveedor los devuelve. CFDI no está implementado y queda fuera de PRE-LIVE.

## Emails, soporte y políticas

PRE-LIVE ya incluye un outbox transaccional en proveedor `test`, quince plantillas, claves de evento idempotentes, reintentos y estados de fallo visibles en `/admin/operations`. La prueba sintética se entregó dentro de TEST; no se añadieron campañas de marketing ni correos reales. El proveedor productivo, dominio y buzón de envío siguen pendientes para Live.

`/terms`, `/privacy` y `/refunds` ahora tienen un lugar visible para el contenido final, pero siguen marcados como **Documento preliminar**. No se inventaron términos legales. Antes de Live deben aprobarse términos, privacidad, reembolsos, impuestos, soporte, canal de contacto y tiempos de respuesta.

## Evidencia de readiness actual

La lectura remota autenticada de PRE-LIVE devuelve **15 controles: 14 listos, 1 pendiente y 0 bloqueados**. Entre los listos están Stripe Test, credenciales Test en Vault, webhook firmado, mappings Test, planes comerciales, paquetes Test, campañas privadas TEST, Beta, OpenAI apagado, recibos, jobs, emails sintéticos, soporte y evidencia de pagos Test. El único pendiente es la aprobación humana/legal de términos, privacidad y reembolsos.

La vista no considera “listo” un control manual solo por existencia de una tabla. Los pendientes requieren una decisión o una verificación humana antes de habilitar Live.

## Checklist exacto antes de Live

### Stripe y proveedor

- [ ] Cuenta Nuthrick verificada y datos comerciales/fiscales completos.
- [ ] Productos Live creados por separado de los Test.
- [ ] Prices Live creados para Esencial mensual/anual y Profesional mensual/anual.
- [ ] Paquetes de créditos dejan de ser provisionales y reciben precios aprobados.
- [ ] Mappings Live creados; ningún `price_` Test reutilizado.
- [ ] Webhook Live separado, con signing secret Live en Vault y eventos mínimos revisados.
- [ ] Customer Portal Live habilitado y probado.
- [ ] Una prueba de cobro real autorizada, con importe y responsable explícitos.

### Producto y operación

- [ ] Aprobar precios, impuestos, moneda, ciclos y fecha de renovación.
- [ ] Aprobar términos, privacidad y política de reembolsos.
- [ ] Definir soporte, contacto, SLA y proceso de disputa/chargeback.
- [ ] Elegir proveedor y plantillas de emails transaccionales.
- [ ] Confirmar expiración Beta y mensajes de conversión a plan.
- [ ] Confirmar comportamiento y comunicación de grace, suspensión y over-limit.
- [ ] Configurar monitoring de webhooks, pagos, refunds y renovaciones.
- [ ] Confirmar backup/restore y responsable de incidentes.
- [ ] Ejecutar nuevamente el E2E con datos sintéticos en Test después de todas las decisiones.
- [ ] Revisar advisors de Supabase y registrar cero regresiones nuevas.

### Activación explícita

- [ ] Aprobación humana de precios y políticas.
- [ ] Cargar credenciales Live en un secreto separado de Test.
- [ ] Aplicar mappings y webhook Live.
- [ ] Cambiar el modo mediante una migración/operación auditada y reversible.
- [ ] Verificar que OpenAI continúa apagado, salvo decisión independiente.
- [ ] Autorizar el primer cobro real y abrir soporte operativo.

PRE-LIVE termina aquí. No se activan cobros reales ni OpenAI hasta completar esta lista y recibir autorización explícita para una fase LIVE separada.
