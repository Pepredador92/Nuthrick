# Suplementación en el Taller de dietas

## Auditoría · 3 de octubre de 2026

Base: `c186603`, rama `main`. Los directorios locales `output/` y `tmp/` quedan fuera de estos cambios.

- `DietWorkshopPage` coordina Energía, Macros, Equivalentes, Tiempos, Menú y Revisión. Los cambios se guardan con debounce, una cola y `draft_revision` para detectar concurrencia.
- `DietMacrosStep` y `features/macros/model.ts` conservan la meta diaria y sus entradas (%/g/g por kg). `exchangeTargetsFor` transforma esa meta en objetivos para alimentos; actualmente no existe una contribución de suplementos.
- `DietEquivalentsStep` permite confirmar diferencias energéticas, pero la navegación exige macros completos. `confirmMealDistribution` exige inventario exacto. `features/menu/options.ts` permite diferencias de equivalentes con confirmación explícita, pero bloquea opciones vacías y tiempos sin prescripción. `week.ts` exige cubrir todos los tiempos.
- `validateNutritionPlanForPublication` y `private.nutrition_plan_publication_errors` repiten requisitos de completitud. El RPC de publicación comprueba propietario, revisión e idempotencia, y guarda una versión inmutable.
- El snapshot publicado contiene la prescripción y calendario. `PatientPlanPreview` presenta la revisión profesional. `projectPortalPlan` proyecta sólo los datos de paciente para `PortalPlanContent`. `plan-document.ts` construye PDF y LaTeX a partir de esa misma proyección.
- Las indicaciones manuales (`PortalNotes`) permiten guardar texto sin depender de nutrientes; sus controles de texto vacío, guardado y permisos son distintos de los bloqueos del taller.
- No existe catálogo ni prescripción de suplementos en este flujo. La biblioteca necesita persistencia con acceso por profesional; el catálogo de referencia será de sólo lectura y los productos manuales privados.

## Etapas acordadas

1. Auditoría y línea base (este documento). Pasan 4 archivos / 26 pruebas focales de Macros, Tiempos, revisión y proyección del portal.
2. Confirmación manual con pendientes: convertir diferencias/completitud nutricional en avisos, conservando validez de cantidades, permisos, concurrencia y snapshots. Verificar cliente y servidor juntos.
3. Catálogo y biblioteca: productos GNC con etiqueta verificable, presentación, porción y fuente; captura manual privada. No inferir valores faltantes ni trasladar valores entre sabores/presentaciones.
4. Selección en Macros: cantidades por porción, scoop o gramos cuando la etiqueta permita convertirlos; varios suplementos, edición y eliminación. Meta total = alimentos + suplementos; objetivos de alimentos = meta diaria menos aporte de suplementos, con aviso si se excede.
5. Publicación: conservar producto y dosis como snapshot; bloque verde de Suplementación en revisión, Super Link y documentos del plan. Instrucciones sólo registradas por el profesional.
6. Verificación focal de aritmética, permisos, guardado, versiones y presentación responsive; commit y push a `main` por etapa terminada.

## Criterios

- Editar un producto de biblioteca no cambia prescripciones ni versiones ya guardadas.
- Los suplementos no se convierten a grupos SMAE ni se incluyen como alimentos del menú.
- Las metas diarias siguen siendo del profesional; el sistema no añade dosis ni recomendaciones.
- Los planes anteriores sin suplementos conservan su funcionamiento.
- El paciente ve nombre, porción e instrucciones en lenguaje sencillo y un bloque verde distinguible de las comidas.
