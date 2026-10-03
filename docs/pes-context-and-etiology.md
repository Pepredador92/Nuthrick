# Contexto histórico y etiología del PES

Actualización: 3 de octubre de 2026. Prompt `pes_diagnosis@3`.

## Contexto y límites

- Conserva las mediciones, cálculos vigentes, laboratorios y entrevista de la consulta actual.
- Incluye adherencia, detalle de síntomas, estado del problema y respuestas sobre conducta alimentaria, barreras, sueño, actividad, estrés y cambios de tratamiento.
- Historial: primera evaluación inicial y las tres consultas cerradas más recientes anteriores a la actual (máximo cuatro consultas, sin duplicados). Excluye consultas retiradas, canceladas, en borrador, futuras y de otros pacientes/profesionales.
- Usa la última revisión de cada entrevista. Los antecedentes llevan fecha y etiqueta propia; no se presentan como información actual.
- Incluye PES históricos solamente cuando existe aprobación profesional registrada. Los textos manuales antiguos sin esa aprobación no se convierten automáticamente en evidencia validada.
- El resumen numérico histórico conserva primer/último registro disponible de peso, cintura, IMC y grasa corporal, con sus unidades y métodos. No representa todas las mediciones intermedias. Las mediciones actuales se conservan completas.
- No recorta frases clínicas ni borra negaciones. Los datos identificativos se filtran antes del proveedor. Mantiene los límites configurados de tokens/créditos y el control de tamaño previo a generar.
- El token de concurrencia incluye selección de consultas históricas, revisiones y marcas de actualización. Un cambio de contexto impide aprobar una generación pendiente como si siguiera vigente.

## Etiología y revisión

El prompt pide hipótesis concretas sustentadas y distingue antecedentes, vigencia pendiente y causalidad. No permite convertir antropometría o enfermedades en causas por sí solas. Si falta sustento, deja etiología y enunciado sin completar e indica qué confirmar.

La interfaz muestra la falta de etiología y los datos por confirmar sin abrir los detalles. Tanto la interfaz como el servidor rechazan aprobar una etiología vacía o compuesta únicamente por espacios. Sigue disponible la edición manual por el profesional. No se reescriben diagnósticos ni aprobaciones históricos.

## Verificación

- 21 pruebas de interfaz/modelo del copiloto; 31 pruebas del adaptador y calibraciones registradas; prueba HTTP con 22 pasos.
- `scripts/test-pes-history.mjs`: PostgreSQL local desechable; selección temporal, revisión más reciente, exclusiones, aprobación completa, rechazo de campos vacíos y concurrencia.
- `scripts/test-pes-history.sql`: mismas comprobaciones con registros sintéticos en producción, en transacción revertida. No genera IA ni consume créditos. No modifica expedientes reales.
- Verificación de contexto real mediante lectura: conserva 14 mediciones y 11 cálculos actuales e incorpora entrevistas de dos fechas históricas. La salida del modelo no se volvió a generar sobre el paciente durante estas pruebas.
- TypeScript, ESLint de los archivos modificados y build correctos. ESLint global detectó un problema previo de `react-hooks/set-state-in-effect` en `AIProcessingConsent.tsx:31`, fuera de este cambio.
- Supabase Advisors no señala las funciones modificadas. Persisten avisos previos sobre funciones públicas SECURITY DEFINER y protección de contraseñas filtradas: [funciones](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Publicación

Desplegar primero la función Edge `ai` con soporte para `pes_diagnosis@3`, luego la migración `20261003220540_pes_longitudinal_context_and_required_etiology.sql` y finalmente el frontend. Se conserva JWT y la autorización por propietario.

Las propuestas que estaban abiertas antes del cambio requieren volver a generarse con el contexto actualizado; la aprobación profesional sigue siendo obligatoria.
