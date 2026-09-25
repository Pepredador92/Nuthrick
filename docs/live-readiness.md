# Nuthrick · Informe de preparación LIVE

Fecha de revisión: 24 de septiembre de 2026  
Proyecto Supabase: `qlsqhvyrslclmlstlemn`  
Estado actual: **14 listos · 1 pendiente legal · 0 bloqueados**.

Este informe describe la infraestructura previa a Live. Stripe continúa en TEST, no hay llamadas reales a OpenAI y no se autorizó ningún cargo real.

## 1. Promociones comerciales

El motor de ADMIN-2 es la única fuente de campañas. Hay cinco plantillas privadas TEST (estudiante, universidad, consultorio, influencer y adopción temprana), con vigencia, audiencia, límites, elegibilidad, beneficio, fallback, redención y snapshot auditables. No hay campaña pública activada. Las plantillas son editables desde Admin y no crean un motor paralelo.

## 2. Jobs y schedules

La agenda existente permanece activa. El job de billing mensual/gracia llama a un entrypoint idempotente y el outbox transaccional tiene un job separado cada cinco minutos. Cada ejecución deja `operational_job_runs`, estado, duración, resultado y error. El panel combina el último run del cron con el último run manual TEST.

## 3. Monitoring y webhooks

`/admin/operations` muestra último webhook recibido/procesado, pendientes, errores e intentos. Los eventos siguen siendo deduplicados por el identificador del proveedor. El panel no permite convertir un pago no verificado en acceso.

## 4. Emails transaccionales

Hay 15 plantillas editables en la tabla privada: alta, suscripción activada, pago confirmado/fallido, gracia, suspensión, recuperación, cancelación programada/cerrada, renovación, Beta, compra/reembolso de créditos y promoción aplicada. El proveedor está fijado en `test`, con outbox, `event_key` idempotente, máximo de cinco intentos, reintento visible y fallo visible. La prueba sintética se procesó: 1 enviado en TEST, 0 fallidos, 0 pendientes. No contiene datos clínicos.

## 5. Legal y aceptación

Términos, privacidad y reembolsos están versionados en `private.legal_documents`, con estado, versión, fecha efectiva y referencia de contenido. `record_legal_acceptance` solo acepta una versión aprobada y registra profesional, versión, fuente y fecha. El estado actual es `pending_review` para los tres documentos. Por eso este único control permanece pendiente y no se aprueba automáticamente.

## 6. Soporte operativo

Existe configuración de canal, objetivo de respuesta, casos por categoría y resoluciones auditadas. El canal inicial es `soporte@nuthrick.com`, 48 horas y `test_mode=true`; debe verificarse con el buzón operativo definitivo antes de Live. El runbook está en [`docs/operations-runbook.md`](operations-runbook.md).

## 7. Reconciliación

La acción administrativa `reconcile_subscription` permite revisar la suscripción y entitlements locales en modo TEST y registra auditoría. No consulta ni modifica Stripe Live y devuelve explícitamente `remote_provider_fetch=not_performed`.

## 8. E2E sintético

La suite local cubre checkout, webhook, renovación, gracia, suspensión, cancelación, promociones, créditos, refund, deuda, concurrencia e idempotencia. El fixture operativo añade plantillas, campañas privadas, outbox sintético y verificación de jobs. No se modifican cuentas reales; la limpieza elimina únicamente el esquema de prueba.

## 9. Bugs y controles abiertos

No hay bloqueos técnicos reportados por la lectura remota. El pendiente legal es deliberado. La verificación del buzón de soporte, aprobación comercial, proveedor de email productivo y configuración de Stripe Live siguen siendo decisiones previas a Live.

## 10. Migraciones aplicadas

- `20260925140000_live_ready_operational.sql`
- `20260925141000_live_readiness_operational_checks.sql`
- `20260925141500_operations_job_snapshot.sql`
- `20260925142000_live_ready_rpc_fixes.sql`
- `20260925142500_public_legal_projection.sql`
- `20260925143000_public_legal_projection_table.sql`
- `20260925143500_live_ready_fk_indexes.sql`

Las migraciones crean el outbox, funciones de jobs, evidencia y proyecciones administrativas sin abrir tablas privadas al navegador.

## 11. Advisors

Se revisaron advisors de seguridad y rendimiento después de aplicar las migraciones. No se introdujeron grants públicos nuevos sobre las tablas privadas; las proyecciones públicas usan funciones controladas. Los hallazgos heredados del proyecto deben resolverse en su propio ciclo antes de Live.

## 12. Commit y despliegue

La implementación operativa quedó en el commit `89929a9` de la rama `codex/admin-three` y se publicó mediante el flujo normal del repositorio. Vercel respondió `HTTP 200` en [`/admin/readiness`](https://nuthrick.vercel.app/admin/readiness) después del push; el panel requiere autenticación de administrador. No se ejecutó un deploy manual ni se alteró el proyecto original.

## 13. Estado de proveedor

- Stripe: TEST/Sandbox de Nuthrick.
- Live: deshabilitado.
- OpenAI: deshabilitado.
- Cargos reales: 0.
- Emails reales: 0; proveedor operativo todavía no configurado.

## 14. Lo que falta para una fase LIVE separada

1. Aprobar humanamente términos, privacidad y reembolsos; publicar versiones y registrar la decisión.
2. Confirmar precios, impuestos, moneda, promociones y fallback comercial.
3. Verificar buzón y SLA de soporte.
4. Elegir proveedor transaccional, dominio, plantillas y reputación de envío.
5. Crear productos/precios/webhook/Customer Portal Live separados de TEST y guardar secretos en Vault.
6. Autorizar explícitamente una primera transacción real, con responsable y monto definidos.
7. Ejecutar un E2E posterior a esas decisiones y revisar advisors/monitoring.

Ningún punto de esta lista se ejecuta en PRE-LIVE. La activación de Live, OpenAI o cargos requiere una fase posterior con autorización explícita.
