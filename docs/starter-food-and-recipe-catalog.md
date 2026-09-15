# Catálogo inicial de alimentos y recetas

## Versiones

- Catálogo: `NUTHRICK_MX_STARTER` / `1.0.0`.
- Ampliación curada: `NUTHRICK_MX_SMAE_4E_2014` / `1.1.0`.
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
el catálogo matemático existente. La conciliación de candidatos, aliases,
presentaciones alternativas, conflictos y exclusiones está en
[`smae-curated-expansion.md`](smae-curated-expansion.md).

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

## Auditoría de subtipos SMAE

La iteración del Objetivo 7 contrastó los 42 alimentos globales contra las
tablas citadas. Se corrigieron seis clasificaciones que estaban expresadas con
un subtipo AOA demasiado amplio:

- huevo entero: `AOA_MODERATE_FAT`;
- clara de huevo: `AOA_VERY_LOW_FAT`;
- pechuga de pollo: `AOA_VERY_LOW_FAT`;
- bistec/res magra: `AOA_VERY_LOW_FAT`;
- atún en agua: `AOA_VERY_LOW_FAT`;
- pescado blanco: `AOA_VERY_LOW_FAT`.

También se sincronizaron las porciones documentadas de pechuga, res, pescado y
queso panela. Carne de cerdo magra y queso panela permanecen en
`AOA_LOW_FAT`. Ningún alimento global queda con un código AOA genérico o con
un código fuera del catálogo matemático. Las contribuciones de las recetas
globales se regeneran desde sus `food_items`; los snapshots guardados en planes
anteriores no se reescriben.

## Compatibilidad y propuesta de menú

El selector ordena recetas mediante una función determinista que recompensa
cobertura y número de grupos cubiertos, favorece el tipo de comida y penaliza
el exceso con más peso que un faltante. Los resultados se dividen en
“Recomendadas” y “Otras recetas”, sin presentar el score como valoración
clínica.

El planificador `deterministic-menu-planner-v1` propone primero una receta
compatible y después alimentos individuales para completar. Ajusta cantidades
con incrementos prácticos por unidad, penaliza repeticiones y respeta solamente
restricciones estructuradas; nunca infiere restricciones desde texto libre. La
propuesta se muestra como vista previa y sólo se materializa en `diet_menu`
cuando el profesional pulsa “Aplicar propuesta”.

## Exclusiones deliberadas

No se precargaron queso Oaxaca “bajo en grasa”, queso sin lactosa ni bebida de
soya fortificada porque las fuentes revisadas no permitieron confirmar de forma
consistente una clasificación y una porción dentro del catálogo elegido.

## Privacidad

La migración contiene exclusivamente alimentos, preparaciones reutilizables,
cantidades culinarias y referencias. No contiene nombres, edades, diagnósticos,
medicamentos, fechas, antropometría ni notas clínicas de pacientes.
