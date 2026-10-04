# Asistente de dieta desde Equivalentes

Implementado el 4 de octubre de 2026. Entrada única en el paso 3: **Generar con IA**.

## Flujo profesional

1. Revisar datos de la consulta, antecedentes fechados, PES disponible y energía/macros para alimentos (ya descontados los suplementos). Confirmar o editar el objetivo de esta propuesta. No se reescribe la entrevista ni se aprueba un PES.
2. Elegir entre 1 y 6 tiempos, sus nombres/tipos/horarios y 1–3 alternativas por tiempo, hasta 12 alternativas en total. Una alternativa se consume en lugar de las demás.
3. Indicar preferencias de preparación, presupuesto, tiempo para cocinar e indicaciones adicionales.
4. Revisar la solicitud y confirmar. Si ya hay contenido se pide reemplazar los tres pasos del borrador.
5. El servidor prepara equivalentes y distribución con los motores existentes; la IA compone las opciones usando referencias del catálogo autorizado. Si hay diferencias respecto a las porciones/objetivos, se muestran antes de guardar.
6. Se guardan Equivalentes, Tiempos y Menú en una sola operación y se abre Menú. Todas las alternativas y el plan siguen pendientes de revisión/confirmación profesional. No se publica ni comparte automáticamente.

## Contexto y límites

- Se obtiene la consulta seleccionada y, del mismo paciente/profesional, la consulta inicial y hasta las tres consultas previas completadas. Se usa la última revisión de cada una; se excluyen retiradas, canceladas, borradores y consultas futuras.
- La consulta actual conserva sus mediciones y cálculos previamente registrados. El historial añade entrevista, objetivos, PES previamente aprobado y mediciones pertinentes con fecha. Texto seleccionado/redactado y límites por consulta mantienen acotado el contexto.
- Una revisión explícita puede completar la ausencia de una respuesta sobre alergias; nunca elimina una alergia/intolerancia registrada. Se conserva el bloqueo de generación automática para restricciones sin resolver. El taller manual sigue disponible.
- Las alternativas usan alimentos/recetas del catálogo, no recetas inventadas. Una solicitud puede requerir reducir alternativas si no hay variedad suficiente. Presupuesto y tiempo son preferencias, no precios ni tiempos certificados.
- Los modelos, precios y créditos siguen configurados por el administrador. No se cambian límites de gasto ni se hacen llamadas reales durante las pruebas sintéticas.

## Arquitectura

- Contrato acotado `DietGuidance`, validado en servidor; sin parámetros libres de modelo, sistema, nutrientes o propietario.
- Prompt `diet_draft@3`: tarea/jerarquía explícita, datos clínicos y preferencias separados de instrucciones del sistema, salida JSON estricta. Referencias autorizadas por tiempo y por alternativa; cantidades y nutrientes recalculados con SMAE.
- Basado en [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering) y [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). La estructura JSON no sustituye la validación nutricional ni la revisión profesional.
- Equivalentes y distribución se preparan en memoria, con marcas estables para reintentos. El snapshot privado congela prescripción, catálogo autorizado, contexto, opciones solicitadas y validación.
- Cada alternativa se valida por separado; el total diario solo suma la primera opción por tiempo. Las opciones duplicadas se rechazan.
- `ai_diet_draft` aplica los tres campos en una transacción, verifica propietario, revisión y sello del contexto actual, y conserva energía/macros/suplementos/versiones publicadas. Aplicar otra vez es idempotente.
- `diet_result` recupera una propuesta ya ejecutada del mismo propietario. La UI conserva únicamente la clave opaca de solicitud en sessionStorage; la consulta de estado no dispara otra generación.
- Se mantienen adaptadores @1/@2 para compatibilidad histórica. El despliegue de Edge precede la migración que activa @3.

## Verificación

- Tests de preparación: cero mutaciones previas, repetibilidad, historial, alergias, opciones independientes, duplicados, límites, suplementos.
- Tests del modal: navegación conservando elecciones, aplicación, revisión de diferencias, recuperación sin generación duplicada, validación antes del consumo.
- Tests existentes de menú, contexto, créditos y servidor; HTTP autenticado.
- `scripts/test-guided-diet-db.mjs`: PostgreSQL local desechable, transacción revertida; aislamiento, selección de historial, invalidación por cambios históricos, aplicación atómica, reemplazo, diferencias, preservación de suplementos y replay.
- Prueba SQL de la función de contexto con el esquema real, dentro de una transacción revertida, sin guardar planes.
- Navegador con datos ficticios a 1440 y 390 px: Equivalentes → asistente → cuatro tiempos/cinco opciones → Menú, sin errores ni desbordamiento del modal.
- No se generó, reemplazó ni publicó una dieta de un paciente real como parte de las pruebas.

## Publicación

Edge `ai` v26 con JWT habilitado. Migración `20261004064933_guided_diet_context_and_atomic_apply` aplicada; configuración `diet_draft@3`. Acceso directo del cliente a las RPC de contexto y aplicación continúa denegado; recuperación anónima rechazada con HTTP 401.
Las verificaciones de seguridad informaron las advertencias previas de otras funciones/biblioteca y de protección de contraseñas; las dos RPC modificadas siguen como invoker, solo accesibles al servidor.
