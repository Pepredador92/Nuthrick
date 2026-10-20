# Síntesis y prioridad del PES — versión 9

Se conserva `gpt-5.6-luna`, su nivel de razonamiento y los presupuestos existentes,
conforme a la preferencia del usuario. No se agrega una segunda generación.

## Cambios

- Instrucciones específicas para comparar problemas sustentados, seleccionar uno
  prioritario y redactar sus componentes como una síntesis clínica.
- Hasta cuatro signos breves, redactados como frases nominales. El enunciado
  mantiene su correspondencia exacta con P, E y S; los detalles de las fuentes
  permanecen disponibles como evidencia literal.
- La suma de los límites de P, E y S cabe en el límite público del enunciado.
  No se recorta texto clínico después de generarlo.
- Una justificación breve de prioridad, con sus referencias, se muestra junto al
  diagnóstico y se conserva al aprobar. Se retira si el profesional cambia P, E
  o S, para evitar que justifique una propuesta distinta.
- Las notas no verificables se sustituyen por una revisión pendiente que indica
  su área y, cuando es posible, las fuentes existentes. No se devuelve la
  interpretación sin verificar. Una nota adicional no invalida el PES principal.
- La justificación y las notas usan el contrato de aprobación existente. Las
  instrucciones no solicitan una transcripción del razonamiento interno.
- El reintegro idempotente de créditos cubre los rechazos de PES @8 y @9.

## Comprobaciones de esta entrega

- Tipado de la función con Deno y del frontend con TypeScript.
- ESLint de los tres archivos de interfaz modificados y compilación de producción.
- Revisión del código de aprobación: el compositor compartido y su equivalente
  SQL mantienen el mismo formato; la evidencia y las notas ya se almacenan.
- Edge Function `ai` versión 42 activa, con sus archivos remotos comparados.
- Migración `20261020194256` aplicada. Consulta de configuración y permisos:
  PES @9, modelo Luna, límites conservados y reintegro accesible solo al servidor.
- Los avisos de seguridad de Supabase conservan los conteos previos.

No se hicieron generaciones de pago ni cambios en expedientes para esta entrega.
Estas comprobaciones no acreditan por sí solas la calidad clínica de cada futura
respuesta: el borrador conserva la revisión y aprobación del profesional.
