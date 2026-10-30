# Base visual de exportación PDF

Los diseños `current` (Actual) y `formal` (Tradicional formal) comparten un membrete horizontal, márgenes de 16 mm, papel blanco, paginación medida y bloques enmarcados. El diseño Actual usa un encabezado verde; el formal conserva el encabezado blanco, la tipografía serif y las secciones numeradas.

La identidad del consultorio/profesional se ubica a la izquierda. El logo del profesional va a la derecha, con su proporción original y la fecha/hora de generación en la zona horaria de Ciudad de México. Si no se ha configurado un logo, se dibuja la marca vectorial de Nuthrick. Los datos profesionales se toman de las mismas fuentes y permisos que ya utilizaba cada exportación.

Los datos del paciente se organizan en tres columnas. Las respuestas y las indicaciones extensas conservan el ancho completo; los bloques de objetivos/estrategias con campos breves pueden usar dos columnas y etiquetas en línea. La separación de contenido largo conserva cada línea entre páginas y evita que un título de sección quede solo. El membrete compacto de continuación y el pie con confidencialidad/número de página se repiten en las páginas siguientes.

La base se aplica a planes de alimentación publicados, registro de consultas y reportes de evolución. Las gráficas conservan sus datos, métodos, colores de clasificación y referencias; se ajusta únicamente el marco y la distribución. El anexo de métodos aprovecha el espacio disponible antes de crear otra página.

El cliente utiliza las mismas fuentes TypeScript que `agenda`, la función que exporta planes desde el Superlink. Para publicar cambios en esos módulos se requiere desplegar esa función además de publicar el frontend. Se conserva su configuración de autenticación y se sobreponen únicamente los módulos de documentos sobre los archivos vigentes de producción. No requiere migraciones ni cambios en las funciones de IA. La exportación LaTeX no se modifica.

La revisión visual usa seis PDF de demostración (consulta, evolución y plan, en ambos diseños), sin datos de pacientes reales. También se verifica la preservación de respuestas largas y que ningún texto salga del área de página.
