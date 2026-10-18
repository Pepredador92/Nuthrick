# Revisión clínica y redacción PES

Actualización: 18 de octubre de 2026. Adaptador `pes_diagnosis@5`.

## Contexto clínico

La fuente autenticada conserva la selección de entrevista y antecedentes existente: consulta actual, primera evaluación inicial y las tres consultas cerradas anteriores más recientes, sin duplicados. Se mantienen propiedad, revisión, fecha y exclusión de consultas retiradas o futuras.

Las mediciones y cálculos llevan código estable, origen, unidad, fecha y método. El historial enviado al generador conserva primer y último registro disponible por indicador, unidad y método, incluidas lecturas contradictorias en esas fechas. Ya no depende de nombres visibles como `Grasa (%)` ni descarta por defecto la masa muscular y otros indicadores históricos. Los cálculos desactualizados se siguen excluyendo.

Se agregan peso inicial, estatura, edad en la fecha de consulta y sexo registrado para ecuaciones como datos de ficha. No se envía la fecha de nacimiento. Un peso o estatura de ficha sin fecha de medición se identifica expresamente como antecedente sin fecha, nunca como medición realizada hoy. Los cambios de estos campos invalidan la aprobación PES/objetivo de consultas en borrador y el token de contexto de propuestas pendientes. Las consultas cerradas mantienen sus aprobaciones históricas.

La revisión muestra una tabla con dato actual, anterior disponible, fechas y método. El cambio se calcula únicamente si unidad y método coinciden y existe una sola lectura en cada columna. En porcentajes, la diferencia se expresa en puntos porcentuales; no es un cambio porcentual relativo ni una interpretación clínica. Los datos de ficha se muestran por separado.

## Redacción y aprobación

Un solo editor reúne problema, etiología, signos y síntomas y el enunciado final. Se retiran los cuatro campos duplicados del formulario inferior. Editar P, E o S recompone el enunciado con una función pura compartida. No se permite editar el enunciado independientemente de sus componentes. Las frases guardadas previamente se conservan al abrirse; si no coinciden con sus componentes, el profesional debe revisar y actualizar el enunciado explícitamente antes de aprobar.

El servidor comprueba la correspondencia entre P/E/S y enunciado, registra la revisión profesional y conserva los controles existentes de revisión, propiedad, cambios de contexto y procedencia de IA. Las funciones originales quedan privadas, sin permisos de ejecución directa para cuentas autenticadas. La aprobación de objetivos continúa independiente.

El adaptador @5 pide un único problema nutricional, etiología documentada, evidencia específica y vigencia de antecedentes. El servidor compone la frase final de la salida estructurada y rechaza cifras de P/E/S ausentes de las evidencias citadas. No infiere porcentajes de pérdida ni clasificación de desnutrición a partir de un dato aislado. Este filtro detecta cifras sin respaldo; no demuestra por sí solo que cada relación causal o unidad sea clínicamente correcta. La edición manual y la decisión final siguen a cargo del profesional.

No se incorpora ni se afirma validar un catálogo licenciado NCPT. El prompt prohíbe inventar códigos o afirmar una validación terminológica inexistente.

## Publicación

Publicar de forma coordinada el frontend, la función Edge `ai` y la migración `20261018221235_pes_evidence_and_measurement_context.sql`. El adaptador que reconoce @5 debe estar desplegado antes de activar la migración. La nueva aprobación exige el enunciado compuesto y la marca de revisión enviada por el frontend actualizado; las pestañas antiguas deberán recargarse. La migración no reescribe PES ni aprobaciones históricas existentes.

## Comprobaciones

- `node scripts/test-pes-review.mjs`: PostgreSQL local, transacción revertida, fixtures sintéticos. Comprueba códigos históricos, procedencia de ficha, ausencia de fecha de nacimiento en facts, propietario, cambios de contexto, aprobación consistente, revisión e invalidación posterior.
- Pruebas focales frontend del editor PES, comparación de medidas y navegación/salida de consultas.
- Pruebas Deno del adaptador, validación numérica, calibraciones y handler HTTP. No hacen generaciones pagadas.
- `npm run typecheck`, ESLint focal y `npm run build` desde `frontend`.
- Vista local: `npx vite --config tests/visual/clinical-copilot.vite.config.ts`; comprobación con `node frontend/tests/visual/pes-review-check.mjs` y Playwright disponible. Usa fixtures, prueba ambos temas de 320 a 1440 px, composición, aprobación, recarga y ausencia de llamadas remotas.
