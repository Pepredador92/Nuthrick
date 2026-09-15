# Taller de dietas · Objetivo 8: revisión y publicación

## Modelo de trabajo

`nutrition_plans` es siempre el borrador editable. Cada publicación crea una
fila independiente en `nutrition_plan_versions`; nunca se actualiza ni se
elimina desde el cliente. `nutrition_plans.current_version_id` señala la última
versión publicada sin convertir el borrador en una copia histórica.

Una versión conserva únicamente el contexto clínico necesario para verla:

- identidad del plan, paciente, profesional y consulta;
- prescripción energética, macronutrientes, equivalentes y tiempos;
- calendario aplicado de uno a siete días, con sus snapshots de alimentos y
  preparaciones; y
- versión del esquema y reglas de validación.

No guarda el banco de opciones que no fue aplicado, catálogos completos ni
información interna de la exploración.

## Reglas de publicación

La función `publish_nutrition_plan_version` es la autoridad de publicación.
Verifica el propietario autenticado, bloquea el borrador, compara la revisión
esperada, valida los datos persistidos y toma el snapshot en el servidor. Exige
objetivo energético, macronutrientes completos, equivalentes confirmados,
tiempos y menú confirmados, y un calendario consistente.

Cada solicitud incluye una llave de idempotencia. Reintentar la misma solicitud
devuelve la misma versión; publicar contenido idéntico a la versión vigente no
crea una versión extra. Los cambios del borrador aumentan `draft_revision` para
detectar ediciones simultáneas.

Las personas autenticadas sólo pueden leer sus propias versiones. No tienen
permiso directo para insertarlas, actualizarlas, borrarlas ni modificar el
puntero de versión actual. La función expuesta usa `SECURITY DEFINER` de forma
intencional, con `search_path` fijo, ejecución sólo para `authenticated` y una
comprobación explícita de `auth.uid()` y del propietario del plan.

## Experiencia

El sexto paso, **Revisión**, concentra pendientes accionables, el calendario
aplicado, la prescripción y una vista diseñada para el paciente. No propone ni
altera comida automáticamente. Para borradores antiguos sin calendario hay una
acción explícita que prepara un único día usando únicamente opciones ya
confirmadas. La publicación requiere una confirmación final y el historial se
abre en modo de sólo lectura.
