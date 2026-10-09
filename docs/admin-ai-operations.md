# Control de IA y reserva operativa

Ruta: **Administración → IA y créditos**. La cabecera incluye **Recargas**, con contador de avisos sin leer. Actualización cada minuto mientras la pestaña está visible y al volver a ella. Son notificaciones dentro del panel, sin correo.

## Flujo

El sistema ya confirmaba y acreditaba compras en una misma transacción con unicidad por compra. El historial administrativo no tenía bandeja ni contador de avisos. No hay una bolsa central que se descuente al vender: cada cuenta tiene créditos incluidos/adicionales; el costo del proveedor se registra al generar con IA.

El trigger `notify_ai_purchase` registra cambios Live de pago, asignación, fallo, revisión y reembolso. Reprocesar el mismo estado no duplica avisos. Test se excluye. Se muestran hasta 50, priorizando no leídos. La lectura se guarda por administrador y aviso; marcar visibles permite avanzar a los restantes. Las compras anteriores siguen en el historial y no se anuncian como nuevas.

El panel cuenta pagos confirmados sin asignar y webhooks Live con error pendiente. Compras muestra fecha de asignación separada del estado del pago.

## Reserva

- Usuarios y créditos mensuales: acceso efectivo vigente, con cortesías/overrides, excluyendo solo lectura.
- Obligaciones: incluidos con periodo vigente y adicionales positivos, incluso de cuentas inactivas. Incluyen créditos reservados aún sin consumir.
- Conversión USD/crédito: mayor entre configuración activa OpenAI y costo registrado/créditos cobrados de 30 días.
- Base: mayor entre costo de obligaciones, asignación mensual proporcional al horizonte más adicionales, y gasto reciente proyectado.
- Nuevas recargas: mayor entre venta neta reciente proyectada y mínimo adicional configurado.
- Recomendación: `(base + costo de nuevas recargas + ejecuciones sin costo confirmado) × (1 + margen/100)`.
- Valores iniciales ajustables: 30 días, margen 25%, mínimo adicional 0. Estimación de planeación, sin garantía de consumo o precios.
- Saldo OpenAI: registro manual con fecha del servidor. Se restan costos finalizados después de esa conciliación. Otros usos de la organización, recargas, expiraciones y diferencias de facturación requieren reconciliarlo. Aviso de antigüedad después de 7 días. Sin saldo/conversión se muestra desconocido.

La API oficial Usage/Costs informa consumo y costos; este panel no la presenta como saldo prepago ni solicita una clave administrativa: https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage

La capacidad estimada en créditos Nuthrick divide el saldo conciliado restante entre la conversión conservadora USD/crédito. No crea créditos, no se suma a las carteras y no representa un inventario disponible para venta. El panel muestra el gasto diario promedio de 30 días, sin extrapolar una duración garantizada del saldo.

## Seguridad y verificación

`admin_ai_operations`: wrapper público invoker y función privada con `require_platform_admin()`, `search_path` fijo y tablas privadas sin permisos directos. Sin credenciales, prompts o información de pacientes. Cambios de reserva auditados. Las tablas tienen RLS sin políticas de acceso (denegación por defecto), de forma intencional.

`frontend/src/features/admin/aiOperations.test.ts`: reserva, obligaciones, costo conservador, datos desconocidos y saldo antiguo. `scripts/test-ai-operations.sql`: consulta, validación, trigger, idempotencia, exclusión Test y permisos. Todo dentro de una transacción con rollback, sin cargos externos. Requiere administrador, perfil y mappings Test/Live en el entorno.

Vista ficticia: `tests/visual/admin.html?view=/credits`, configuración `tests/visual/admin.vite.config.ts`.
