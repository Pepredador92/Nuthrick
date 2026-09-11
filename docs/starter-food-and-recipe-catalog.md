# Catálogo inicial de alimentos y recetas

## Versiones

- Catálogo: `NUTHRICK_MX_STARTER` / `1.0.0`.
- Sistema de equivalentes: `SMAE_NOM037_2012` / `1.0.0`.
- Biblioteca: `NUTHRICK_STARTER_RECIPES` / `1.0.0`.

## Fuentes y criterio

La fuente principal es la **NOM-037-SSA2-2012**, apéndice informativo F.3,
“Resumen del Sistema Mexicano de Alimentos Equivalentes”. Es la fuente que
mantiene coherencia con el código de catálogo ya usado por Nuthrick.

Fuentes complementarias oficiales:

- [NOM-037-SSA2-2012, apéndice informativo F.3](https://dof.gob.mx/nota_detalle_popup.php?codigo=5259329).
- [IMSS, procedimiento `2250-003-002`](https://www.imss.gob.mx/sites/all/statics/pdf/procedimientos/2250-003-002.pdf), tabla de raciones basada en SMAE 4.ª edición.
- [Diario Oficial de la Federación, publicación del 3 de mayo de 2018](https://www.dof.gob.mx/abrirPDF.php?anio=2018&archivo=03052018-MAT.pdf&repo=repositorio%2F), tabla 4
  “Tamaño de las porciones del Sistema Mexicano de Alimentos Equivalentes”.
- [IMSS, *Cartera de alimentación saludable*](https://www.imss.gob.mx/sites/all/statics/salud/guias_salud/cartera-alimentacion.pdf), para preparaciones y combinaciones.
- [Listado público de alimentos y porciones del Municipio de Juárez](https://juarez.gob.mx/transparencia/docs/contestacion-de-679.pdf), únicamente
  para la porción de crema de cacahuate.

Cada alimento global conserva `catalog_code = NUTHRICK_MX_STARTER`, además de
`source`, `source_version` y `source_reference`. No se
completaron valores nutrimentales específicos cuando la fuente consultada sólo
sustenta grupo y porción. Los promedios por equivalente continúan viviendo en
el catálogo matemático existente.

## Decisiones de normalización

- “Pollo”, “pollo cocido” y “pollo deshebrado” son aliases de **Pechuga de pollo
  cocida sin piel**; no son tres alimentos distintos.
- “Carne”, “res”, “bistec” y “bistec magro” apuntan a **Carne de res magra
  cocida**.
- Las recetas son preparaciones base. Cambiar la cantidad dentro de un menú
  recalcula sus equivalentes y queda en el snapshot del plan; no crea ni altera
  la receta global.
- Condimentos de cantidad no significativa (limón, chile, cilantro, hierbas y
  especias) se conservan en instrucciones y no contaminan los equivalentes.
- Las sustituciones se guardan como notas explícitas con cantidades. No se
  interpretan como un motor universal 1:1.

## Exclusiones deliberadas

No se precargaron queso Oaxaca “bajo en grasa”, queso sin lactosa ni bebida de
soya fortificada porque las fuentes revisadas no permitieron confirmar de forma
consistente una clasificación y una porción dentro del catálogo elegido.

## Privacidad

La migración contiene exclusivamente alimentos, preparaciones reutilizables,
cantidades culinarias y referencias. No contiene nombres, edades, diagnósticos,
medicamentos, fechas, antropometría ni notas clínicas de pacientes.
