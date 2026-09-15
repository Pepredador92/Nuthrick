# Ampliación curada del catálogo SMAE

## Versión y alcance

- Catálogo incorporado: `NUTHRICK_MX_SMAE_4E_2014` / `1.1.0`.
- Sistema matemático sin cambios: `SMAE_NOM037_2012` / `1.0.0`.
- Migración: `20260915165455_expand_curated_smae_catalog.sql`.
- Fuente declarada por cada fila aprobada: *Sistema Mexicano de Alimentos
  Equivalentes*, 4.ª edición (2014), con la página indicada en el archivo de
  candidatos proporcionado. La migración guarda esa procedencia sin afirmar una
  verificación independiente de la obra original.

La ampliación no introduce macros, calorías, gramos comestibles ni reglas
matemáticas por alimento. Cada alimento sigue aportando el promedio del grupo
de equivalentes ya definido por Nuthrick. Tampoco modifica recetas personales,
alimentos personales ni snapshots de planes clínicos anteriores.

## Resultado de la conciliación

Se revisaron **179** candidatos:

| Resultado | Cantidad | Tratamiento |
| --- | ---: | --- |
| Nuevo alimento global | 86 | Se inserta con `stable_code`, grupo, porción, fuente, versión y página. |
| Alias de un alimento existente | 32 | Conserva la porción publicada; sólo mejora la búsqueda cuando la identidad y el grupo coinciden. |
| Presentación alternativa | 3 | Se agrega como `alternate_portions`, sin crear otro alimento. |
| Conflicto | 13 | No se modifica ningún alimento existente. |
| Excluido | 5 | Preparación con grasa inseparable o producto/marca no suficientemente generalizable. |
| Diferido | 40 | Prioridad media o baja: se conserva para una revisión posterior, no se muestra en el selector. |

Los 86 nuevos aprobados se distribuyen así: 15 verduras, 15 frutas, 12
cereales sin grasa, 7 leguminosas, 6 AOA muy bajos en grasa, 8 AOA bajos en
grasa, 9 leches y 14 grasas. Esta selección privilegia variedad cotidiana sin
convertir el primer despliegue en un listado excesivo.

## Normalización aplicada

- `taza` y `tazas` se guardan como `cup`; `cucharada` como `tablespoon`; y
  `cucharadita` como `teaspoon`.
- Piezas, piezas medianas y mitades usan `piece`; rebanadas usan `slice`; los
  gramos mantienen `g`. Las fracciones se almacenan como números exactos a tres
  decimales, por ejemplo `3/4` es `0.750`.
- Los nombres se guardan sin acentos en `normalized_name` y la presentación
  legible permanece en `portion_description`.
- Las galletas de maíz horneadas se registran como categoría genérica, con
  `Salmas` sólo como alias de búsqueda. No se conserva una marca como identidad
  global.
- Restricciones estructuradas se añaden sólo cuando son inequívocas en el
  alimento: soya, leche/lactosa, pescado, crustáceos, cacahuate o frutos secos.
  No se deducen atributos ausentes de la fuente.

## Alias y presentaciones que no duplican

Los aliases cubren, entre otros, calabacita alargada, cebolla blanca rebanada,
jitomate bola, nopal cocido, pollo sin piel, pescado fileteado, bistec/filete
de res, carne de cerdo, leche semidescremada 1%/2% y huevo entero fresco o
cocido. Las presentaciones alternativas aprobadas son naranja en piezas, pollo
deshebrado en taza y atún escurrido en lata. Todas conservan la identidad y el
grupo ya publicados.

## Inventario de conflictos y exclusiones

Los siguientes casos no se fusionan porque la misma identidad tenía una porción
o grupo distinto: pepino con cáscara, guayaba, manzana sin tamaño, papaya,
arroz blanco, arroz integral, avena en hojuelas, pasta integral, espagueti,
hummus como leguminosa, hummus como grasa con proteína, pescado blanco
fileteado y tostada con grasa. El historial y las porciones previas quedan
intactos hasta una revisión editorial explícita.

Se excluyen frijoles refritos, huevo frito, pollo rostizado y papas fritas a la
francesa porque la grasa de preparación no es separable dentro de la equivalencia
modular. Queso Oaxaca Lala Light se excluye por ser una marca/presentación cuya
generalización no está sustentada en esta curación.

Los 40 diferidos incluyen cereales con grasa, AOA moderados/altos que no son
preparaciones excluidas, leche con azúcar y azúcares. Se evaluarán después con
criterios clínicos y de uso real, no por el solo hecho de aparecer en la fuente.

## Comportamiento del producto

El selector ya filtra por grupo y por atributos estructurados. El planificador
continúa priorizando compatibilidad con los equivalentes requeridos, restricciones
y cantidades prácticas; no usa la fecha de alta del alimento como criterio. El
catálogo global resultante tiene 128 filas, por debajo del límite de lectura
actual de 250, y conserva el índice de búsqueda activo por nombre normalizado y
grupo.

## Seguridad y reversibilidad

`food_items` mantiene RLS: los usuarios autenticados sólo leen filas globales o
las propias, y sólo pueden escribir filas `is_custom` de su propiedad. La
migración usa IDs deterministas y `ON CONFLICT` sobre esos IDs, con una guarda
adicional que impide sobrescribir una fila personal. No elimina filas globales.
Aplicarla de nuevo no duplica los alimentos, aliases ni presentaciones.
