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

## Etapa 2 completada · confirmación manual

Navegación disponible con metas incompletas; Tiempos y opciones vacías pueden confirmarse; calendario permite tiempos pendientes. Revisión convierte la completitud nutricional en avisos. La publicación mantiene permisos/entitlements, cantidades válidas, snapshots, concurrencia e idempotencia. Las indicaciones manuales ya admitían texto libre y no precisaron cambios.

Verificación: 100 pruebas focales finales, typecheck, ESLint focal y diff check correctos. Pruebas SQL locales con rollback: publicación incompleta, idempotencia, valores inválidos, snapshots ausentes, revisión y propietario. Docker falló por filesystem de sólo lectura; se utilizó PostgreSQL 16 aislado en `/tmp/nuthrick-supplements-pg`.

## Etapa 3 · biblioteca y catálogo

La prescripción se añadirá como `macro_distribution.supplements` (opcional). Reutiliza la cola de guardado, revisión y snapshot existentes, sin columna paralela ni un segundo sistema de persistencia. Cada selección guarda una copia independiente del producto y su etiqueta; la biblioteca usa `supplement_products`, con catálogo de lectura y productos privados protegidos por RLS.

Catálogo inicial GNC México, etiquetas inspeccionadas el 3 de octubre de 2026. Porción = medida del envase, nunca una conversión de cucharada doméstica. Las kcal son las declaradas en la etiqueta; no se sustituyen por una fórmula de macros (las reglas de etiquetado pueden producir diferencias).

| SKU | Producto / presentación | Porción | kcal | C (g) | P (g) | G (g) | Fuente de etiqueta |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 106306005 | Isopure Zero Carb, vainilla, 3 lb | 32 g / 1 medida | 104.5 | 0 | 25 | 0.5 | [GNC](https://gnc.com.mx/media/catalog/product/1/0/106306005_01_02.jpg) |
| 107206001 | ON Gold Standard 100% Whey, chocolate, 5 lb | 31 g / 1 medida | 121.5 | 3 | 24 | 1.5 | [GNC](https://gnc.com.mx/media/catalog/product/1/0/107206001_01_02.jpg) |
| 100101039 | GNC Total Lean Shake 25, vainilla, 832 g | 52 g / 1 medida copeteada | 180 | 19 | 25 | 3 | [GNC](https://gnc.com.mx/media/catalog/product/1/0/100101039_b_2_.jpg) |
| 107206013 | ON Serious Mass, chocolate, 6 lb | 340 g / 2 medidas | 1258 | 251 | 50 | 6 | [GNC](https://gnc.com.mx/media/catalog/product/1/0/107206013_01_02.jpg) |
| 100106052 | GNC Pro Performance 100% Whey, vainilla, 408 g | 30.77 g / 1 medida | 117 | 2 | 25 | 1 | [GNC](https://gnc.com.mx/media/catalog/product/1/0/100106052_02.jpg) |

No es el catálogo completo de GNC ni implica recomendación de consumo. No se transfieren nutrientes entre productos, países o sabores. Las instrucciones y la cantidad diaria las define el profesional. Los productos manuales requieren kcal y macros explícitos, incluso cero; nunca se interpreta un campo vacío como cero. Gramos/scoops sólo se habilitan si existe conversión conocida. La fuente y fecha permanecen visibles para revisión.

Pruebas SQL locales transaccionales: catálogo legible, referencia no editable, biblioteca privada, acceso cruzado y anónimo rechazados, cantidades negativas rechazadas. Pruebas del modelo: conversión de unidades, suma, decimales, exceso sin negativos, entradas inválidas y compatibilidad con planes previos.

## Etapa 4 · selección, dosis y metas de alimentos

`SupplementEditor` incorpora buscador, catálogo GNC México, biblioteca propia y formulario manual. Admite varios suplementos, porciones/scoops/gramos con conversiones conocidas, decimales con punto o coma, edición de indicaciones y eliminación. Usa el mismo autosave de Macros, incluyendo la descarga de cambios pendientes antes de navegar.

`foodTargetsFor` centraliza el descuento. El motor de equivalentes y el menú reciben sólo lo destinado a alimentos; las metas originales permanecen en Macros. La generación automática usa también ese contexto reducido, sin enviar marcas ni instrucciones de suplementos al modelo. El exceso se muestra como aviso y el objetivo alimentario nunca es negativo. Restablecer macros conserva suplementos. Un campo JSON opcional se incluye automáticamente en las versiones existentes; la base comprueba estructura, valores y conversiones antes de guardar.

Verificación: pruebas de búsqueda, captura manual, decimales, conversiones y persistencia tras remontar el editor; contexto de generación limitado a alimentos; SQL con publicación e idempotencia conserva el suplemento. Revisión visual del modal a 390 px y escritorio, compilación de producción y typecheck correctos. Sin dependencias nuevas ni cambios de fórmulas SMAE.
