# Textos clínicos completos

La revisión del 30 de octubre de 2026 encontró dos causas distintas:

- El contrato de generación de objetivos limitaba varios campos a 140 caracteres, el plazo a 80 y el seguimiento a 180. Había respuestas JSON completadas que ya contenían frases cortadas exactamente en esos límites. Esos textos también podían pasar a las estrategias al reutilizar el objetivo.
- Las tarjetas de estrategias ocultaban el contenido después de dos líneas. Varios campos del editor se presentaban como inputs de una sola línea aunque admitían hasta 1500 caracteres.

La generación de objetivos utiliza ahora los 400 caracteres por campo que ya admiten el editor y la persistencia. El prompt pide una oración breve y completa, sin llenar el espacio disponible. El esquema exige un signo de cierre en el texto generado; el campo de viabilidad puede seguir vacío. Esta comprobación evita entregar frases sin cierre o con puntos suspensivos, pero no reemplaza la revisión profesional de su significado.

La normalización conserva el texto sin recortarlo. Añadir un punto a una meta o plazo literal no cambia su clasificación como acuerdo documentado; sus palabras y parámetros deben seguir presentes en una fuente citada. La validación de cifras clínicas y evidencia continúa activa.

Las tarjetas muestran completo el nombre y la acción. Los campos de estrategias permiten varias líneas, y los textareas de objetivos y estrategias crecen con el contenido hasta una altura máxima con scroll. El camino antiguo de objetivos de texto libre tampoco usa `slice` al agregar una propuesta.

No se cambia el modelo, el presupuesto de tokens ni la liquidación del consumo. Las propuestas de objetivos inválidas mantienen el mecanismo existente de devolución de créditos, conservando el consumo real para administración. Los registros clínicos guardados anteriormente no se reescriben: el fragmento faltante requiere una revisión profesional o una nueva propuesta basada en sus fuentes.

Validación: pruebas de regresión con objetivos que superan los límites anteriores, rechazo de texto incompleto, conservación de evidencia y acuerdos, y comprobación del flujo de consumo/devolución sin llamadas al proveedor. También se verifican los componentes de objetivos y estrategias y el build del frontend.
