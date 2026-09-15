# Propuestas de equivalentes y tiempos

## Criterios

Equivalentes explora un conjunto finito y determinista de puntos de partida, variantes sin leche y variantes con menor concentración de grupos. Respeta las exclusiones y conserva literalmente las cantidades fijadas, incluidas cantidades manuales fuera del paso de 0.5. Fijar y excluir simultáneamente una cantidad positiva es un conflicto explícito.

El orden AOA → cereales → leguminosas → frutas → demás grupos orienta la búsqueda. No prescribe cantidades ni exige incluir familias. El huevo entero puede entrar mediante AOA moderados, de acuerdo con la clasificación corregida del catálogo existente. No se modificaron aportes ni clasificaciones.

Antes de ordenar los candidatos, se evalúan distribuciones posibles en los tiempos configurados, disponibilidad de alimentos, traducción a cantidades prácticas y recetas que caben en el inventario. También se aceptan combinaciones sencillas sin receta. Las preferencias explícitas de incluir, evitar y excluir se mantienen; incluir y evitar son preferencias, excluir es obligatorio.

La calidad favorece menor concentración de porciones, menos fragmentación y no mezclar subtipos de leche en un mismo tiempo. Varios subtipos intencionalmente conservados son válidos. No se interpreta texto libre ni se presenta la propuesta general como personalizada.

## Tolerancias y límites de búsqueda

`PROPOSAL_POLICY` centraliza los parámetros técnicos:

- 18 variantes deterministas además del candidato base de Equivalentes.
- Error máximo por indicador: 15% respecto a la energía o gramos objetivo (denominador mínimo 1 para objetivos cero). Es un límite de exploración, no una valoración clínica de aceptabilidad.
- Entre candidatos comparables: hasta 3.5 puntos porcentuales adicionales sobre el mejor error máximo encontrado, sin superar el límite anterior. Solo dentro de esta banda se prioriza la facilidad de preparación.
- Inventario: comprobación con epsilon 1e-7; no se utiliza la tolerancia de 0.1 del Menú para descartar porciones en Tiempos. Los residuos manuales se asignan al último tiempo y permanecen en el inventario.
- La evaluación de cantidades prácticas utiliza la misma conversión de unidades del generador de Menú y su tolerancia de 0.1 equivalentes. No cambia las cantidades prescritas.

Si no hay ajuste dentro de la banda máxima, se conserva el borrador y se explica que deben revisarse objetivos, exclusiones o cantidades fijadas. Si un tiempo conservado excede el inventario, se indica el grupo afectado. Si todos los tiempos están conservados y queda inventario, se pide liberar un tiempo. No se liberan cantidades automáticamente.

## Exploración y guardado

El historial está separado del borrador y vive en memoria durante la sesión de edición, identificado por plan y paso. Contiene propuestas ya vistas, posición, visibilidad y la copia previa a aplicar. Cambiar de paso conserva el historial; recargar la aplicación inicia otra sesión.

Anterior/Siguiente y Descartar no llaman al guardado ni a `onDraftChange`. Aplicar y Deshacer aplicación pasan por el guardado existente. Confirmar sigue siendo una acción separada. Una edición manual inicia una nueva exploración. Cambiar objetivos, preferencias, fijaciones, catálogo o inventario invalida las propuestas correspondientes antes de poder aplicarlas.

Los cambios guardados en los pasos previos reconcilian los estados dependientes. Los alimentos y recetas del Menú se conservan y el menú confirmado vuelve a edición cuando la distribución necesita revisión.

## Comprobaciones

Pruebas de alternativas distintas/reproducibles, A→B→A, recuperación tras cambiar de paso, ausencia de escrituras en exploración, deshacer cantidades manuales, obsolescencia, agotamiento de alternativas, exclusiones, bloqueos y conflictos. Pruebas de inventario con 2.33 y tiempo conservado con 0.33. Comprobación de desayuno con AOA moderados, cereales y leguminosas, tanto con receta explícita como sin biblioteca. Comprobación de separación de leches y conservación de una combinación fijada.

Ejemplo sintético: 2000 kcal, 250 g CHO, 100 g proteína, 60 g grasa. Frente al resultado del optimizador individual usado como base, la búsqueda coordinada encuentra una alternativa sin leche: 1977.5 kcal, 250.5 g CHO, 100.5 g proteína, 59.5 g grasa. El objetivo se conserva y las diferencias son visibles. El orden final puede variar según los alimentos, recetas y tiempos disponibles.

Ejemplo de distribución: AOA moderados 2, cereales 4, leguminosas 2.33 y verduras 3. El reparto anterior por pesos generaba 9 asignaciones grupo/tiempo; la búsqueda conjunta encuentra una alternativa de 5 asignaciones, conserva el inventario y permite un desayuno con huevo, frijoles y tortilla. La biblioteca puede favorecer otras alternativas.

## Límites pendientes

La búsqueda es acotada y no garantiza el óptimo global ni infinitas alternativas. La biblioteca sirve como evidencia de viabilidad, no como obligación de receta. Si el catálogo falla, se permite una propuesta general con aviso. Si faltan alimentos para un grupo, se identifica la limitación para revisar Equivalentes o ampliar el catálogo. Bebidas, jugos y sus sustituciones siguen fuera del alcance.
