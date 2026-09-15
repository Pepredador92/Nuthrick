# Nuthrick a la Mesa — iteración del Menú

## Experiencia y continuidad

El paso sigue llamándose Menú. La marca y sus textos principales están en `MESA_COPY`.
Se reutilizan `DietMenu`, el motor determinista, el catálogo de equivalentes, las cantidades prácticas, intercambios, nombres automáticos, snapshots, `useChangeAutosave` y el historial de propuestas. No hay un segundo motor ni un segundo borrador para la vista clásica.

- Por completar: utilizado/objetivo, icono y texto de pendiente, cubierto o exceso; detalle de diferencias reales.
- Tu menú: componentes agrupados por rol culinario editable; cantidades de ese tiempo y detalle del rendimiento/ingredientes.
- Despensa: alimentos, recetas y bebidas, con contexto de grupos pendientes y búsquedas por ingredientes/preparación.
- En móvil se colapsan los pendientes y la despensa abre un diálogo nativo; los tiempos son desplazables. No se comprimen tres columnas.
- Ver el día muestra preparaciones, cantidades, diferencias y repeticiones concretas. Repetir no equivale a un error.
- Se emplean iconos vectoriales existentes con fondos de color, tomando la imagen suministrada como referencia, sin cargar una lámina raster completa ni añadir gamificación.

## Criterios nutricionales y culinarios

Menú no escribe objetivo energético, macros, equivalentes diarios ni distribución. La revisión profesional es explícita e independiente de cubrir grupos.

Se mantiene la tolerancia existente de ±0.1 equivalentes por grupo/tiempo: es una regla operativa de comparación, no un umbral clínico validado. Los valores de cálculo se conservan a seis decimales. El detalle suma faltantes y excesos por separado, incluso aportes pequeños de grupos no prescritos; nunca los compensa entre grupos para esconderlos.

Las propuestas conservan entradas y cantidades existentes por defecto. Reorganizar es una acción distinta. Se pueden fijar componentes o tiempos completos. Los ajustes automáticos de una receta emplean un factor común entre 0.5 y 2: ya no estiran por separado cada ingrediente para cerrar grupos. Se redujeron las penalizaciones de repetición y se retiraron las penalizaciones por dos ingredientes del mismo grupo/familia. Los candidatos a alimentos se ordenan por diferencia absoluta, sin preferir siempre quedarse corto.

El catálogo y la prescripción pueden no permitir una receta coherente que cierre todos los grupos. En tal caso hay alternativas de alimentos separados o pendientes visibles y acceso a Tiempos; no se inventa una técnica culinaria ni se modifica la prescripción. El profesional todavía debe decidir cómo servir los componentes. Esto no constituye una valoración automática de sabor, aceptación, saciedad ni calidad clínica.

### Casos concretos comprobados

| Caso ficticio | Antes | Ahora |
| --- | --- | --- |
| Ya hay papaya y se pulsa Proponer tiempo | El motor podía incrementar un componente existente para completar | Conserva su cantidad; propone únicamente lo que falta |
| Tostadas de atún con frijoles, con proporciones incompatibles con la distribución | Se ajustaban independientemente sus ingredientes | Mantiene proporciones; el caso de prueba ofrece tostada, atún, frijoles, jitomate y pollo por separado, sin deformar ni renombrar la receta original |
| Convertir 2 equivalentes de fruta en receta de rendimiento 2 | La conversión podía tratar el lote completo como una sola ración | Usa 2 raciones del lote; conserva los 2 equivalentes y los acompañamientos no seleccionados |
| Intercambio de 1 equivalente por un alimento de referencia 0.67 taza | La coincidencia podía parecer exacta al mostrar el número objetivo | Usa la medida práctica de 0.75 taza; señala el exceso real |
| Faltan 0.06 equivalentes en dos tiempos | Ambos pueden estar dentro de tolerancia individual | El detalle muestra 0.12 faltantes acumulados, sin ocultarlos |

## Personalización, exploración y biblioteca

Las preferencias son explícitas y por plan: le gusta, prefiere evitar, excluido o sin información. Se guardan en `diet_menu.food_preferences`. Se conectan al motor, la despensa y los intercambios. Evitar influye en el orden, sin prohibir; excluir sí bloquea. Un componente previamente agregado y después excluido no se elimina silenciosamente: se señala en el día y bloquea la confirmación. No se deducen preferencias ni alergias desde texto libre.

El menú aplicado, la propuesta editable y el historial son estados distintos. La vista clásica y la mesa usan el mismo estado de trabajo. Editar una propuesta no guarda el menú; Aplicar guarda, Descartar recupera el borrador y Deshacer restaura el anterior. Se recorren alternativas A → B → A con su edición conservada. Cambiar distribución o preferencias invalida la exploración. Las alternativas son finitas (hasta 16 candidatos deterministas, deduplicados por contenido), no generación ilimitada ni IA.

Crear receta exige elegir qué componentes incluir; no preselecciona fruta, bebida ni todo el tiempo. El editor permite ingredientes, cantidades, rendimiento, preparación y notas, con nombre automático editable. Los ajustes de recetas existentes operan sobre snapshots, no sobre la biblioteca original.

Guardar en mi biblioteca y usar en el menú son decisiones distintas. La biblioteca conserva una receta guardada explícitamente aunque se descarte la propuesta. Los fallos mantienen la edición y permiten reintentar; si falla la escritura de ingredientes se intenta retirar exclusivamente la fila recién creada por esa misma solicitud y propietario. No se eliminan recetas existentes.

## Bebidas, procedencia y persistencia

Se utiliza el atributo existente `recipes.tags` con el valor reservado `nuthrick:drink`; no hace falta otra tabla ni migración. Los campos opcionales de rol y preferencias se añaden al JSON existente `nutrition_plans.diet_menu`, manteniendo `schema_version: 1` y compatibilidad con planes anteriores. Los snapshots conservan ingredientes, cantidades, rendimiento, tipo, preparación, notas y fuente. No hay cambios a RLS ni a la autenticación.

Catálogo inicial, definido en `starterDrinks`:

1. Agua natural, vaso de 240 ml. Identificador y fuente específicos para aceptar cero equivalentes. La fuente sobre agua sin calorías es [CDC, About Water and Healthier Drinks](https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html). El vaso es la unidad de presentación, no una recomendación de consumo diario.
2. Leche descremada: usa una cantidad de referencia del alimento activo `MX_SKIM_MILK` del catálogo, sin inventar equivalencias.
3. Licuado de papaya con leche: utiliza las cantidades de referencia de `MX_PAPAYA` y `MX_SKIM_MILK`, con preparación explícita. No se infiere “licuado” de cualquier lista de ingredientes.

Las dos preparaciones con aporte solo están disponibles cuando existen sus ingredientes en el catálogo. Las bebidas personales usan el mismo editor/servicio de recetas. El agua no completa grupos ni entra al solver; las bebidas con aporte consumen el mismo inventario, sin sumar además ingredientes independientes. Aporte desconocido no se convierte en cero. Las estimaciones nutricionales del detalle proceden de promedios del catálogo de equivalentes, claramente identificados, no de un análisis directo del alimento.

Verificación de seguridad sobre el único proyecto autorizado, `qlsqhvyrslclmlstlemn`: políticas `USING`/`WITH CHECK` por propietario intactas. Una transacción de solo lectura bajo rol `authenticated` y un identificador ficticio devolvió `true` para aislamiento de recetas, ingredientes y planes ajenos. No se crearon pacientes ni se modificaron expedientes para la prueba.

## Validación y límites

- TypeScript y ESLint correctos.
- 416 pruebas correctas en 46 archivos, incluyendo modelo, propuestas, interfaz, integración del taller y contrato de persistencia. Se excluyó el test de LandingPage porque pertenece a cambios ajenos; esos archivos no se incluyen en el commit.
- Build de producción verificado antes de publicar.
- Chrome aislado con plan ficticio y escritor de biblioteca en memoria: agregar, intercambiar, seleccionar ingredientes, rendimiento 2, guardar biblioteca sin guardar menú, agua, bebida con aporte, bebida personal, A → B → A, descartar, aplicar, deshacer, vista clásica y revisión del día.
- Capturas y comprobaciones de desbordamiento a 1440, 768 y 390 px; despensa/editor móviles, cierre con Escape. Diálogos nativos para foco y modal; tiempos con flechas/Home/End; reducción de movimiento heredada del sitio.
- Prueba reproducible: `frontend/tests/visual/mesa-check.mjs`, con Vite visual en 4175 y `MESA_PLAYWRIGHT_MODULE` apuntando a Playwright si no está en dependencias.

El historial de alternativas, fijaciones y preferencias visuales vive en la sesión de edición; no promete recuperarse tras recargar el navegador. Menú aplicado, preferencias alimentarias, roles y snapshots sí se guardan. No se inventan costos, tiempos, equipo, disponibilidad ni aceptación: faltan datos estructurados para esas dimensiones. La calidad culinaria de las alternativas depende del catálogo; los casos difíciles siguen requiriendo revisión profesional.

Se publica en `origin/main` y se comprueba el estado real Ready en Vercel y la ruta `/app/diet-workshop` para la entrega. No se implementó Objetivo 8, PDF, WhatsApp, portal, nuevos versionados clínicos, rankings ni prescripciones automáticas.
