# Captura de estatura en ficha y consulta

Corrección del 19 de octubre de 2026.

## Causa

La pantalla de mediciones excluía expresamente el código `height` al construir los campos visibles, aunque estuviera seleccionado en el espacio profesional. La ficha tampoco incluía la estatura en el formulario publicado. Las primeras adiciones estaban únicamente en cambios locales pendientes.

## Comportamiento

- En la ficha, **Editar datos → Estatura (cm)** permite registrar, corregir o retirar una estatura. Al guardar, el valor aparece en Información del paciente y se conserva al volver a editar.
- En Mediciones, **Altura** es el nombre actual del catálogo de producción. Cuando está en el espacio de trabajo se muestra, incluso si el seguimiento individual del paciente no la incluye. Conserva el orden del espacio.
- Se presenta la estatura de la ficha como referencia cuando la consulta aún no tiene una captura propia. Una captura guardada en la consulta tiene prioridad en el campo. Abrir la pantalla no crea mediciones ni actualiza la ficha.
- Modificar Altura actualiza la vista previa de los cálculos. **Guardar mediciones** registra la captura y actualiza la estatura de la ficha antes de conservar los cálculos que dependen de ella. El resto de la consulta recibe el paciente actualizado.
- Dejar Altura vacía de forma explícita retira la estatura de la ficha; guardar otras mediciones sin tocarla no modifica ese dato.
- Ambos accesos respetan el rango existente de la ficha: 20 a 300 cm. Los errores del formulario se muestran junto a sus acciones y conservan lo escrito. Si falla la actualización de la ficha después de guardar mediciones, la captura continúa pendiente y permite reintentar antes de guardar los cálculos.

La base de datos ya contiene `patients.height_cm`, su restricción de rango y los permisos de actualización. El catálogo activo tiene el código `height`; no se requiere una migración ni cambios de permisos. La validación de cálculos exige que la estatura enviada coincida con el dato de la ficha, de ahí el orden de guardado.

## Verificación

Las pruebas de ficha y mediciones cubren visibilidad con seguimiento personalizado, orden del espacio, estatura ausente o existente, guardado, cálculo con el valor nuevo, retirada explícita, validación y recuperación ante fallos. El navegador se revisa con los componentes reales en `tests/visual/patient-adjustments.html`, usando exclusivamente datos ficticios y guardado simulado.
