# PES con síntesis de evidencia — versión 7

`pes_diagnosis@7` evalúa los datos disponibles por dominios, compara problemas nutricionales sustentados y prioriza un problema abordable. Separa la causa documentada de una hipótesis plausible, selecciona los signos que demuestran ese problema y conserva otros hallazgos relevantes con su fuente. La respuesta mantiene el contrato JSON existente y una sola generación por solicitud.

El prompt está en `supabase/functions/ai/pes-synthesis.ts`. Sustituye la acumulación de instrucciones anteriores para esta versión y conserva los adaptadores históricos. Los borradores preliminares no se convierten en evidencia; los PES históricos aprobados se contrastan con los hechos actuales. La terminología estandarizada se utiliza cuando está disponible y corresponde al caso, sin inventar códigos ni declarar una validación terminológica.

P, E y S permanecen separados. El servidor compone el enunciado a partir de sus componentes y conserva el rechazo de cifras sin soporte. La versión 7 extiende esta comprobación numérica a las notas de otros hallazgos; sus fechas pueden estar documentadas en la etiqueta literal de la fuente histórica. Esta comprobación valida trazabilidad numérica, no demuestra por sí misma la pertinencia clínica de todas las afirmaciones.

## Evaluación

Se ejecutaron solicitudes reales con el modelo de producción `gpt-5.6-luna`, esfuerzo `low` y los mismos límites de entrada y salida, sobre tres casos sintéticos. No se utilizaron expedientes reales ni se modificaron los créditos de los profesionales.

| Caso | Resultado observado en la versión final |
| --- | --- |
| Conducta alimentaria y antropometría | Priorizó un patrón alimentario irregular, formuló la barrera de horario como posible influencia y conservó la adiposidad como otro hallazgo con evidencia. |
| Solo antropometría | Dejó vacíos P, E, S y enunciado; solicitó información concreta para sustentar un problema y su causa. |
| Ingesta y dolor al masticar | Priorizó ingesta energética insuficiente frente a un PES conductual histórico, usando el registro revisado y la barrera actual. |

La primera comparación frente a @6 detectó circularidad en la etiología y referencias numéricas sin citas en otros hallazgos. Las instrucciones y la comprobación de evidencia se corrigieron antes de activar la versión final. El resultado del caso de ingesta también identificó que una fecha histórica puede pertenecer a la etiqueta de la fuente; la validación actual la reconoce sin alterar el resultado del proveedor.

Los resultados originales se conservan en `supabase/functions/ai/fixtures/pes-synthesis-calibration-20261020.json`. Las pruebas vuelven a comprobar sus contratos y evidencias con las reglas actuales. Tres casos constituyen una comprobación acotada; la variabilidad del modelo y la calidad de cada consulta requieren seguir evaluando resultados y mantener la revisión profesional.

## Activación

El 20 de octubre de 2026 se desplegó la función Edge `ai`, versión **39**, y después se aplicó `20261020183655_pes_evidence_synthesis.sql`. Se confirmó `pes_diagnosis@7` habilitado en producción con el modelo y límites existentes. Los archivos publicados coinciden con los preparados para la versión y pasaron `deno check` y 65 pruebas automatizadas. Los PES guardados conservan su contenido; una nueva generación utiliza la versión activada.

Para reproducir la evaluación, `scripts/calibrate-pes-synthesis.ts` usa datos sintéticos y hace una simulación por defecto. Las llamadas reales requieren `--execute`, una clave local y permisos explícitos de Deno. Admite versiones 6 y 7 para comparar sin cambiar la configuración de producción.

## Referencias

- [Academy of Nutrition and Dietetics: Nutrition Diagnosis](https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-diagnosis): conexión entre problema, causa abordable y signos específicos que permitan evaluar evolución.
- [OpenAI Docs: Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices): instrucciones claras y resultados esperados, sin solicitar una narración del razonamiento interno.
- [OpenAI Docs: Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering): evaluar prompts con casos representativos y conservar un contrato de salida explícito.
