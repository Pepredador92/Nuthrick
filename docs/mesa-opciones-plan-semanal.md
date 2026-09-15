# Nuthrick a la Mesa — opciones por tiempo y plan por días

Iteración del 15 de septiembre de 2026. Amplía el Menú existente, no implementa el Objetivo 8 ni exportaciones nuevas.

## Flujo

- **Opciones por tiempo:** hasta siete alternativas completas e independientes por tiempo. Cada una conserva nombre, entradas, recetas, bebidas, cantidades, snapshots, revisión y confirmación. Crear otra abre un borrador vacío; duplicar copia profundamente con identificadores nuevos. Eliminar tiene deshacer y nunca borra comidas aplicadas.
- **Proponer opción:** el motor existente completa únicamente la opción activa. **Proponer otra composición** permite reemplazar componentes no fijados; **Otra propuesta** recorre alternativas. Vista clásica y mesa editan la misma opción.
- **Confirmar opción:** verifica exclusivamente los grupos de ese tiempo, las cantidades y aportes conocidos, la prescripción confirmada y las exclusiones explícitas. No confirma las demás alternativas. Tras confirmar se ofrece “Agregar otra opción de desayuno” (o el tiempo correspondiente).
- **Plan por días:** automático toma el máximo de opciones confirmadas compatibles por tiempo; selección manual ofrece duración y días concretos de lunes a domingo. Un tiempo con equivalentes pero sin opción compatible bloquea la organización, explicando qué completar.
- Menos días que participantes exige ampliar días o seleccionar explícitamente un subconjunto. No se borran ni se omiten silenciosamente opciones. Un único participante se repite, con un aviso discreto y acceso para agregar otro.

## Organización y revisión

Primero se asignan cuotas equilibradas por tiempo. Sin fijaciones, las frecuencias difieren como máximo en una aparición. Dentro de esas cuotas se prioriza evitar repeticiones consecutivas y después repetir parejas de opciones entre tiempos lo menos posible. El empate se resuelve de forma determinista con una semilla.

Se generan hasta 24 candidatos deterministas y se deduplican por asignaciones reales, no por orden visual. No se promete explorar todas las combinaciones posibles. Las cuotas sin repeticiones tienen una ruta rápida; los demás casos exploran un máximo de 7! posiciones por tiempo. Los snapshots se clonan al construir candidatos, no en cada rama de búsqueda.

Las casillas fijas conservan su contenido aplicado incluso si su opción desapareció del banco. Si la prescripción/exclusión las vuelve incompatibles, se pide revisión o liberarlas. Tampoco se retira silenciosamente un día con casillas fijas. Las fijaciones pueden limitar el equilibrio y la alternancia; no se mueven para mejorar una puntuación.

Cambiar una casilla, fijarla o actualizar apariciones abre una **vista previa**, incluso si se parte de un calendario aplicado. **Volver a organizar** redistribuye opciones y respeta fijaciones: no inventa comidas. Aplicar, descartar, recuperar alternativas y deshacer son explícitos. Explorar no llama al guardado del calendario.

Escritorio: tabla con días en filas y tiempos en columnas, desplazamiento interno si hace falta. Móvil: un día a la vez, selector y botones anterior/siguiente. Los detalles abren un diálogo nativo con cantidades, ingredientes, bebidas, preparación y notas; al cerrar se conserva el día. Controles nativos accesibles con teclado.

## Alcance de las ediciones

El banco y el calendario son entidades distintas:

1. Editar el banco muestra los días donde se usa la opción. Las asignaciones conservan su snapshot; una versión nueva se señala sin aplicarla automáticamente.
2. Desde el calendario se puede actualizar una aparición o todas las apariciones de una opción. Se muestran los días afectados y se previsualiza antes de aplicar.
3. “Variante para este día” crea una copia independiente, dentro del límite de siete. Se edita y confirma; “Usar variante en Lunes” reemplaza únicamente esa casilla. No altera las demás apariciones ni el original.
4. Eliminar una opción usada deja el snapshot aplicado y muestra “Desvinculada del banco”. Los alimentos no desaparecen.
5. Cambiar la prescripción marca las opciones y asignaciones incompatibles para revisión. Cambiar un tiempo no invalida por sí solo otro tiempo cuya distribución permanece igual.

Los totales se calculan **por día**, reutilizando el cálculo de equivalentes y su estimación energética/macronutrimental. No se suman alternativas ni se compara una suma semanal contra un objetivo diario. El agua viaja dentro de su opción sin duplicar aportes; las demás bebidas conservan sus aportes conocidos.

## Arquitectura y compatibilidad

- `types/domain.ts`: `MealOption`, `MenuDayAssignment`, `MenuWeekPlan`; campos opcionales `meal_options` y `week_plan` en `DietMenu`.
- `features/menu/options.ts`: adaptación de planes anteriores, proyección de una opción por tiempo hacia el calculador existente, edición/confirmación y restauración de opciones.
- `features/menu/week.ts`: calendario, cuotas, asignaciones fijas, snapshots, validación y proyección diaria.
- `components/diet/MenuWeekPlanner.tsx`: selección, exploración y calendario responsivo, usando el historial de propuestas existente.
- `DietMenuStep.tsx`: banco y calendario comparten el guardado existente (`useChangeAutosave` → `updateDietPlan`).

La adaptación de planes antiguos es determinista y de solo lectura hasta un cambio real. El contenido del menú activo se convierte en la primera opción de cada tiempo, conservando revisión y cantidades. Las otras variantes de **día completo** se mantienen como tales, sin reinterpretarlas como desayunos. La proyección de compatibilidad conserva solo una opción por tiempo en el menú activo; el banco completo permanece en su campo propio.

No hace falta migración: `nutrition_plans.diet_menu` ya es JSONB y los campos son aditivos. No se cambian tablas, RLS ni autenticación. Se verificó en el proyecto autorizado `qlsqhvyrslclmlstlemn` que RLS está habilitado, con `USING` y `WITH CHECK` ligados a `auth.uid() = professional_id`. Una transacción de solo lectura, bajo `authenticated` con un usuario ficticio, vio cero planes ajenos. No se escribieron datos de pacientes.

Opciones, calendario aplicado, snapshots y fijaciones del calendario se guardan. El historial de exploración, preferencias de visualización y deshacer permanecen en la sesión; no se promete recuperarlos después de recargar. Las copias de recetas en biblioteca siguen siendo guardados explícitos independientes de aplicar o descartar el Menú.

## Comprobaciones

- TypeScript, ESLint y compilación de producción correctos. Pasaron 435 pruebas en 48 archivos al excluir únicamente el archivo de pruebas del landing ajeno a esta tarea.
- Pruebas de modelo: 1/1/1 → un día; 3/5/1 → cinco días; 2/2/2 → siete días; límites 7/7/7; cuotas, alternancia, participación, restricciones, asignaciones fijas y días fijos.
- Pruebas de snapshots: bebidas sin duplicados, edición y eliminación sin cambiar el calendario, cambio de prescripción por tiempo, adaptación de planes antiguos y restauración de confirmación al deshacer una propuesta.
- Pruebas de interfaz: borrador independiente, confirmación, eliminación de la última opción y deshacer, selección explícita de participantes, explorar/aplicar/descartar/deshacer, actualización de apariciones y variante para un único día.
- Chrome aislado con datos ficticios: caso 3/5/1, teclado, diálogo/Escape, navegación móvil sin perder posición, guardados contados y sin desbordamiento a 1440/1024/768/390/320 px.
- Regresión visual del Menú anterior: alimentos, intercambios, recetas, rendimiento, biblioteca, bebidas, A → B → A, aplicar/descartar/deshacer y vista clásica.

Pruebas reproducibles: `frontend/tests/visual/week-check.mjs` y `frontend/tests/visual/mesa-check.mjs`, con la configuración Vite visual en el puerto 4175. La variable `MESA_PLAYWRIGHT_MODULE` permite usar Playwright instalado externamente. Las capturas de QA son locales en `output/mesa-week/` y `output/mesa/`; no son datos reales ni parte del catálogo.

El landing tenía cambios locales ajenos y un test de título desactualizado antes de esta iteración. Se conservaron intactos; ese fallo se informa por separado de las pruebas del módulo. Esta entrega queda local, sin despliegue a producción.
