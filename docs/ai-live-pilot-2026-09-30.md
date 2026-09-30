# IA y recargas en producción — 2026-09-30

La autorización de activación comercial sustituye el piloto de una sola cuenta. El acceso se resuelve con los permisos vigentes del plan: Esencial incluye R24h y PES, Profesional también Taller de dietas. Los créditos incluidos siguen siendo 10 y 50 por mes respectivamente, según el catálogo administrable; las asignaciones manuales conservan su política.

## Consentimiento y privacidad

El profesional debe aceptar el aviso versionado antes del primer uso, confirmar la gestión de las autorizaciones de sus pacientes y tener vigente la aceptación de Privacidad. La revocación bloquea nuevas solicitudes. El servidor verifica plan, consentimiento y configuración antes de leer contexto clínico; la UI permite administrar el aviso desde «Privacidad de IA».

OpenAI recibe el contexto mínimo preparado para la función solicitada. No se garantiza anonimización. Las solicitudes usan `store:false`; esto no elimina necesariamente los registros de control de abuso, cuya retención estándar puede ser de hasta 30 días con excepciones. Véanse los [controles oficiales de datos](https://developers.openai.com/api/docs/guides/your-data). Los resultados requieren revisión profesional y los borradores de dieta no se publican automáticamente.

## Contabilidad y límites

Los créditos se liquidan con el uso real de tokens y las tarifas configuradas; los valores orientativos de 1/2/5 créditos no son cargos fijos. Se reserva primero el máximo posible y se libera la diferencia al liquidar. Se consumen primero los créditos incluidos vigentes y después los adicionales. Los adicionales no caducan. Saldo insuficiente, reembolsos pendientes o deuda bloquean nuevos usos según las reglas existentes.

La configuración central incorpora `production_enabled`, `production_daily_credits` (100) y `production_daily_generations` (100 por función y día UTC). Se conserva el máximo de 3 solicitudes pendientes y 10 nuevas por minuto. El límite total de calibración y la caducidad a 30 días no se aplican en producción. No se regalan créditos al aceptar el aviso: se ejecuta la asignación mensual existente y auditada del plan, si corresponde.

Las cuentas TEST y las cuentas con recargas TEST sin revertir no obtienen acceso real. La separación de precios, compras, clientes, eventos e idempotencia utiliza el entorno de facturación. Los saldos y registros históricos se conservan.

## Recargas

| Créditos | Pago único MXN |
| ---: | ---: |
| 100 | $99 |
| 500 | $349 |
| 1,000 | $699 |

El administrador puede sincronizar los precios Live desde el catálogo. Cada checkout usa una copia versionada del precio; modificar el catálogo afecta las compras nuevas. El regreso desde Stripe no acredita saldo: solo un webhook firmado y su comprobación de pago canónica pueden hacerlo. Eventos duplicados no duplican créditos y los reembolsos revierten el saldo correspondiente.

## Verificación y operación

- `node scripts/test-live-ai.mjs`: base local aislada; consentimiento, revocación, permisos, Live/TEST, crédito único y reversión completa.
- Pruebas Deno de billing y de IA; pruebas de UI de créditos y consentimiento; typecheck y build del frontend.
- Dos llamadas sintéticas mínimas a los modelos configurados verificaron acceso al proveedor; no se enviaron expedientes ni datos de pacientes.
- `NUTHRICK_AI_ENABLED` y `NUTHRICK_DIET_REAL_PROVIDER_ENABLED` son interruptores del servidor. `OPENAI_API_KEY` nunca llega al navegador.
- `production_enabled`, `credit_purchase_enabled` y `ai_feature_config.enabled` permiten detener la operación sin borrar consentimientos, compras ni ledger.
- La activación de IA no cambia el interruptor de checkout de suscripciones.

Activado en producción el 30 de septiembre de 2026: servidor real, tres funciones habilitadas, recargas Live habilitadas y tres precios versionados sincronizados con Stripe. Readiness: 15/15. Verificado el aviso de consentimiento en nuthrick.com. Pruebas: 110 de IA, 56 de billing y 22 de frontend; typecheck, build y regresión SQL aislada satisfactorios. No se realizó un cobro real por créditos ni se envió información de pacientes durante esta implementación. Cada profesional debe aceptar el aviso antes de usar IA o comprar recargas.
