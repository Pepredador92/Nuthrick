# Nuthrick · Runbook operativo PRE-LIVE

Fecha: 24 de septiembre de 2026  
Entorno: Supabase `qlsqhvyrslclmlstlemn`, Stripe TEST, OpenAI deshabilitado.

Este runbook atiende incidentes de pagos y operación comercial. Se trabaja con el panel privado `/admin/operations`, con acciones auditadas y con datos comerciales mínimos. No se abren expedientes clínicos desde estas tareas y no se habilita un cobro manual.

## Regla de trabajo

1. Revisar primero el estado visible en `/admin/operations`.
2. Conservar el identificador del evento, payment, subscription, purchase o caso.
3. Repetir únicamente una acción idempotente del panel o del proveedor TEST.
4. Esperar el webhook firmado antes de conceder acceso, plan o créditos.
5. Registrar la resolución y el motivo. Nunca marcar “pagado” editando tablas directamente.

## Casos

### A. El pago no aparece

- Revisar Webhooks: pendientes, errores y último evento recibido.
- Revisar `payments` y `subscriptions` por el identificador de la sesión, invoice o subscription.
- Si Stripe TEST no envió un evento, repetir el evento de prueba en Stripe y dejar que el worker lo procese.
- No conceder acceso ni créditos por una captura de pantalla o correo del usuario.

### B. Webhook fallido

- Copiar `event_type`, intentos y último error del panel.
- Corregir la configuración TEST o repetir el evento firmado; el worker es idempotente por `provider_event_id`.
- Si el pago existe pero el estado local no coincide, usar la revisión de suscripción auditada (`reconcile_subscription`) para comparar; `remote_provider_fetch` permanece desactivado en PRE-LIVE.
- No marcar la suscripción como activa manualmente.

### C. El cambio de plan no se refleja

- Revisar la subscription, la última payment y cualquier `pending_plan_id`.
- Confirmar si el cambio está programado para el siguiente periodo o espera un webhook de pago.
- Ejecutar una revisión auditada y volver a procesar el evento TEST si procede.
- Mantener el acceso anterior hasta recibir el evento verificado; no tocar datos clínicos.

### D. Los créditos comprados no aparecen

- Revisar la compra, el ledger, el estado del pago y el refund/debt.
- Confirmar que el `purchase_id` y el `provider_event_id` sean únicos antes de reintentar.
- Repetir el webhook TEST si el pago está confirmado pero el grant no se materializó.
- No insertar un grant duplicado ni ajustar el saldo sin una ruta administrativa existente y auditada.

### E. Se solicita un reembolso

- Revisar payment, purchase y refund en Stripe TEST y en el historial local.
- Si el proveedor confirma el refund, procesar el webhook correspondiente y comprobar que el ledger conserve trazabilidad.
- La reversa no se hace borrando movimientos ni editando el saldo a mano.
- Informar el resultado por el canal de soporte; CFDI e impuestos se mantienen fuera de PRE-LIVE.

### F. Disputa o chargeback

- Mantener el caso en revisión y conservar el identificador del proveedor.
- No retirar datos ni convertir el caso en refund sin resolución del proveedor.
- Escalar a soporte operativo y registrar el responsable, evidencia y siguiente fecha de revisión.

### G. Beta próxima a vencer

- El job de billing ejecuta el ciclo de Beta y encola el mensaje idempotente `beta_expiring` o `beta_expired`.
- Verificar el outbox y el estado TEST del correo; no se envía a un proveedor real.
- No convertir Beta en suscripción ni cobrar automáticamente.

### H. Cuenta suspendida

- Confirmar fin del periodo pagado y de la gracia.
- Conservar expedientes y datos; el estado suspendido restringe escritura según las reglas existentes.
- Mostrar la ruta de recuperación de pago. Un pago recuperado debe llegar por webhook y dejar auditoría.
- Nunca borrar la cuenta para resolver un problema de billing.

### I. Promoción no aplica

- Revisar código, vigencia, audiencia, plan, modalidad, límite y si ya fue reservado/redimido por el profesional.
- Comprobar el fallback comercial de la campaña en Admin; todas las campañas PRE-LIVE son privadas y TEST.
- Si una campaña necesita pausa, desactivarla desde el editor de promociones y registrar el motivo.
- No crear una segunda lógica de descuentos ni alterar snapshots históricos.

### J. Stripe no disponible

- Mantener el checkout como pendiente y mostrar al usuario que debe esperar confirmación.
- No conceder acceso por ausencia de error ni por un estado visual del navegador.
- Cuando el proveedor se recupere, procesar eventos firmados y revisar pendientes/errores en Operaciones.
- Resolver el caso desde el panel con una nota auditada.

## Frecuencia y escalamiento

- `nuthrick-billing-monthly-and-grace`: cada 15 minutos.
- `nuthrick-transactional-email-outbox`: cada 5 minutos.
- `nuthrick-agenda-worker`: cada minuto.
- Revisar el panel al detectar un error y al menos una vez antes de cualquier decisión de Live.
- El canal configurado es `soporte@nuthrick.com`, objetivo 48 horas, todavía en modo TEST. Debe verificarse y sustituirse por el buzón operativo definitivo antes de Live.

