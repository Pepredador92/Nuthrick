# Revisión clínica completa para el diagnóstico PES

El adaptador `pes_diagnosis@6` exige revisar todas las categorías presentes en el contexto: entrevista, antropometría, mediciones de equipo, cálculos, laboratorio, recordatorio confirmado, ficha y antecedentes pertinentes. Los hallazgos que respaldan el problema se incorporan a signos y síntomas con evidencia literal. Los hallazgos importantes que requieren otra valoración se señalan en las incertidumbres del borrador.

La fuente de contexto conserva las mediciones y cálculos actuales y añade los laboratorios actuales e históricos con unidades, intervalo de referencia, comparación registrada, método y fechas. En seguimiento se seleccionan la consulta inicial y las tres consultas completadas más recientes disponibles. Los antecedentes conservan su carácter histórico.

## Activación en producción — 20 de octubre de 2026

- Proyecto: `qlsqhvyrslclmlstlemn`.
- Función Edge `ai`: versión **38**, estado `ACTIVE`, autenticación JWT activa.
- Migración: `20261020175005_pes_comprehensive_clinical_review.sql`, aplicada después del despliegue de la función.
- Configuración confirmada: `pes_diagnosis@6`, habilitada, modelo existente `gpt-5.6-luna`.
- Los archivos publicados se compararon con los archivos preparados para la versión. Se conservaron las correcciones de IA que ya estaban desplegadas.

## Comprobaciones

- `deno check` sobre el punto de entrada de los archivos publicados.
- 49 pruebas de contexto, evidencias y ejecución de IA aprobadas sobre esos mismos archivos. La regresión de `core_test.ts` cubre las versiones PES @5 y @6, composición del enunciado y rechazo de cifras sin evidencia.
- `scripts/test-pes-comprehensive-context.sql` aprobado antes y después de activar la migración, mediante transacciones revertidas con datos sintéticos. Comprueba consulta inicial, seguimiento, medidas, laboratorios, referencias, fechas, antecedentes y aislamiento por propietario.
- Comprobación del contexto de una consulta inicial activa: contiene mediciones y cálculos, incluidos IMC y porcentaje de grasa corporal, sin exportar datos personales ni valores clínicos.
- La función responde con `401` a peticiones sin autenticación. El contexto clínico sigue restringido a los roles del servidor. El asesor de seguridad conserva los avisos anteriores sin añadir avisos.

Estas verificaciones no generan diagnósticos con el proveedor real ni consumen créditos de los profesionales. Los borradores ya generados conservan su contenido; una nueva generación utiliza la versión activada. Su aprobación profesional sigue siendo necesaria antes de usarla para los objetivos y estrategias.
