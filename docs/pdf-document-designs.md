# Dos diseños para exportar PDF

21 de octubre de 2026.

- Actual: conserva las tarjetas, colores, encabezado y pie de página existentes.
- Tradicional formal: página blanca, márgenes de una pulgada, tipografía Times, membrete centrado, secciones numeradas y pie discreto con Nuthrick y paginación. Los párrafos largos continúan en las páginas necesarias.
- Ambos usan los mismos datos clínicos guardados y el perfil del profesional: nombre, título, cédula, consultorio, dirección, contactos y logo cuando existe. Las muestras locales pueden usar datos proporcionados por el usuario; la aplicación no contiene esos datos como valores predeterminados.
- Consulta: Exportar PDF abre una ventana con los dos diseños. El registro formal agrupa el cuestionario y conserva el detalle clínico estructurado, incluidos los estados de aprobación y los borradores identificados.
- Plan publicado: se puede elegir el diseño desde la exportación profesional y desde la descarga del paciente. El servidor acepta únicamente current o formal, conserva la selección autorizada del plan y su profesional y vuelve a comprobar el acceso y la guía compartida antes de entregar el archivo. No permite al paciente seleccionar versiones internas.
- Evolución: la selección del diseño se integra en la ventana existente junto a los indicadores. Las gráficas conservan sus valores, referencias y colores de interpretación; el formato formal usa márgenes y membrete tradicionales.
- El diseño actual es la opción inicial. La elección afecta únicamente a la descarga solicitada. No publica contenido ni modifica el expediente, el plan o las aprobaciones. TXT y LaTeX conservan sus formatos.
- Sin migraciones. Se actualiza agenda para generar planes formales.

## Comprobación

36 pruebas focales de documentos, membretes, paginación, exportación, selección de diseño y controles del portal; TypeScript, ESLint, Deno check y compilación correctos. Las muestras de consulta conservan los 35 campos clínicos del mismo conjunto de datos: cinco páginas en actual y tres en formal. Se verifican márgenes y un segundo perfil profesional. Revisión visual de las páginas completas y de la ventana de selección con datos ficticios.
