# Ajustes de dietas en texto con IA

## Uso

En «Revisa y edita tu propuesta», «Ajustar con IA» guarda primero las ediciones manuales. Permite solicitar otra dieta completa o seleccionar uno o varios tiempos y describir el cambio. Se trabaja sobre la dieta seleccionada del mismo plan.

La respuesta muestra texto anterior/propuesta, estimaciones antes/después, aporte de los tiempos seleccionados dentro del día, totales diarios y diferencias frente a la meta para alimentos. Las metas descuentan suplementos cuando corresponde, igual que la generación inicial. Los valores son estimaciones del modelo, no un análisis verificado. Un nutriente que no pueda estimarse queda como desconocido; su total no se representa como cero.

Aceptar conserva los identificadores, títulos y textos de las otras dietas. El servidor construye el resultado parcial reemplazando exclusivamente los cuerpos de los tiempos seleccionados en el texto original guardado. Los índices se resuelven con encabezados inequívocos y las posiciones corresponden a la cadena original, incluso con tildes o emoji. Si una edición manual eliminó los encabezados, el profesional puede restaurarlos o solicitar una dieta completa. No se reconstruyen comidas no seleccionadas usando una respuesta del modelo.

La dieta aceptada queda sin aprobar y se invalida el carrito anterior. La revisión conserva las marcas locales de las otras dietas y pide revisar la modificada. La publicación y el carrito usan el flujo actual.

## Contexto y respuesta

`ai_text_diet_edit_source` es un lector exclusivo del servicio. Usa las validaciones actuales de propietario, paciente, plan y revisión de `ai_text_diet_source`. Añade el texto guardado y, si existe, el contexto de preferencias y restricciones de la última generación original aceptada para ese plan. Los datos clínicos vigentes siguen procediendo del lector actual; la ausencia de restricciones no confirma ausencia de alergias. No carga catálogos ni crea equivalentes.

La solicitud `textEdit` usa el feature existente `diet_draft`. Tiene un adaptador específico, una única llamada al proveedor y la misma configuración de modelo. El modelo estima los tiempos originales y entrega únicamente los reemplazos seleccionados con sus estimaciones. El servidor suma el día conservando las estimaciones originales de las comidas que no cambian. No se solicitan totales independientes que puedan contradecir esas sumas.

Las cifras y los supuestos se guardan como metadatos de la propuesta para el profesional, fuera del contrato `TextDiet` compartido con el paciente. El texto de alimentos sigue siendo editable y no incluye cifras etiquetadas como verificadas.

## Recuperación, aceptación y consumo

El ajuste usa las reservas, firma de contexto, clave de idempotencia, liquidación y metadatos del proveedor actuales. La clave incluye alcance, dieta, tiempos e instrucción. Los tokens reales se contabilizan bajo dietas; no se altera el contador ni se cobra por consultar, aceptar o descartar una propuesta existente.

La respuesta se conserva en `ai_diet_snapshots`, con acceso exclusivo por propietario mediante el Edge autenticado. El navegador recuerda la solicitud pendiente y consulta su resultado antes de permitir otra. Un estado todavía desconocido no se interpreta como autorización para volver a generar.

La aceptación utiliza `ai_text_diet_draft`, con validación de estado de borrador, revisión, prescripción y firma del contexto. Si el plan o su consulta cambian mientras se genera, se conserva la propuesta y se impide sobrescribir esos cambios. Un fallo de red al aceptar permite repetir la misma aceptación sin otra generación.

## Alcance de comprobación

Se ejecutan comprobaciones de TypeScript, lint, Deno y compilación. No se ejecutan generaciones pagadas de pacientes ni se añaden o ejecutan pruebas automatizadas sin solicitud del usuario.
