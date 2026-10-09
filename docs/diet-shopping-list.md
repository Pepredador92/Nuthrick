# Carrito del súper para dietas de IA

## Flujo

Equivalentes → Generar con IA → revisar y aprobar todas las dietas → Publicar versión → **Incluir carrito del súper**.

La opción es voluntaria. Se elige cuántos días se utilizará cada dieta (0 para omitirla, de 1 a 31 días en total para una persona). Al activar la opción o cambiar los días, los campos se completan automáticamente. Cambiar los días o recalcular reemplaza los ajustes manuales y requiere revisar de nuevo. Un aviso confirma la actualización y el botón confirma los recálculos manuales. Los productos incompletos se cuentan, se resaltan y tienen un acceso directo al primero antes de habilitar la revisión. La lista suma los ingredientes de las dietas aprobadas y se revisa antes de confirmar la publicación. El texto de las dietas no cambia al editar la lista.

La compilación es local y determinista; no hace otra petición de IA ni consume créditos. Lee las viñetas de ingredientes del formato de generación actual, admite fracciones habituales (incluyendo «3/4 de taza»), preparaciones de un solo alimento como «cocida y machacada», cantidades al inicio o después del nombre (con separador o paréntesis), abreviaturas y productos contables; normaliza g/kg y ml/l. El prompt de generación pide productos individuales con cantidad y unidad explícitas al inicio, sin rangos ni alimentos añadidos solo en la preparación. Solo combina nombres normalizados (incluidos plurales comunes) y unidades compatibles. No convierte tazas en gramos, ni pesos cocidos en crudos. Cantidades ambiguas, ingredientes combinados o dietas sin viñetas requieren completar la revisión. El profesional puede añadir, corregir o quitar filas y debe revisar también ingredientes redactados fuera de las viñetas.

Los productos se agrupan por sección del supermercado: frutas y verduras, cereales, leguminosas, carnes/pescado/huevo, lácteos, aceites/semillas, despensa, bebidas y otros. La categoría se sugiere por el nombre y se puede corregir en la revisión. Los productos desconocidos quedan en Otros. Las listas anteriores sin categoría siguen siendo compatibles y reciben agrupación al mostrarse.

## Conservación y entrega

Se almacena como `text_diet.shopping_list` en el JSON existente, dentro del mismo guardado con control de revisión del borrador; la publicación conserva ese JSON en su snapshot inmutable. No requiere migración. La clave de origen conserva la identidad y el texto exactos de las dietas; editar título o contenido en el editor elimina el carrito previo. El contrato compartido verifica origen, días, cantidades, unidades y tamaño de lista.

La proyección del Super Link entrega únicamente días, alimentos y categoría, sin la clave interna ni metadatos de revisión. El PDF y LaTeX usan esa misma proyección. Las publicaciones anteriores sin carrito conservan su presentación. Para añadir un carrito a un plan anterior se revisa el borrador y publica una nueva versión.

## Verificación y despliegue

- Pruebas de sumas, fracciones, unidades incompatibles, cantidades ambiguas, origen obsoleto, privacidad y exportación.
- Pruebas del modal opcional, días, revisión obligatoria y conservación de ediciones tras un error de publicación.
- Pruebas existentes del generador, taller y documentos.
- Vista sintética: `frontend/tests/visual/groceries.html`.
- PDF sintético: `node frontend/tests/visual/render-groceries.mjs`.
- Desplegar Edge Functions `ai` (instrucciones de ingredientes) y `agenda` con el contrato compartido actualizado antes de publicar el frontend. Se mantiene su autenticación interna y configuración JWT existente. No cambian permisos, tablas, créditos ni servicios de IA.
