# Revisión clínica y objetivos en seguimiento

## Diagnóstico del fallo

- Las marcas de revisión clínica solo existían en estado React. Se perdían al
  desmontar la pantalla o recargar, aunque las respuestas clínicas siguieran guardadas.
- Los avisos de avance permanecían en la esquina sin expiración.
- El flujo permitía aprobar una etiología escrita como `NA`. En el caso revisado,
  la IA sí había recibido y citado mediciones actuales e históricas; no había una
  barrera específica registrada que sustentara la causa del problema elegido.
- Una respuesta de objetivos con `objectives: []` pasaba el esquema y se liquidaba
  como éxito. No se entregaba ningún objetivo al usuario, pero se cobraba el consumo.

## Cambios

1. Las marcas se guardan por consulta y revisión en `working_drafts`, mediante el
   mecanismo de guardado existente. Se espera la confirmación del guardado antes
   del aviso. Se comparan los contenidos de cada fuente, sin invalidar marcas por
   navegación, aprobación del PES o un nuevo sello de aprobación del recordatorio.
   Si cambia una fuente, se solicita revisar esa fuente y se explica el motivo.
2. Los avisos aparecen centrados, sin fondo que bloquee la pantalla ni captura de
   foco. Se cierran manualmente o a los tres segundos. Cada nuevo aviso reinicia
   su propio plazo y el anterior cancela su temporizador.
3. El PES conserva P y S cuando falta sustento etiológico. El prompt `@10` pide
   revisar factores específicos actuales e históricos antes de abstenerse y
   formular preguntas concretas. No exige un recordatorio para cualquier hipótesis
   ni permite convertir una medición en una causa. `NA`, `N/A`, `No aplica` y otros
   marcadores no se consideran una etiología válida en tarjetas, aprobación o IA.
4. Los objetivos se comprueban antes de contar tokens, reservar créditos o llamar
   al proveedor: necesitan PES aprobado, etiología con información y signos.
   La pantalla explica el requisito y permite regresar al PES. El prompt `@6`
   contempla objetivos de observación cuando falta una frecuencia inicial, sin
   inventar datos o metas clínicas. Un resultado vacío, inválido o perdido durante
   el procesamiento se registra con su uso real y se compensa mediante un reintegro
   idempotente. No se presenta una lista vacía como una propuesta exitosa. El
   historial de propuestas ya atendidas impide que una recuperación antigua
   sustituya la nueva respuesta. Si falla solo el checkpoint, el texto válido
   se entrega con aviso para guardar, en lugar de ocultarlo tras un error.

Guardar o cerrar la consulta sigue siendo independiente de completar estas
secciones. Se conservan el modelo Luna, la política de capacidad y los precios.
Los expedientes aprobados previamente no se reescriben para inventar una causa.

## Contabilidad y publicación

- El reintegro está limitado al servicio de backend. No es ejecutable por usuarios
  autenticados ni anónimos. Comprueba propietario, función, versión, estado y débito
  real. Cada generación usa una clave de ajuste determinista y deja auditoría.
- Se compensaron dos resultados históricos vacíos aún demostrables por su propuesta
  guardada: 0.139 créditos. No se infirió un resultado vacío por su número de tokens.
- Los tokens, el costo del proveedor y el débito original permanecen en la auditoría;
  el ajuste positivo restituye el saldo. Una repetición no vuelve a acreditar.
- Migración de integridad primero, Edge `ai` versión 51 con JWT requerido después,
  y activación de `pes_diagnosis@10` / `consultation_support@6` al final.
- Fuentes del Edge publicadas contrastadas; configuración, permisos y entradas
  reales de reintegro comprobados mediante consultas. Asesores sin avisos nuevos.
- TypeScript del frontend, ESLint de archivos cambiados, `deno check` del handler
  y build de producción sin errores. No se ejecutaron solicitudes pagadas de prueba.

Referencia: [Structured Outputs de OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs).
