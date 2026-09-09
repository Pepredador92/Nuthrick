# Catálogo y motor de energía

El módulo `frontend/src/features/energy` concentra las definiciones y los cálculos energéticos que utilizará el Taller de dietas. No contiene componentes React, no prescribe un objetivo calórico y no persiste resultados en `nutrition_plans`.

## Separación de conceptos

- **Gasto basal o en reposo:** resultado medido o estimado por una ecuación predictiva.
- **Actividad:** se calcula con un factor clínico o con un PAL; ambos métodos son excluyentes.
- **ETA:** componente configurable y trazable. Sólo se suma por separado cuando el método de actividad no la integra.
- **GET:** resultado del gasto basal más el método de actividad y, cuando corresponde, ETA.
- **Objetivo prescrito:** decisión profesional posterior; no forma parte de este motor.

## Métodos energéticos disponibles

| Código | Tipo | Inputs | Salida y población |
| --- | --- | --- | --- |
| `MIFFLIN_ST_JEOR_1990` | Ecuación predictiva | peso kg, talla cm, edad, sexo de ecuación | REE en kcal/día; muestra original de 19 a 78 años. Fuera del rango calcula con advertencia. |
| `HARRIS_BENEDICT_ORIGINAL_1919` | Ecuación predictiva | peso kg, talla cm, edad, sexo de ecuación | BMR en kcal/día; conserva los coeficientes originales. |
| `HARRIS_BENEDICT_ROZA_SHIZGAL_1984` | Ecuación predictiva | peso kg, talla cm, edad, sexo de ecuación | REE en kcal/día; revisión de 1984, separada de la fórmula original. |
| `VALENCIA_MEXICO` | Ecuación predictiva | peso kg, edad, sexo de ecuación | BMR en kcal/día; selecciona y reporta la variante mexicana por sexo y grupo de edad adulto. |
| `SCHOFIELD_WEIGHT_1985` | Ecuación predictiva | peso kg, edad, sexo de ecuación | BMR; selecciona uno de 12 grupos. Calcula primero en MJ/día y convierte al final a kcal/día. |
| `FAO_WHO_UNU_FRAMEWORK` | Marco de referencia | ninguno | No calcula basal por sí mismo; se relaciona explícitamente con Schofield y PAL. |
| `MANUAL_ENERGY_TARGET` | Objetivo manual | ninguno en este motor | Identifica una prescripción directa futura; no se presenta como ecuación. |
| `MEASURED_INDIRECT_CALORIMETRY` | Medición | ninguno en este motor | Reserva un origen medido futuro; no se presenta como cálculo predictivo. |

Todas las definiciones activas usan `catalogVersion: 1` y `methodVersion: "1.0.0"`. La versión del método debe incrementarse cuando cambie una ecuación, un límite o un comportamiento clínico; un cambio puramente editorial no requiere alterar el método.

## Variantes y límites

Las variantes viven en `catalog.ts`. El motor selecciona la primera cuyo sexo y límites de edad coinciden, respetando si cada límite es inclusivo o exclusivo.

- Valencia: 18–<30, 30–60 y >60 años para cada sexo.
- Schofield: 0–<3, 3–<10, 10–<18, 18–<30, 30–<60 y ≥60 años para cada sexo.
- Mifflin conserva una advertencia de aplicabilidad para edades fuera de 19–78 años, pero no bloquea por esa causa.

El resultado exitoso conserva código, versión, variante, resultado sin redondeo visual, unidad, inputs de origen, constantes usadas, advertencias y referencias. Schofield conserva además el resultado original en MJ/día y la constante central `MJ_TO_KCAL = 239.005736`.

## Actividad y ETA

`CLINICAL_ACTIVITY_FACTOR` ofrece sugerencias versionadas: sedentaria 1.20, ligera 1.375, moderada 1.55 e intensa 1.725. El motor conserva el factor sugerido, el utilizado y si hubo override. La energía de actividad es `basal × (factor − 1)`.

`PAL_FAO_WHO_UNU` contiene los rangos 1.40–1.69, 1.70–1.99 y 2.00–2.40. El catálogo no guarda ni el motor escoge un punto medio oculto: el consumidor debe entregar un PAL concreto. En PAL, `GET = basal × PAL`; la ETA está integrada y no vuelve a sumarse.

El método inicial de ETA es `PERCENT_OF_BASAL`, con una tasa predeterminada configurable de 0.10. En el modo clínico por componentes, `GET = basal + actividad + ETA` cuando ETA está habilitada.

## Errores, advertencias y precisión

Los datos requeridos ausentes, números no finitos, peso o talla no positivos, edad negativa, variantes inexistentes y combinaciones incompatibles devuelven un resultado `ok: false`; no se calculan silenciosamente. Una condición que permite calcular pero exige revisión clínica devuelve `warnings`.

El motor no redondea pasos intermedios. El redondeo pertenece a la interfaz del Objetivo 3.

## Cómo agregar una fórmula

1. Agregar el código al tipo `PredictiveEnergyFormulaCode`.
2. Incorporar una definición en `energyMethodCatalog`, con metadatos, inputs, aplicabilidad, variantes, ecuaciones, versión y una referencia centralizada.
3. Si la ecuación es lineal y usa unidades ya soportadas, no modificar `engine.ts`; el intérprete usa la definición del catálogo.
4. Si requiere otra clase de ecuación o unidad, ampliar el tipo de ecuación y el intérprete de forma explícita, sin introducir lógica en React.
5. Agregar pruebas para todas las variantes, límites, errores y conversiones.

Las referencias bibliográficas canónicas están centralizadas junto a las definiciones en `catalog.ts`; no se duplican aquí. Las limitaciones de cada método permanecen en sus campos `applicability`, `notes` y `warnings`.
