# Indicaciones completas

## Causa y corrección

El ejemplo reportado tenía exactamente 300 caracteres y terminaba a mitad de una
palabra. `patient_instructions@2` reutilizaba el esquema antiguo de objetivos, con
un máximo de 300 caracteres por texto. El límite se aplicaba durante la generación
estructurada; no era una falta de tokens de salida ni un recorte del editor.

`patient_instructions@3` tiene un esquema independiente: hasta tres indicaciones,
con hasta 2000 caracteres cada una y un signo de cierre obligatorio. No admite un
final en puntos suspensivos. El prompt pide explicaciones dirigidas al paciente,
oraciones completas y reformulación cuando haga falta sintetizar. Conserva los
acuerdos documentados, la evidencia y la revisión del profesional.

El editor de indicaciones admite al menos 12000 caracteres, igual que el portal,
para reunir las propuestas y los ajustes del profesional. Esto también se aplica
a consultas existentes sin reescribir sus snapshots ni respuestas. Los límites
de otros campos se conservan. Ningún paso corta el texto con `slice` o `substring`.
Las respuestas del proveedor con estado `incomplete` siguen rechazándose antes
de devolver o guardar una propuesta, aunque contengan JSON válido.

No cambia el modelo Luna, la asignación de tokens, los precios ni el registro de
consumo. Las versiones anteriores del adaptador siguen disponibles para las
solicitudes que ya estaban en curso. Primero se despliega el adaptador y después
se activa el prompt mediante la migración.

Las propuestas generadas antes del cambio no se completan automáticamente:
requieren una nueva generación o edición profesional. No se inventa su final.

## Publicación

- Edge `ai` versión 49, JWT requerido; fuentes publicadas contrastadas con las
  previstas para este ajuste.
- Prompt activo `patient_instructions@3`, modelo `gpt-5.6-luna` y política
  `model_capacity`, confirmados mediante consulta de configuración.
- TypeScript del frontend, `deno check` del handler, ESLint de los archivos del
  frontend modificados y build de producción completados sin errores.
- No se modificó el expediente de ningún paciente.

Referencia: [Structured Outputs de OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs).
