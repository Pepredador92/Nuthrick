# Medición guiada: alcance y comprobación

Se reutilizan ConsultationPage, AnthropometryPanel, el motor/referencias existentes, los servicios Supabase y consultation_anthropometry con sus revisiones. patient_measurements conserva sus registros antiguos (peso/talla/IMC generado); no se reescriben como si fueran nuevos. Las entidades de mediciones registradas y cálculos se modelan por separado dentro de la revisión y se exponen mediante vistas de lectura con RLS, evitando una segunda fuente de verdad clínica.

Trabajo implementado: tipos y catálogo extensible; definiciones de cálculo y dependencias; constructor de formulario; selector buscable de equipos; plantilla propia por paciente; ampliación de los servicios y de AnthropometryPanel; historial; migración de catálogos/plantillas/vistas; pruebas unitarias, UI, RLS e integración. La publicación se realiza después de completar esta comprobación.

Conflictos: el expediente tiene género, no sexo de ecuación; se añade un dato explícito reutilizable sin inferirlo del género. Los registros antiguos carecen de IDs por medición: se conservan intactos y sólo se adaptan al editar creando una revisión nueva. Las nuevas plantillas nunca actualizan una revisión anterior. No se implementan coeficientes no documentados.

## Evidencia requerida antes de completar

- [x] Catálogo inicial completo (generales, ocho circunferencias, diez pliegues, cinco diámetros, once valores de equipo) y extensión personalizada.
- [x] Catálogo independiente de equipos: búsqueda, fabricante/modelo, personalizados, propiedad.
- [x] Dos entradas: indicadores o registro libre; requeridas/adicionales, motivos, deduplicación, sólo campos seleccionados.
- [x] Dependencias: básicos, densidad, Siri/Brozek, masa grasa y libre de grasa; disponibilidad/missing inputs específicos y recálculo identificable.
- [x] Cada entrada tiene ID/origen/unidad/equipo/fecha; cada cálculo conserva dependencias por ID, contexto, raw/display, método/versión/fecha/referencia.
- [x] Datos del expediente y edad en fecha de consulta; reutilización explícita de talla con fecha, peso/circunferencias vacíos en seguimientos.
- [x] Plantilla paciente persistente, carga automática, edición habitual o sólo hoy, aislamiento de pacientes, preservación histórica y control de concurrencia.
- [x] RLS en tablas y vistas, referencias e integridad paciente/consulta/propietario; revisión de asesores.
- [x] Tests, lint, typecheck, build y migraciones aplicadas.
- [x] Publicación en Vercel confirmada.
