# Módulo de Laboratorios

## Propósito y límites

Laboratorios es un módulo independiente dentro de la consulta, situado después de **Mediciones**. Registra fielmente un reporte externo; no realiza diagnósticos, fórmulas derivadas, interpretación clínica avanzada, OCR, lectura de PDF/CSV, integraciones, HL7/FHIR/LIS ni gráficas de evolución.

La identidad documental es `reporte → resultado`. Un resultado nunca se guarda en `consultation_measurements`, por lo que una glucosa sérica de laboratorio no se mezcla con una glucosa capturada por otro método.

## Catálogo auditado

Se reutiliza `measurement_types` con `category = 'laboratory'`. La auditoría de la migración inicial verificó **86 analitos estándar** organizados en:

- control glucémico;
- perfil lipídico;
- función hepática y proteínas;
- función renal y nitrogenados;
- electrolitos/minerales;
- biometría hemática (serie roja, blanca y plaquetas);
- perfil tiroideo;
- vitaminas/estado nutricional;
- examen general de orina.

Los códigos existentes no se eliminan ni se reemplazan. Se añadió `GOT` como sinónimo de `AST / TGO`; la búsqueda utiliza código, nombre visible, nombre clínico y sinónimos. El catálogo estándar continúa siendo de solo lectura para profesionales.

## Modelo de datos y procedencia

`laboratory_reports` guarda paciente, consulta, nombre del estudio, laboratorio de origen, fechas de toma y reporte, hora, ayuno y horas, muestra, método/equipo, notas, identificador externo y origen de captura.

`laboratory_results` guarda el `report_id`, paciente, consulta y el analito estándar (`analyte_id`) o uno personalizado (`custom_analyte_id`). Conserva la unidad original, valor original, comparador, intervalo textual, límites estructurados, unidad del intervalo, flag reportado por el laboratorio y notas.

Cada resultado toma un snapshot de código, nombre visible, nombre clínico y sinónimos. Ese snapshot no cambia cuando se edita el catálogo posteriormente, ni al editar el valor del resultado. Varios reportes pueden coexistir en una consulta y el mismo analito puede aparecer una vez por cada reporte.

`laboratory_custom_analytes` permite una prueba no presente en el catálogo. Es privada del profesional y recuerda el primer reporte donde se creó; no altera ni publica el catálogo estándar.

## Tipos y rangos

Los tipos soportados son:

- numérico, incluido `<`, `>`, `<=` y `>=`;
- cualitativo;
- ordinal/semicuantitativo;
- texto libre.

El texto original se preserva, por ejemplo `<0.01`, junto con el comparador y el valor numérico cuando corresponde. Para los intervalos se conserva siempre el texto copiado del reporte; adicionalmente puede registrarse mínimo, máximo, inclusividad y unidad.

La comparación automática sólo indica `dentro del intervalo reportado`, `por debajo`, `por encima` o `sin comparación automática`. Solo se calcula para un valor numérico sin comparador, con intervalo estructurado y unidades coincidentes. No convierte unidades ni es un diagnóstico.

## Plantillas

`laboratory_panel_templates` y `laboratory_panel_template_items` mantienen perfiles como atajos de selección. Los perfiles estándar son:

- Perfil lipídico
- Función hepática
- Función renal
- Perfil tiroideo
- Biometría hemática
- Examen general de orina

Una plantilla agrega campos al borrador de pantalla; no crea filas clínicas hasta que el profesional escribe un resultado. No se incluye una definición universal para paquetes comerciales ambiguos, por ejemplo “QS 12”. La arquitectura admite plantillas privadas posteriormente, pero esta primera versión solo expone los perfiles estándar.

## Seguridad e integridad

Las cinco tablas nuevas tienen RLS habilitado, permisos explícitos para `authenticated` y políticas por `professional_id`. Los triggers validan además que:

- la consulta y el paciente pertenecen al profesional;
- el reporte pertenece exactamente a esa consulta y paciente;
- cada resultado pertenece a ese reporte;
- un analito estándar esté activo y sea de categoría laboratorio;
- un analito personalizado sea del mismo profesional;
- solo se pueda crear, editar o eliminar mientras la consulta sea borrador.

Así se protege contra IDs enviados desde el cliente que pertenezcan a otro profesional, paciente, reporte o analito personalizado. Al borrar un reporte se eliminan únicamente sus resultados y la interfaz pide confirmación.

## Evolución futura preparada

La combinación de analito estable, unidad original, muestra, método, laboratorio, fechas y rango histórico permite crear una evolución posterior sin unir automáticamente unidades o métodos distintos. La carga de archivos, OCR, importaciones e interpretaciones se diseñarán como objetivos separados.
