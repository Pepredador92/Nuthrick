# Recuperación de la generación PES — 20 de octubre de 2026

## Incidente

La versión `pes_diagnosis@7` rechazaba el borrador completo cuando una nota
adicional usaba una cifra sin citar su fuente en la lista global de evidencias.
En la reproducción, el PES principal, el esquema y las evidencias literales
eran válidos. Las cifras de las notas estaban en el contexto, pero sus fuentes
no habían sido incluidas en la respuesta del proveedor.

Se compensaron cuatro intentos afectados, por un total de 0.766 créditos,
mediante ajustes idempotentes y auditados. Se conservaron el consumo real,
los costos del proveedor y los movimientos originales.

## Corrección

- `pes_diagnosis@8` conserva las instrucciones de síntesis clínica. El proveedor
  cita identificadores de hechos y el servidor incorpora sus fuentes literales.
- Las referencias y las cifras del PES principal deben estar sustentadas.
  Una nota adicional no verificable se omite y se señala la necesidad de revisión;
  su contenido no se devuelve ni impide entregar un PES principal válido.
- El contrato público del borrador conserva sus campos existentes. La aprobación
  del profesional sigue siendo una operación separada.
- Las respuestas PES @8 con estado `invalid_output` reciben un reintegro
  idempotente de los créditos realmente descontados. El RPC verifica titular,
  estado, versión y contabilidad, y solo puede ejecutarlo `service_role`.
- El mensaje de interfaz diferencia el reintegro confirmado del pendiente.
  El servidor registra códigos técnicos de rechazo sin texto clínico.

## Comprobaciones

- 72 pruebas del servidor y 28 pruebas de interfaz aprobadas.
- Comprobación de tipos de Deno y TypeScript, ESLint de los archivos de interfaz
  modificados y compilación de producción aprobados.
- Ejecución del flujo completo con proveedor real y el contexto del incidente:
  75 hechos de entrada, resultado válido, 14 evidencias y una sola generación.
  Se usó un almacén en memoria, sin descontar créditos profesionales ni escribir
  en el expediente. Las capturas clínicas permanecen fuera del repositorio.
- `scripts/test-pes-validation-refund.sql` comprobó monto, idempotencia,
  auditoría, titularidad, estado, contabilidad y permisos. Sus datos se revierten.
- Edge Function `ai` versión 40 activa y contenido remoto verificado; migración
  `20261020192322` aplicada y configuración de producción en `pes_diagnosis@8`.
  Se conserva el modelo y los límites previamente configurados.
- El análisis de seguridad de Supabase conserva los avisos preexistentes y no
  identifica el nuevo RPC como accesible para usuarios autenticados.
