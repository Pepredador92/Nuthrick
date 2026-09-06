# Historial comparativo longitudinal

La pestaña **Evolución** de la ficha del paciente muestra una matriz de solo
lectura. Cada columna representa una consulta y se ordena por
`consultation_date` ascendente; la hora distingue consultas del mismo día.

## Origen de los datos

La vista no conserva una copia clínica adicional ni recalcula resultados.

| Sección | Fuente | Identidad que evita mezclar series |
| --- | --- | --- |
| Mediciones registradas | `consultation_measurements` sin `device_session_id` | tipo de medición + unidad |
| Mediciones históricas vinculadas | `patient_measurements` | consulta de origen; peso, estatura e IMC ya guardados |
| Datos calculados | `consultation_calculation_results` | código, resultado, método, versión y unidad guardados |
| Bioimpedancia | `consultation_measurements` con sesión y `consultation_device_sessions` | tipo, unidad y equipo profesional |
| Laboratorios | `laboratory_results` unido a `laboratory_reports` | analito, unidad, tipo de muestra y método analítico |

Los valores que no se capturaron en una consulta se muestran como `—`: no hay
arrastre, interpolación ni sustitución. Los comparadores de laboratorio, por
ejemplo `<5`, permanecen textuales y no se transforman en un valor calculado.
Si dos reportes equivalentes pertenecen a una misma consulta, ambos se muestran
en la celda para no perder procedencia.

## Seguridad y rendimiento

`loadLongitudinalHistory` realiza una lectura agrupada y acotada por
`patient_id`. Se apoya en las políticas RLS ya vigentes de consultas,
mediciones, resultados calculados, sesiones de equipo y laboratorios; no usa
funciones `SECURITY DEFINER`, no crea una tabla de resumen y no realiza una
consulta por fila o por consulta.

La matriz abre la consulta de origen al pulsar su fecha o un valor, pero no
permite editar datos dentro de Evolución.

Las mediciones antiguas que no tienen `consultation_id` no se asignan a una
consulta por inferencia: hacerlo alteraría la trazabilidad. Permanecen visibles
en su historial original hasta que exista una asociación clínica válida.
