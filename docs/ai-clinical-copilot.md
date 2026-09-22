# IA-2 · Copiloto clínico

## Alcance y uso

PES está integrado en la sección existente **Diagnóstico nutricional (PES)** del Guión. R24h aparece junto al recordatorio existente, mediante **Capturar recordatorio**. No se sustituyeron los campos manuales ni se añadió IA al Taller, chat o Superlink.

La configuración clínica sigue deshabilitada. Implementar estos adaptadores no configura modelos, tarifas, API key ni asignaciones de créditos. No se hicieron peticiones reales a OpenAI.

## Entrega funcional

1. **Ubicación PES:** sección `nutrition_diagnosis` de `ConsultationPage`, conservando las preguntas `pes_problem`, `pes_etiology`, `pes_evidence` y `pes_statement`.
2. **Readiness:** consulta propiedad y revisión actual en el servidor. Muestra entrevista, objetivo, antropometría y laboratorios; ninguno se inventa y los laboratorios no bloquean.
3. **Datos utilizados:** lista explícita de respuestas clínicas del Guión; objetivos; mediciones de esa consulta; cálculos guardados por el motor, con método y versión; resultados de laboratorio de esa consulta; alimentos confirmados del recordatorio. Los cálculos anteriores a cambios en las mediciones se excluyen conservadoramente.
4. **Datos excluidos:** campos identificatorios del paciente. Nombre completo, correo y teléfono se usan únicamente en servidor para redactar coincidencias en el texto, no como contexto del modelo. Se filtran también enlaces, UUID, patrones de teléfono/CURP y domicilios etiquetados. No se envían otros pacientes ni expedientes completos.
5. **Prompts:** `pes_diagnosis@1` y `recall_24h@1` en `supabase/functions/ai/clinical.ts`.
6. **Esquemas:** JSON Schema estricto, sin propiedades adicionales. PES: `problem`, `etiology`, `signsSymptoms`, `pesStatement`, `evidence`, `missingContext`, `uncertainties`. R24h: `meals` con tiempo, texto original, nombre normalizado, cantidad/unidad nullable, confianza y confirmación; además `unresolvedItems` y `ambiguities`. Límites de longitud y cantidad de elementos.
7. **Alucinaciones:** la evidencia PES debe coincidir literalmente con hechos enviados; una propuesta con problema/enunciado y sin evidencia se rechaza. R24h debe citar fragmentos presentes en la narrativa. Se limpian cantidades que no aparecen explícitas y unidades no sustentadas. Esto reduce errores, pero no garantiza corrección clínica: sigue siendo obligatoria la revisión profesional.
8. **Aprobación:** solo `Aprobar` guarda el PES. La transacción verifica profesional, paciente, consulta en borrador, revisión y contexto; escribe las respuestas existentes y metadata de procedencia.
9. **Edición:** problema, etiología, signos/síntomas, enunciado, datos faltantes e incertidumbres son editables. La evidencia original se muestra como trazabilidad; no se presenta como certeza. Los campos manuales continúan disponibles.
10. **Regeneración:** la nueva propuesta queda aparte hasta elegir revisarla o conservar la anterior. Descartar no modifica el expediente. Cada generación nueva es una solicitud distinta y puede consumir créditos cuando IA esté habilitada.
11. **R24h:** narrativa libre separada de la interpretación. Una propuesta no se guarda automáticamente. La captura original manual por filas también se conserva.
12. **Extracción:** el único proveedor central de IA-1 recibe narrativa redactada, no el catálogo completo ni identificadores del paciente. La salida no admite campos de nutrientes o equivalentes.
13. **Matching:** búsqueda determinista en `food_items` visibles por RLS: nombre canónico, alias y coincidencias parciales; catálogo global y alimentos propios. Varias coincidencias requieren elección. Ningún ID generado por el modelo se trata como alimento válido.
14. **Ambigüedad:** cantidades ausentes quedan pendientes. Todas las filas extraídas requieren revisión profesional, incluso con confianza alta. Un alimento desconocido permite buscar otro nombre, crear mediante el formulario existente u omitirlo. No se supone una receta para “tacos”, ni una taza para “un plato”.
15. **Cálculo:** reutiliza `exchangeContributionForFood` y `calculateExchangeTotals`, con las porciones normalizadas del catálogo. La conversión a gramos solo existe si el alimento tiene peso comestible documentado. La estimación se actualiza al editar y se distingue de la confirmación.
16. **No macros de IA:** el servidor ignora totales suministrados por el cliente/modelo y guarda alimento y porción canónicos. Los nutrientes se derivan de esos snapshots con el motor de equivalentes, no del texto del modelo. Son estimaciones SMAE, no análisis químico de la receta.
17. **Créditos:** ambas features pasan por el mismo `runAIRequest`, reserva atómica, claim, settlement real y ledger de IA-1. Se usa el profesional del JWT, no uno enviado por el cliente.
18. **Sin saldo/configuración:** no se invoca el proveedor si no hay reserva o configuración válida. La edición manual y la confirmación de recordatorios no requieren créditos.
19. **Privacidad:** sin almacenamiento de prompts completos ni salidas provisionales en el ledger. La metadata aprobada referencia la generación. Solo se envía contexto minimizado. El filtrado de texto libre no es un anonimizador infalible: nombres de terceros o domicilios sin formato pueden requerir revisión adicional antes de habilitar uso clínico real.
20. **Seguridad:** JWT validado, propiedad servidor, referencia de revisión, token de cambios y estado draft. El navegador no puede actualizar `clinical_records` directamente; tampoco puede atribuir una aprobación a una generación ajena o no exitosa. No hay herramientas a disposición del modelo. Una solicitud incierta conserva su clave en sesión y requiere comprobar estado antes de otra ejecución.
21. **Migraciones:** `20260922013348_clinical_copilot.sql` añade metadata a snapshots y referencias de contexto a generaciones; `20260922013719_clinical_patient_identity_field.sql` alinea la redacción con `patients.full_name`. Aplicadas únicamente a `qlsqhvyrslclmlstlemn`. No se crearon entidades PES paralelas.
22. **Pruebas:** esquema/contexto/redacción, evidencia inventada, frases ambiguas, falta de saldo, errores, idempotencia, matching, recálculo, editar/aprobar/descartar/regenerar, SQL de propiedad e historial. Scripts SQL ejecutados en transacciones locales; prueba adicional con RPC reales en Supabase, íntegramente revertida.
23. **Conteo:** 595 pruebas frontend y 32 del proveedor/adaptadores en la suite de esta entrega. Además, suites SQL de IA-1/IA-2 y concurrencia de reservas/settlement.
24. **TypeScript:** comprobado en el árbol de entrega aislado.
25. **ESLint:** sin errores; el árbol base tiene un aviso preexistente de `SecondShiftVisual` sin utilizar en `LandingPage.tsx`. No se mezcló el trabajo pendiente del landing.
26. **Build:** build de producción local verificado. Las pruebas completas se ejecutan sin competir con el build para evitar los timeouts de los tests UI existentes.
27. **Commits:** consultar historial Git del commit `feat(ai): add clinical PES and structured recall copilot` y su documentación de entrega.
28. **Push:** destino autorizado `origin/main`, sin force; no incluye cambios locales ajenos del landing.
29. **Publicación:** Edge `ai` versión 2, JWT obligatorio. El estado final de Vercel se registra en la entrega de la tarea.
30. **Límites:** no hay validación con un modelo real mientras falte configuración; no se hizo gasto de créditos. El matching no resuelve recetas mixtas automáticamente. La comparación usa el plan más reciente ligado a esa misma consulta, si existe. No se presupone un objetivo global. La revisión visual ejecutada fue de escritorio, con proveedor y persistencia locales simulados; la integración de base de datos se comprobó por separado con RPC reales y rollback.

## Evidencia de verificación

- Browser local, componentes reales: PES → generar respuesta sintética → revisar evidencia → editar → aprobar → recargar → texto conservado.
- Browser local: narrativa solicitada → extracción sintética → pollo/arroz sin cantidad → asignar cantidades, omitir agua/tacos pendientes → revisar cinco filas → confirmar. Resultado de prueba: 740 kcal, proteína 53 g, carbohidratos 95 g, grasa 14 g; desayuno 480 kcal y comida 260 kcal. No es un plan ni una recomendación para un paciente.
- Tests de componentes/modelo comprueban cambio de cantidad, alimento y unidad, con recálculo y confirmación invalidada tras editar.
- Supabase: paciente/consulta **transaccionales** nuevos, PES manual aprobado, recordatorio guardado, consulta cerrada/reabierta, datos conservados en revisión 2; rollback completo. Comprobación posterior: cero pacientes temporales de esa prueba, cero generaciones reales, ambas features deshabilitadas y permiso de falsificación de metadata denegado.
- No se modificó ningún paciente real ni se borraron borradores preexistentes.

## Reproducir

```sh
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test -- --maxWorkers=2
npm --prefix frontend run build
deno test --config supabase/functions/ai/deno.json supabase/functions/ai/
node scripts/test-ai-core.mjs
node scripts/test-ai-concurrency.mjs
node scripts/test-clinical-copilot.mjs
```

Fixture visual independiente de producción: `frontend/tests/visual/clinical-copilot.vite.config.ts`, URL `/tests/visual/clinical-copilot.html`. No usa servicios externos. El servidor debe utilizar un puerto local libre.

## Guías utilizadas

Las habilidades **openai-docs**, **supabase** y **supabase-postgres-best-practices** guiaron los esquemas estrictos, la separación del proveedor y los permisos mínimos. Referencias oficiales: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

El asesor de seguridad no añadió avisos sobre los nuevos RPC. Persisten avisos previos: funciones de biblioteca/agenda `SECURITY DEFINER` públicas, tablas privadas sin políticas por diseño y protección de contraseñas filtradas deshabilitada. [Guía del aviso de funciones](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) · [Protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
