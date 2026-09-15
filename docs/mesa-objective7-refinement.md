# Objetivo 7: mesa contextual, exploración y biblioteca

## Alcance e inventario previo

Se reutilizan `DietMenuStep`, `MenuEditors`, `MenuWeekPlanner`, el calculador de
equivalentes, banco de opciones y calendario existentes. El punto de partida era
128 alimentos globales (42 iniciales + 86 curados) y 24 recetas globales, comprobado
en Supabase `qlsqhvyrslclmlstlemn`. No se implementa el Objetivo 8.

Se conservan siete opciones como máximo por tiempo, siete días como máximo,
confirmación independiente, adaptación de planes anteriores y snapshots semanales.
Una opción no se suma a sus alternativas. Menú no cambia energía, macros ni la
prescripción diaria o distribución por tiempos.

## Experiencia y estado

- Resumen por tiempo: número de opciones, confirmadas y por completar. Contexto de
  tiempo y opción visible sobre la mesa.
- Acción principal contextual: Proponer, Completar el grupo pendiente, Revisar
  exceso, Aplicar, Confirmar opción o Agregar otra opción. Confirmar no navega ni
  crea otro borrador. Se ofrece el siguiente tiempo pendiente explícitamente.
- Cantidades resumidas siempre visibles; intercambio, cantidad editable y quitar
  dentro de “Revisar o ajustar”. Los excesos llevan al componente aportante y
  enfocan su cantidad. Los pendientes abren la despensa en el grupo exacto.
- Diálogos nativos: Escape cierra y devuelve el foco al control de apertura.

La exploración se aísla por plan/tiempo/opción. Conserva historial editable,
firmas vistas, rechazos e intención de edición por separado. Se recupera al
cambiar de tiempo u opción durante la sesión; no se promete persistencia tras
recargar la aplicación.

Quitar un alimento de la vista previa impide reintroducirlo automáticamente,
también dentro de una receta. Quitar una preparación rechaza su composición,
no todos sus ingredientes. Deshacer la edición restaura su rechazo previo.
Restablecer alternativas limpia rechazos sin tocar exclusiones ni la memoria
de composiciones ya vistas. Quitar del menú aplicado no crea rechazos.

Otra propuesta trabaja sobre la vista previa editada. Conserva lo mantenido,
intercambiado, agregado o ajustado por el profesional. Reorganizar conserva solo
los elementos fijados explícitamente. Si se conserva una comida ya completa, se
explica que se puede reorganizar. Las restricciones nunca se relajan para llenar.

Aplicar y deshacer afectan solo a la opción activa; no restauran versiones viejas
de otros tiempos ni del calendario. Explorar, navegar, editar o rechazar en vista
previa no llama al guardado. Guardar una preparación en biblioteca es una acción
explícita distinta, que no se revierte al descartar la propuesta.

Cambios de distribución, preferencias o fuentes relevantes invalidan el historial
antes de aplicarlo. Guardar una preparación nueva durante la exploración no
destruye la vista previa abierta. La generación evalúa como máximo **96 candidatos**
deterministas por solicitud; no se afirma haber agotado todas las combinaciones.
Las firmas usan ingredientes efectivos y cantidades normalizadas, no nombres,
IDs de recetas copiadas, orden ni timestamps. Se agrupan diferencias de hasta el
paso de 0.05 equivalentes para no vender pequeñas variaciones como comidas nuevas.

El planificador conserva las tolerancias existentes. Entre ajustes cercanos se
prefiere una preparación reconocible frente a alimentos sueltos; no se oculta un
exceso. No se penaliza indiscriminadamente compartir grupo o familia. La despensa
ordena por compatibilidad/cantidad práctica, preferencias y repetición, dejando
la frecuencia como criterio secundario. No presupone disponibilidad.

## Catálogo y fuentes

La conciliación individual de 179 candidatos se encuentra en
[smae-candidate-decisions.json](smae-candidate-decisions.json). Totales: 85 ya
incorporados, cuatro nuevos, 32 alias, dos presentaciones, 15 conflictos, cinco
excluidos y 36 diferidos. Véase [el detalle SMAE](smae-curated-expansion.md).

Se añaden cheddar, Chihuahua, Cotija y asadero; el global queda en 132 filas,
131 activas. Chía queda pendiente de aclaración, sin eliminar usos previos.
Mitades tienen unidad de cálculo propia. Tercios documentados conservan fracción
racional y expresión original. Se retira únicamente la presentación de atún de
“⅓ lata” sin tamaño; se mantiene su porción canónica en gramos. La lectura del
catálogo pagina hasta completar los alimentos accesibles, sin truncarlos a 250.

El libro original SMAE 4.ª edición 2014 sí se encontró y se cotejaron visualmente
las filas citadas en esta revisión. Los demás candidatos no se presentan como
verificados contra el original. No se inventan nutrientes ni conversiones;
los aportes siguen siendo promedios del grupo, no análisis de cada alimento.

## Inventario culinario

**Los once PDF de planes no estaban disponibles como archivos adjuntos accesibles
en esta sesión.** No se atribuye a ellos una extracción. Las familias se basan en
el texto autorizado; las nuevas cantidades están identificadas como decisiones
editoriales revisables. No hay nombres, diagnósticos, tratamientos, suplementos,
datos de contacto ni reglas de etapas clínicas en las semillas nuevas.

| Familia | Existentes conservadas | Nuevas / decisión |
| --- | --- | --- |
| Huevos | Huevos con frijoles; huevos con nopales | Huevos con champiñones y aceite medido |
| Avena | Avena con plátano; avena con fruta y crema de cacahuate | Avena con plátano, leche y crema de cacahuate; huevo como acompañamiento independiente |
| Molletes y pan | Molletes con frijoles y panela; pan tostado con huevo y aguacate | No duplicar por fruta o yogur servido aparte |
| Tostadas | Huevo/frijoles; atún; atún/frijoles | No duplicar por cantidad; fruta/yogur se agregan a la opción por separado |
| Tacos | Pollo; carne | Tacos de huevo con queso |
| Quesadillas | Pollo; bistec/nopales; frijoles/huevo | Frijoles con queso: cambia realmente el ingrediente, no el rendimiento |
| Pollo | Pasta/verduras; arroz/verduras; arroz/frijoles; tortillas/aguacate | Pollo con verduras como principal modular; arroz, frijoles y tortillas independientes |
| Carne | Pasta/verduras; arroz/verduras; papa | Carne con verduras como principal modular |
| Ensaladas | Arroz/pollo; arroz/atún; pescado cocido | Pescado conserva cocción completa; se corrige el nombre ambiguo anterior |
| Pasta/pescado | — | Pasta con pescado cocido, verduras y aceite medido |
| Bebidas | Agua y bebidas estructuradas del motor existente | Licuado de plátano con leche; aporta leche y fruta exactamente una vez |

Total: **24 recetas existentes + ocho nuevas = 32 recetas globales**. Las ocho
nuevas contienen 25 ingredientes estructurados, rendimiento de una ración,
tipos de tiempo y procedencia editorial. Se corrigen instrucciones de nueve
preparaciones existentes para no introducir aceite, verduras o aderezos no
contabilizados; se sustituyen indicaciones universales de sustitución por revisión
y recálculo. Los ingredientes de recetas personales y snapshots aplicados no cambian.

No se multiplica toda una opción para ajustar un acompañamiento: la receta y
los componentes separados usan las operaciones existentes. Dentro de una receta
se conserva el editor de ingredientes. Las opciones A/B son variantes excluyentes
del banco, nunca la suma de ambas; confirmar/asignar requiere validar cada opción.

Pendientes de fuentes: comprobar los once originales, técnica real de cada plato,
ambigüedades de lata/leche/verduras/aceite y correspondencias de versiones. No se
promedian cantidades de pacientes ni se incorporan suplementos particulares.
No se infieren sabor o aceptación a partir de una prueba matemática.

## Migración y controles

`20260915183530_reconcile_portions_and_editorial_preparations.sql` es aditiva e
idempotente, con guardas de propiedad global. No elimina filas, no cambia políticas
ni reescribe planes o ingredientes históricos. La primera migración de 86 alimentos
ya estaba aplicada antes de esta revisión; no se repite esa importación.

Pruebas de base de datos: 40 de catálogo/RLS y 11 de conciliación/editorial,
incluyendo alimentos personales escribibles solo por su propietario y globales
no modificables por `authenticated`. Reaplicar la migración no duplica alimentos,
recetas ni ingredientes.

Pruebas de frontend: TypeScript, ESLint, suite del módulo y build. La suite completa
tenía un fallo previo en el título del landing con cambios ajenos; se conserva sin
modificarlo. Las capturas y datos del navegador son ficticios y no se publican.

Recorridos reproducibles en `frontend/tests/visual/`:

- `exploration-check.mjs`: guayaba → manzana → pera, cantidades de huevo/tortilla,
  rechazo/deshacer, cambio de tiempo/opción, ningún guardado exploratorio,
  confirmación sin navegar, movimiento reducido, Escape/foco y 320–1440 px.
- `mesa-check.mjs`: agregar/intercambiar, receta seleccionada/rendimiento,
  biblioteca independiente, bebidas, A/B/A, aplicar/descartar/deshacer y vista clásica.
- `week-check.mjs`: tres desayunos/cinco comidas/una cena, calendario de cinco días,
  fijaciones con teclado, navegación móvil, snapshots, borrador y deshacer.

Las comprobaciones de navegador demuestran comportamiento de controles y ausencia
de desbordamiento en esos recorridos; no sustituyen una prueba de usabilidad con
nutriólogos ni aseguran cualquier combinación clínica.

## Estado de entrega

- Implementación: `46afb8d`, subida a `origin/main` junto con la ampliación previa
  `609b790`, sin force push. LandingPage y `output/` quedaron fuera.
- Vercel: despliegue `dpl_F711MDhAVsXT9px323CMcC5Bnzdk`, estado **Ready**, alias
  `https://nuthrick.vercel.app`, comprobado el 15/09/2026.
- Migración remota aplicada correctamente; el archivo local adopta el timestamp
  asignado por Supabase (`20260915183530`), con el mismo contenido probado.
- Resultado remoto: 132 alimentos globales, 131 activos; 32 recetas globales;
  25 ingredientes de las ocho nuevas preparaciones. RLS sigue activado en alimentos,
  recetas, ingredientes y planes. No se modificaron políticas.
- Los hashes de los dos planes originales y de las recetas personales son iguales
  antes/después. Se creó un plan libre ficticio, sin paciente, exclusivamente para
  QA y después se archivó de forma reversible para no dejarlo entre los borradores.
- Navegador publicado, con sesión existente: abrir Menú, cargar catálogo, generar,
  retirar ciruela y obtener durazno conservando arroz/huevo, aplicar, confirmar sin
  navegar, organizar/aplicar un calendario de un día. Consultas de solo lectura
  comprobaron menú nulo durante exploración, guardado tras aplicar, estado confirmado
  y calendario de un día tras aplicar. La distribución era una fixture simplificada;
  esto no valida la prescripción energética ni representa un plan para un paciente.
- Verificación local: TypeScript, ESLint y build correctos; **443 pruebas** en
  49 archivos excluyendo el landing ajeno; **51 comprobaciones SQL** de catálogo/RLS.
  La suite completa produjo 445 correctas y un fallo previo del título del landing.
- Persisten dos avisos de seguridad preexistentes, sin avisos nuevos de esta
  migración: función de reapertura de consulta ejecutable por autenticados
  ([explicación](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable))
  y protección contra contraseñas filtradas desactivada
  ([explicación](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).
  No se cambiaron credenciales ni configuración de autenticación en esta tarea.
