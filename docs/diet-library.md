# Biblioteca reutilizable del Taller

## Flujo

- Acceso desde el inicio del Taller y desde cualquier paso de un borrador.
- Guardar en biblioteca captura primero los cambios pendientes. No requiere paciente ni publicación.
- El nombre parte de una etiqueta neutra. El profesional revisa todos los textos reutilizables y confirma que no contienen información personal.
- Una dieta tiene un día aplicado; un plan tiene entre dos y siete. Las alternativas no cuentan como días ni se suman a sus aportes.
- Las bases sin calendario o con datos no verificables se guardan como pendientes, fuera de las sugerencias.
- Mi biblioteca admite copias, edición de textos, edición completa en un borrador independiente, actualización explícita y archivo reversible.
- Editar en Taller conserva únicamente los objetivos de referencia, sin peso ni datos de las fórmulas. `libraryEdit` y `libraryRevision` enlazan el guardado explícito con la revisión de origen y evitan sobrescribir ediciones concurrentes.
- La biblioteca de Nuthrick es de solo lectura para los profesionales. Pueden abrir una copia editable o enviar sus propias bases a revisión; el envío no las publica.

## Comparación v1

Se utiliza el motor existente de equivalentes y su edición vigente. Cada día se obtiene únicamente de sus opciones aplicadas. Se verifican cantidades, unidades, edición del catálogo y coherencia entre snapshots de ingredientes y aportes guardados. Ausencia de información no equivale a cero; los resultados incompletos no son sugerencias.

Para energía, proteína, carbohidratos y grasa se calcula `abs(actual - objetivo) / objetivo`. La distancia de un día es la media de las cuatro diferencias relativas. Se ordena por el día más distante, después por la media de los días y finalmente por nombre. Un objetivo cero solo es comparable si el aporte también es cero. No hay umbrales clínicos ni aprobación automática. Se muestran los valores y diferencias de cada día, no solo un promedio.

Las exclusiones y preferencias se cotejan únicamente cuando existen identificadores registrados. No se infieren alergias, aptitud clínica ni preferencias desde notas libres. Las restricciones no verificadas se indican como pendientes de revisión profesional.

## Copias y recuperación

La proyección de biblioteca permite campos concretos y elimina metadatos clínicos, preferencias del paciente y entradas de fórmulas. La base conserva los snapshots de alimentos, fuentes, preparaciones y sustituciones revisadas. El control de campos no puede garantizar anonimato dentro de texto libre: por eso se exige revisión humana.

Usar una base renueva identificadores de opciones, tiempos y entradas. Permite conservar los objetivos actuales o cargar objetivos de referencia completos y coherentes. Siempre conserva la identidad del caso, invalida confirmaciones y obliga a revisar de nuevo las sustituciones. Nunca escala cantidades ni publica automáticamente.

`apply_diet_library` bloquea la revisión del borrador y comprueba la revisión y el acceso a la base. Guarda el contenido previo y sustituye únicamente equivalentes, tiempos y menú en una transacción. Un identificador de operación evita duplicar la aplicación si se reintenta.

La recuperación está disponible mientras el borrador siga en la revisión resultante de aplicar la base. Si hay cambios posteriores, la restauración se rechaza para no borrarlos. Las versiones clínicas publicadas nunca se modifican.

## Verificación y activación

- Pruebas de dominio y controles: `npm test -- src/features/diet-library src/components/diet/DietLibrary.test.tsx` en frontend.
- Base local vacía: `node scripts/test-diet-library-db.mjs`. La prueba usa PostgreSQL local en `/tmp`, crea fixtures/roles dentro de una transacción y revierte todo al finalizar. Aborta si las estructuras ya existen; no usar contra una base de producción.
- Vista ficticia sin Supabase: `npx vite --config tests/visual/library.vite.config.ts`, abrir `/tests/visual/library.html` en el puerto 4176. No contiene datos clínicos ni escribe en servidores.
- Aplicar `20260915212701_reusable_diet_library.sql` exclusivamente al proyecto Supabase `qlsqhvyrslclmlstlemn` antes del despliegue de frontend. Verificar permisos y funciones en remoto; después desplegar en `nuthrick.vercel.app`.

Activación de base de datos: migración aplicada el 15 de septiembre de 2026 al proyecto indicado, registrada remotamente como `20260915220100_reusable_diet_library`. No volver a aplicar el archivo local. Pruebas remotas transaccionales aprobadas: lectura propia, archivo/revisión, bloqueo de escritura global, rechazo de campos clínicos, aislamiento entre propietarios y autorización de RPC. Todos los registros de prueba se revirtieron.

Revisión de asesores: los respaldos privados tienen RLS sin políticas y sin permisos de cliente intencionalmente (denegación por defecto). Las tres RPC autenticadas usan SECURITY DEFINER para la operación atómica, con propietario explícito, search_path cerrado y acceso anónimo revocado; su aviso es esperado. Referencias: [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [funciones autenticadas privilegiadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Sigue pendiente, fuera de esta entrega, habilitar [protección contra contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Los avisos de índices sin uso son esperables para tablas nuevas; no se retiraron índices.

Verificación local: 34 pruebas relacionadas aprobadas, tipos y lint correctos, compilación correcta y pruebas transaccionales de PostgreSQL aprobadas. Revisión visual sin desbordamiento de página/modal a 320, 390 y 768 px, además de escritorio. La suite general mantiene una discrepancia previa en el título esperado de `LandingPage.test.tsx`; esos cambios ajenos a esta tarea se conservaron sin modificar.

## Ampliación: aportaciones y objetivos (15 septiembre de 2026)

`library_contributions_and_targets`, `seed_anonymized_pdf_library` y `normalize_library_reference_energy` están aplicadas en el mismo proyecto. No volver a ejecutar las migraciones de estructura.

- Mi biblioteca → Ver dieta → Aportar a Nuthrick exige consentimiento explícito de derechos y revisión de datos personales. Congela nombre/contenido/revisión; los cambios posteriores de la base privada no alteran la aportación.
- Aportaciones muestra el estado y permite retirar envíos pendientes. Solo un revisor autorizado puede ver la cola completa, aprobar o devolver con motivo. Publicar conserva el original privado y evita duplicar contenido idéntico.
- La lista `private.diet_library_reviewers` permanece vacía: falta que el propietario indique expresamente la cuenta revisora. No deducir permisos de correo, metadatos editables ni del hecho de haber iniciado sesión. Su alta requiere verificar el correo en Auth y el perfil profesional; nunca incluir cuentas reales en migraciones o fixtures.
- `apply_diet_library_with_targets` valida los objetivos de la base en el servidor, conserva la identidad del caso y respalda también calorías, macros y cálculo energético. La recuperación revierte esos objetivos; el control de revisión impide borrar cambios posteriores. No importa el peso o datos clínicos de otro caso.
- Los resultados reales del menú se muestran separados del objetivo. La energía 4/4/9 calculada a partir de gramos puede diferir de la energía promedio del catálogo de equivalentes; se explicita la procedencia.
- Los objetivos se normalizan a kcal enteras, igual que la columna existente del plan: Energía, Macros y equivalentes conservan el mismo objetivo. Los aportes de ingredientes no se redondean ni se alteran. Se probó la carga/restauración remota con una base de referencia decimal en un borrador sin paciente, revertido al terminar.

## Importación curada de PDF

Los 11 documentos aportados se leyeron localmente; no se subieron PDFs, nombres, correos, antropometría ni tratamientos a la biblioteca. Se extrajeron 24 dietas. Un documento solo contenía antropometría y se excluyó. Las tres variantes con suplemento duplicaban otras tres dietas al omitir el scoop, por lo que quedaron **21 bases distintas de un día**, con desayuno/comida/cena. Las etapas de 14 o 21 días no se interpretaron como calendarios semanales distintos.

Estado verificado en base remota: **1 base completa y 20 pendientes**. Se omitieron todos los scoops e ISO100 según indicación del usuario. No se inventaron pesos cocidos de res/pescado, gramos drenados de latas, cantidades de frutas genéricas, correspondencias de productos ambiguos o elecciones A/B. Los textos originales de esos ingredientes se conservan como «Por verificar», sin snapshot nutricional ficticio. No se muestran totales parciales como completos ni se recomiendan esas bases; pueden abrirse como copias editables para completar su correspondencia. La publicación clínica rechaza alimentos sin snapshot tanto en frontend como en servidor.

Las cantidades domésticas explícitas se convierten únicamente con unidades/porciones ya verificadas del catálogo existente. La cifra calórica declarada por el documento se conserva como referencia documental, no como aporte calculado. Las sustituciones deben revisarse de nuevo. Los objetivos de referencia solo se generan cuando se puede calcular el día completo.

Fuentes anónimas en `scripts/data/library-pdf-recipes.json`; importador determinista `scripts/build-pdf-library.ts`. `node scripts/run-library-import.mjs --sql` emite la migración sin ejecutar escrituras. Resuelve alimentos por código estable en la base destino, no por UUID generado; aborta si falta alguno. La carga es idempotente por procedencia y nunca sobrescribe bases existentes.

Verificación de la ampliación: 42 pruebas relacionadas aprobadas, tipos/lint/compilación correctos; pruebas PostgreSQL locales de consentimiento, aislamiento, aprobación restringida, snapshots, objetivos y recuperación; semilla ejecutada dos veces sin duplicados dentro de una transacción revertida. Prueba remota de envío/retiro/permisos y copia congelada aprobada y revertida. Control visual móvil a 390 px sin desbordamiento, con desplazamiento interno de la tabla comparativa. Los asesores no reportan un índice faltante en las nuevas tablas; sus avisos de RLS privado y RPC privilegiadas son intencionales, con denegación por defecto y autorización explícita. La advertencia previa de contraseñas filtradas continúa fuera de este alcance.
