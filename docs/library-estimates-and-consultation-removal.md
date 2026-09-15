# Biblioteca estimada y retirada segura de consultas — 15 septiembre 2026

## Biblioteca

Las 21 bases importadas conservan sus identificadores. Sus nombres públicos ya no contienen códigos ni «PDF». Solo se actualizan bases globales de la importación original; no se tocan copias privadas ni versiones publicadas.

- Cada base tiene kcal/día, proteína, grasa y carbohidratos en gramos. Las tarjetas muestran también el porcentaje energético 4/4/9, con colores por macronutriente.
- Se mantienen los ingredientes, equivalentes, distribución en tres tiempos, opciones y calendario nativo de un día. Las sugerencias existentes pueden compararlas por energía y los tres macros.
- Las cifras están marcadas como aproximadas. La energía promedio del catálogo y la energía 4/4/9 de los objetivos de referencia pueden diferir; no se sustituye ninguna por la meta impresa en el documento.
- Supuestos visibles: carne/pescado como peso cocido; atún de 100 g drenados por lata; tipos de lácteos y fruta genérica explicitados; una sola alternativa cuando el original ofrece «A o B»; guarniciones sin cantidad estimadas de manera documentada.
- Se omiten suplementos de proteína. No se agrega aceite/azúcar no documentado. Una cucharadita de aceite y una naranja indicadas en preparaciones se incluyen explícitamente donde corresponde.
- Avena seca: conversión doméstica 40 g = ½ taza, de [Quaker SmartLabel](https://smartlabel.pepsico.info/030000010204-0001-en-US/index.html); nutrientes según el catálogo de equivalentes de Nuthrick, no una mezcla de tablas por marca.
- La procedencia de estimación acompaña la copia al borrador y al volver a guardarla en biblioteca. Revisar las cantidades y adecuación clínica antes de asignar al paciente.

El importador distingue `--sql` (inserción idempotente) de `--sql --update` (actualizar exclusivamente las bases originales). `source_key` es interno. `import_version: 2` evita repetir la actualización o incrementar revisiones al reintentar. La validación de biblioteca admite solo la nueva propiedad acotada `estimation`; mantiene la prohibición de campos clínicos.

## Consultas

La función previa combinaba RLS que permitía borrar solamente borradores con un borrado físico. Una consulta completada podía no resultar afectada; las versiones de planes publicados referenciaban su consulta con `ON DELETE RESTRICT`. Además, el borrado físico podía arrastrar mediciones modernas por cascada.

La acción mantiene su ubicación pero explica que retira la consulta de la lista:

- `deleted_at` identifica la retirada; los borradores pasan a `cancelled` para liberar el espacio de una nueva consulta.
- No se borran ni desvinculan cuestionarios, mediciones, laboratorios, notas o planes.
- `listConsultations` filtra retiradas tanto para consultas recientes como para el historial y la apertura de la consulta.
- Evolución conserva los datos y su fecha/procedencia, identifica la consulta retirada y deshabilita su apertura.
- Reintentar es idempotente. Reabrir una consulta retirada queda bloqueado.
- Función de alcance limitado con comprobación de identidad/propiedad, bloqueo de la fila y permisos solo para usuarios autenticados. No se amplían políticas de edición generales.
- Éxito y error se muestran dentro del historial abierto; un error no retira la fila de la pantalla.

## Verificación

- Importación: 21 bases completas, nombres únicos, objetivos coherentes, alternativas no sumadas y estimaciones conservadas al copiar.
- Integración local: actualización dos veces conserva IDs, incrementa una sola revisión y no modifica bibliotecas privadas.
- Integración local de consultas: completada con plan publicado, borrador, reintento, acceso ajeno, identidad ausente, reapertura bloqueada y creación posterior de otro borrador.
- Prueba transaccional en Supabase: paciente, consultas, medición y versión publicados ficticios; todo revertido. No se eliminó ninguna consulta real. Las 11 consultas y 3 versiones publicadas existentes quedaron intactas, y coincidió la huella de las copias privadas antes/después.
- Revisión visual: 21 tarjetas y detalle en 320, 390, 768 y 1440 px, sin desbordamiento del diálogo.
- Compilación, comprobación de tipos y lint correctos. Suite general, excluyendo la prueba de LandingPage afectada por cambios locales ajenos a esta tarea, correcta. Ese cambio ajeno no se incluye en el commit.
- Asesor de seguridad: RPC definer autenticada intencional, con autorización y pruebas de aislamiento. Avisos preexistentes de protección de contraseñas filtradas desactivada y tablas privadas sin políticas no se modificaron. Asesor de rendimiento: índices no utilizados y FKs sin índice preexistentes, fuera del alcance.

Migraciones locales `20260915225419_archive_consultations_safely` y `20260915230211_estimate_system_library_diets`; registradas por Supabase con versiones remotas `20260915230745` y `20260915230747` respectivamente.
