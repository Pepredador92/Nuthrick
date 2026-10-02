# Ajustes comerciales — 2 de octubre de 2026

## Alcance y evidencia previa

El piloto LIVE del 30 de septiembre ya verificó un cobro real de $349 MXN,
webhook, acceso, créditos, correos y reembolso. No se repite ese cobro ni la
calibración de IA. Ver `lanzamiento-suscripciones-2026-09-30.md` y
`ai-live-pilot-2026-09-30.md`.

El problema posterior fue de configuración: checkout cerrado, selección de
entorno limitada a la lista piloto y verificaciones con vencimiento de 24 horas.

## Suscripciones

- Los profesionales normales usan LIVE; únicamente las cuentas TEST explícitas
  sin acceso/suscripción LIVE conservan TEST. Pausar ventas no envía clientes a TEST.
- `public_sales_enabled` permite venta general, separado de `checkout_enabled`.
  La migración inicialmente deja ventas generales cerradas para poder desplegar
  primero la función de facturación compatible.
- Antes de aplicar código o abrir Checkout, la Edge Function renueva verificaciones
  vencidas: cuenta, precios actuales, webhook, portal y conciliación. La revisión
  guarda resultados reales; no cambia fechas sin consultar Stripe.
- Todos los controles anteriores siguen siendo obligatorios antes de reservar
  Checkout. No se activa acceso por retorno del navegador: continúa dependiendo
  del pago verificado y del webhook idempotente.
- Los precios editados se versionan para nuevas compras. Las suscripciones ya
  contratadas conservan su precio. No se han realizado nuevas compras de prueba LIVE.
- Readiness comercial permite ejecutar la inspección de Stripe desde administración.

## Catálogo y promociones

- Esencial: $349/mes, $3,490/año, 30 pacientes activos, funciones básicas sin IA
  ni compra de créditos IA.
- Profesional: $499/mes, $4,990/año, pacientes ilimitados, R24h/PES/Taller con IA.
  Se conservan los 50 créditos mensuales configurados.
- No se retiran saldos comprados ni se modifican cortesías u overrides explícitos.
- Checkout: «Código promocional», «Aplicar código», precio normal, descuento y
  total; «Continuar al pago» en LIVE. El código no puede editarse durante validación.
- El servidor conserva elegibilidad, vigencia, límites y separación de promociones
  TEST/LIVE. Las plantillas TEST no se convierten en ofertas públicas automáticamente.

## Costos en administración

- Simulación junto a edición de planes y paquetes; se recalcula al cambiar importes.
- Conversión de IA leída de `ai_feature_config`, sólo por administradores.
  Costo USD/crédito = 1 / (credits_per_usd × credit_multiplier).
  Si difiere entre funciones activas, se usa el mayor costo como estimación prudente.
- Configuración actual verificada: 100 créditos por USD y multiplicador 1:
  **1 crédito = USD 0.01**; no equivale a un peso ni a una ejecución fija.
- FX editable, valor inicial ilustrativo 18.50 MXN/USD; no es cotización en vivo.
- Referencias consultadas el 2 de octubre: Stripe Payments tarjeta nacional
  3.6% + $3; Billing 0.7% para suscripciones, IVA de comisiones configurable
  (supuesto inicial 16%). [Stripe México](https://stripe.com/mx/pricing).
- Anual: una comisión fija por pago y 12 asignaciones mensuales de créditos.
  Recarga: incluye créditos bonus, sin comisión Billing de suscripción.
- Margen mostrado = precio − comisiones − IVA de comisiones − costo IA.
  Es margen de contribución antes de impuestos propios, infraestructura, soporte,
  reembolsos y otros gastos; no es utilidad neta ni una liquidación Stripe real.
- Supuestos guardados únicamente en el navegador del administrador; no modifican
  facturación ni precios del proveedor.
- Botón administrativo a [saldo OpenAI](https://platform.openai.com/settings/organization/billing/overview).
  Recarga el administrador; no se realizan compras automáticas ni se muestra un saldo inventado.

## Pendiente de decisión: 30 días gratis

El usuario pidió 30 días para nuevos usuarios. Falta definir si será sin tarjeta
(contratación al vencer) o con tarjeta y renovación automática informada. Se hizo
la pregunta y no hay respuesta al redactar este registro. Por eso no se anuncia
una prueba inexistente ni se configura un cobro automático no definido.
PWA y Web Push siguen fuera de esta intervención.

## Verificación y publicación

Pruebas focales frontend, facturación Deno y base local desechable con datos
sintéticos. `scripts/test-public-sales.mjs` cubre selección de entorno, interruptor,
permiso de inspección, barrera legal, permisos de planes y RPC administrativo.
Antes de publicar: typecheck, ESLint focal, Deno lint, build Vercel, diff/check/status.
Activar venta general sólo después de desplegar migraciones y función billing,
y obtener los controles LIVE listos mediante inspección real del proveedor.
