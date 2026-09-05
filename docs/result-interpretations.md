# Objetivo 6 — Interpretación de resultados

Implementación: 5 de septiembre de 2026. La interpretación recibe resultados numéricos existentes. No modifica `features/calculations/mathematics.ts`, el evaluador matemático ni sus contratos SQL.

## Referencias creadas y clasificaciones funcionales

| Resultado | Referencia | Regla operativa |
| --- | --- | --- |
| IMC | [OMS, WHO TRS 894 (2000)](https://iris.who.int/bitstream/10665/42330/1/WHO_TRS_894.pdf) | <18.5 bajo peso; [18.5,25) peso normal; [25,30) sobrepeso/preobesidad; [30,35), [35,40), ≥40 obesidad I, II, III |
| Cintura-cadera | [OMS, consulta 2008 publicada en 2011](https://www.who.int/publications/i/item/9789241501491) | Hombres ≥0.90; mujeres ≥0.85: riesgo sustancialmente aumentado. Debajo: «Por debajo del punto de corte» |
| Cintura-talla | [NICE NG246, recomendación 1.9.14 [2022]](https://www.nice.org.uk/guidance/ng246/chapter/Identifying-and-assessing-overweight-obesity-and-central-adiposity) | [0.40,0.50) saludable; [0.50,0.60) aumentada; ≥0.60 alta. Requiere IMC <35 de la misma consulta |

Se consultaron las fuentes institucionales el 2026-09-05. La OMS define adultos desde 18 años en su [ficha institucional](https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight). Nuthrick integra sólo la población adulta, sin gestación confirmada. Los intervalos abiertos se aplican al valor interno; 24.96 permanece en peso normal aunque el número visible se redondee a 25.0. NICE no recibe categoría para valores <0.40. No se cambia el punto de corte por país, etnia, edad avanzada o masa muscular; las limitaciones se documentan. No se integra la parte pediátrica de NICE en este objetivo.

## Catálogo y arquitectura

`public.interpretation_references` es la fuente de verdad en ejecución. Tiene clave compuesta `(id,version)`, definición JSON y marca activa. El archivo `frontend/src/features/interpretations/references.json` conserva la semilla versionada en el repositorio y permite pruebas independientes. Las migraciones incorporan la semilla y la corrección editorial de enlaces. El cliente carga las referencias de la base, no un catálogo diferente ni rangos en JSX.

La definición contiene resultado, organismo, publicación/año, versión de la fuente, versión del contrato Nuthrick, URL, localizador, población, unidades, condiciones por campos, reglas con límites inclusivos/exclusivos, identificador, categoría, descripción, orden, notas y limitaciones. No contiene colores.

El evaluador genérico admite condiciones de edad mínima/máxima, sexo y otros campos explícitos como población, país, etnia o condición clínica. Una única referencia predeterminada aplicable tiene prioridad. Si hay varias predeterminadas o varias aplicables sin predeterminada inequívoca, devuelve `requires_decision`; no decide por orden. Rangos solapados también requieren decisión. Estados independientes del cálculo: `classified`, `no_reference`, `not_applicable`, `missing_context`, `requires_decision`.

## Contexto

Edad: reutiliza `calculateAge`, con nacimiento del expediente y fecha de la consulta en la zona horaria del paciente. Sexo: `equation_sex`, nunca género o nombre. El servidor vuelve a obtenerlos del expediente; no confía en la clasificación enviada por el cliente.

Gestación: se reutiliza `life_stage` de la revisión vigente de la entrevista en la misma consulta cuando responde «Embarazo» o «Ninguna particular». Lactancia, posparto, persona mayor u otra respuesta no se toman como prueba de ausencia de embarazo. Cuando falta un dato explícito, se puede indicar la situación mediante un selector en Mediciones; se guarda en `consultations.interpretation_pregnancy`. No se infiere por sexo, apariencia o país y no se hereda de otra consulta. IMC para NICE: resultado vigente de esta consulta en la vista reactiva; en el servidor se verifica con el peso guardado de la misma consulta y la altura del expediente.

## Historial y base de datos

Se reutiliza `consultation_calculation_results`, con una columna `interpretation_snapshot`. Al guardar, un trigger posterior al validador matemático genera una copia de referencia completa, regla, valor interno, unidad, contexto, consulta, fecha y estado. El RPC `save_calculations_with_context` guarda contexto y resultados/interpretaciones en la misma transacción. El guardado previo de mediciones mantiene su flujo existente.

No hay actualización masiva de consultas anteriores. La vista restaura valores, contratos y clasificaciones persistidas al abrir; no se recalculan por abrir o por un nuevo catálogo. Guardar sin editar es una operación vacía. Si se guardan resultados clínicamente idénticos, el servidor conserva su interpretación original aunque cambien las referencias activas. Una edición explícita de mediciones produce una vista reactiva y, al guardar, una nueva interpretación del resultado modificado. Los resultados antiguos que nunca tuvieron interpretación siguen mostrando su número y «Sin interpretación guardada» en detalles; no se clasifican retroactivamente.

La eliminación de un resultado de la consulta editable elimina su interpretación junto al resultado. Las consultas finalizadas no pueden modificarse mediante el RPC. Se mantienen RLS y pertenencia al profesional. Las referencias estándar son de sólo lectura para usuarios autenticados; no hay editor de puntos de corte. Los snapshots se construyen en el servidor, incluso ante escritura directa a resultados. No se crean funciones SECURITY DEFINER.

## Interfaz y detalles

Resultados muestra texto discreto debajo de IMC, cintura-cadera y cintura-talla. Cintura-talla se incorpora ahora a la vista principal conforme al ejemplo del objetivo 6. Detalles abre clasificación o motivo de no aplicabilidad, valor interno, límites exactos, referencia interpretativa, población, versión, contexto, notas y fecha. Un enlace separado abre el método matemático. Métodos conserva sus fórmulas, dependencias, faltantes y referencias matemáticas. El valor sigue siendo principal; no hay semáforo ni botón para reclasificar.

Siri, Brozek, masas grasas/magras, componentes Heath-Carter, somatocarta y densidades siguen deliberadamente sin clasificación automática. El estado sin referencia no añade ruido a las tarjetas.

## Pruebas y auditoría del alcance

| Requisitos del objetivo | Evidencia |
| --- | --- |
| 1–5, 17, 24–25, 33–42, 47–49: separación, catálogo, estados, variantes, referencias y selección | Tipos y evaluadores en `features/interpretations`; migración `result_interpretations`; pruebas de defaults, ambigüedad y rangos solapados |
| 6–7, 11–17, 32, 34–38: contexto y precisión | Pruebas de límites, edad histórica con cambio de día por zona horaria, sexo, embarazo desconocido/presente, IMC faltante/≥35, población no indicada |
| 8–9, 31, 43–45, 58: persistencia y reacción | Prueba SQL con dos consultas sintéticas, cambio de referencia, reintento idéntico, borrado; pruebas de UI de reacción y eliminación de inputs y carga histórica |
| 10, 13, 15, 54–57: tres referencias iniciales | Casos justo por debajo y exactamente en límites de IMC, ambos sexos ICC, NICE 0.39/0.40/0.49/0.50/0.59/0.60; evaluadores TS y SQL |
| 18–23, 50, 59–62: exclusiones de alcance | Pruebas de `no_reference` para grasa, masas, Heath-Carter, somatocarta y densidad; sólo tres referencias en catálogo |
| 26–30, 46, 51–53: interfaz compacta y detalles separados | Pruebas de componentes y navegador real con los componentes de producción a 360/768/1280 px; capturas sin desbordamiento |
| 41: protección de referencias | Prueba SQL de denegación de UPDATE autenticado, RLS entre profesionales y bloqueo de consulta finalizada |
| 63–66: fuentes, validación y entrega | Este informe, catálogo bibliográfico, suite completa, typecheck, lint, build y despliegue |

La prueba `supabase/tests/database/result_interpretations.sql` crea pacientes sintéticos en una transacción con rollback y no deja datos. Verificación visual reproducible: iniciar `npx vite --config tests/visual/vite.config.ts` desde frontend y ejecutar `NUTHRICK_BROWSER_RUNTIME=<directorio node_modules con playwright> node tests/visual/check-interpretations.mjs`. Usa Chrome instalado, datos sintéticos y componentes reales; no abre ni modifica pacientes reales. La revisión visual está aislada del enrutamiento publicado.

## Archivos principales

- `frontend/src/features/interpretations/{types,engine,history}.ts` y `references.json`.
- `frontend/src/services/interpretations.ts` y `consultationCalculations.ts`.
- `frontend/src/components/consultations/{ConsultationMeasurements,CalculationCatalog,InterpretationDetails}.tsx`.
- Migraciones `20260905061410_result_interpretations.sql` y corrección de enlaces bibliográficos.
- Pruebas de reglas, componentes, SQL y `frontend/tests/visual/`.

## Pendientes fuera de este objetivo

Referencias pediátricas específicas, porcentaje de grasa por método/sexo/edad, referencias mexicanas validadas, masa muscular, bioimpedancia por dispositivo y laboratorios. No se implementan clasificaciones provisionales para cubrir esas áreas.

Los asesores de Supabase mantienen los avisos preexistentes sobre [la función de reapertura](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) y [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no se añadieron avisos de seguridad por esta migración.
