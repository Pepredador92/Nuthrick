# Ampliación curada del catálogo SMAE

## Versión y alcance

- Catálogo incorporado: `NUTHRICK_MX_SMAE_4E_2014` / `1.1.0`.
- Sistema matemático sin cambios: `SMAE_NOM037_2012` / `1.0.0`.
- Migración inicial: `20260915170641_expand_curated_smae_catalog.sql`.
- Conciliación posterior: `20260915183530_reconcile_portions_and_editorial_preparations.sql` (revisión 1.2.0). Véase el resultado vigente al final; las cifras de esta primera sección describen la importación inicial.
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
- La importación inicial guardaba mitades como `piece` y tercios redondeados a tres
  decimales. Esto se corrige en 1.2.0: `half` representa mitades; `portion_fraction`
  conserva numerador, denominador y expresión original para los tercios documentados.
  La lectura del catálogo normaliza su valor para nuevos cálculos. Los snapshots
  históricos no se reescriben. Rebanadas usan `slice`; gramos mantienen `g`.
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
deshebrado en taza y atún escurrido en lata. En 1.2.0 se retira esta última
presentación porque no identifica el tamaño de lata; se conserva el atún en gramos.

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
catálogo global inicial tenía 128 filas. En 1.2.0 la lectura pagina de 250 en 250,
con orden estable, hasta cargar todos los alimentos accesibles. La búsqueda ya
no queda limitada a los primeros 250 alimentos globales y personales.

## Seguridad y reversibilidad

`food_items` mantiene RLS: los usuarios autenticados sólo leen filas globales o
las propias, y sólo pueden escribir filas `is_custom` de su propiedad. La
migración usa IDs deterministas y `ON CONFLICT` sobre esos IDs, con una guarda
adicional que impide sobrescribir una fila personal. No elimina filas globales.
Aplicarla de nuevo no duplica los alimentos, aliases ni presentaciones.

## Resultado vigente de la revisión 1.2.0

El archivo [smae-candidate-decisions.json](smae-candidate-decisions.json) contiene
una decisión principal, identidad, medida y motivo por cada uno de los 179 candidatos.

| Decisión principal | Cantidad |
| --- | ---: |
| Ya incorporado | 85 |
| Nuevo en esta revisión | 4 |
| Alias | 32 |
| Presentación alternativa | 2 |
| Conflicto | 15 |
| Excluido | 5 |
| Diferido | 36 |
| Total | 179 |

Los cuatro nuevos son cheddar, Chihuahua, Cotija y asadero. Identidad, grupo y
medida se cotejaron visualmente en el libro original, PDF página 81 / impresa 79.
Nuez de la India se verificó en PDF 103 / impresa 101: **15 mitades**, no piezas.
No se afirma que todos los 179 registros se hayan verificado en el original.

Chía pasa de incorporada a conflicto: el Excel declara cucharaditas y el original
cucharadas, con pesos bruto/neto que requieren aclaración (PDF 102). Queda inactiva
para nuevas selecciones, sin eliminarse ni alterar usos anteriores. El atún en lata
pasa de presentación alternativa a conflicto. No se duplica la bebida de soya ni
se generaliza el queso de marca excluido.

Resultado global: **132 filas, 131 activas**. Las 86 incorporaciones iniciales
siguen existiendo; una está pendiente de aclaración. Esta revisión añade cuatro,
no 179. Los promedios matemáticos SMAE continúan en `1.0.0`, independientes de
esta revisión editorial y de la edición bibliográfica de 2014.
