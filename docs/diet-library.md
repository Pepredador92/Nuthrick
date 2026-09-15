# Biblioteca reutilizable del Taller

## Flujo

- Acceso desde el inicio del Taller y desde cualquier paso de un borrador.
- Guardar en biblioteca captura primero los cambios pendientes. No requiere paciente ni publicación.
- El nombre parte de una etiqueta neutra. El profesional revisa todos los textos reutilizables y confirma que no contienen información personal.
- Una dieta tiene un día aplicado; un plan tiene entre dos y siete. Las alternativas no cuentan como días ni se suman a sus aportes.
- Las bases sin calendario o con datos no verificables se guardan como pendientes, fuera de las sugerencias.
- Mi biblioteca admite copias, edición de textos, edición completa en un borrador independiente, actualización explícita y archivo reversible.
- Editar en Taller conserva únicamente los objetivos de referencia, sin peso ni datos de las fórmulas. `libraryEdit` y `libraryRevision` enlazan el guardado explícito con la revisión de origen y evitan sobrescribir ediciones concurrentes.
- La biblioteca de Nuthrick es de solo lectura para los profesionales. Sus originales solo se administran con autoridad de sistema. Esta migración no publica bases de ejemplo ni convierte planes de pacientes en contenido global.

## Comparación v1

Se utiliza el motor existente de equivalentes y su edición vigente. Cada día se obtiene únicamente de sus opciones aplicadas. Se verifican cantidades, unidades, edición del catálogo y coherencia entre snapshots de ingredientes y aportes guardados. Ausencia de información no equivale a cero; los resultados incompletos no son sugerencias.

Para energía, proteína, carbohidratos y grasa se calcula `abs(actual - objetivo) / objetivo`. La distancia de un día es la media de las cuatro diferencias relativas. Se ordena por el día más distante, después por la media de los días y finalmente por nombre. Un objetivo cero solo es comparable si el aporte también es cero. No hay umbrales clínicos ni aprobación automática. Se muestran los valores y diferencias de cada día, no solo un promedio.

Las exclusiones y preferencias se cotejan únicamente cuando existen identificadores registrados. No se infieren alergias, aptitud clínica ni preferencias desde notas libres. Las restricciones no verificadas se indican como pendientes de revisión profesional.

## Copias y recuperación

La proyección de biblioteca permite campos concretos y elimina metadatos clínicos, preferencias del paciente y entradas de fórmulas. La base conserva los snapshots de alimentos, fuentes, preparaciones y sustituciones revisadas. El control de campos no puede garantizar anonimato dentro de texto libre: por eso se exige revisión humana.

Usar una base renueva identificadores de opciones, tiempos y entradas. Conserva los objetivos y la identidad del caso actual, invalida confirmaciones y obliga a revisar de nuevo las sustituciones. Nunca escala cantidades ni publica automáticamente.

`apply_diet_library` bloquea la revisión del borrador y comprueba la revisión y el acceso a la base. Guarda el contenido previo y sustituye únicamente equivalentes, tiempos y menú en una transacción. Un identificador de operación evita duplicar la aplicación si se reintenta.

La recuperación está disponible mientras el borrador siga en la revisión resultante de aplicar la base. Si hay cambios posteriores, la restauración se rechaza para no borrarlos. Las versiones clínicas publicadas nunca se modifican.

## Verificación y activación

- Pruebas de dominio y controles: `npm test -- src/features/diet-library src/components/diet/DietLibrary.test.tsx` en frontend.
- Base local vacía: `node scripts/test-diet-library-db.mjs`. La prueba usa PostgreSQL local en `/tmp`, crea fixtures/roles dentro de una transacción y revierte todo al finalizar. Aborta si las estructuras ya existen; no usar contra una base de producción.
- Vista ficticia sin Supabase: `npx vite --config tests/visual/library.vite.config.ts`, abrir `/tests/visual/library.html` en el puerto 4176. No contiene datos clínicos ni escribe en servidores.
- Aplicar `20260915212701_reusable_diet_library.sql` exclusivamente al proyecto Supabase `qlsqhvyrslclmlstlemn` antes del despliegue de frontend. Verificar permisos y funciones en remoto; después desplegar en `nuthrick.vercel.app`.

Estado al preparar esta entrega: comprobaciones locales realizadas; migración remota y despliegue pendientes de iniciar sesión en Supabase. La biblioteca global se muestra vacía hasta que exista contenido de sistema autorizado.

Verificación local: 34 pruebas relacionadas aprobadas, tipos y lint correctos, compilación correcta y pruebas transaccionales de PostgreSQL aprobadas. Revisión visual sin desbordamiento de página/modal a 320, 390 y 768 px, además de escritorio. La suite general mantiene una discrepancia previa en el título esperado de `LandingPage.test.tsx`; esos cambios ajenos a esta tarea se conservaron sin modificar.
