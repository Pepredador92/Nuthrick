# Entrevista inicial, versión 2

Alcance: propuesta del usuario, entrevista previa a antropometría. No se ha
implementado antropometría nueva, laboratorio, diagnóstico automático ni
prescripción en esta entrega. La plantilla de seguimiento conserva su contenido
anterior; comparte las mejoras de captura, editor y revisión.

## Cobertura implementada

- [x] Motivo, expectativas, por qué ahora, inicio, desencadenantes y experiencias previas.
- [x] Fuente de información / acompañante, diagnósticos con situación y seguimiento,
  cirugía / hospitalización, etapa de vida y antecedentes por familiar.
- [x] Medicamentos y suplementos: nombre, dosis/unidad, frecuencia, momento,
  motivo, antigüedad, quién lo indicó y pendientes por verificar.
- [x] Apetito; síntomas digestivos, generales, piel/cabello/uñas; caracterización
  de los relevantes por inicio, frecuencia, impacto, desencadenantes y atención.
- [x] Horas y continuidad del sueño, descanso, señales referidas y turnos.
- [x] Actividad cotidiana, sedentarismo, traslado, ejercicio, fuerza y limitaciones.
- [x] Alcohol, nicotina y otras sustancias con cantidad y frecuencia.
- [x] Recordatorio de un día: lista, olvidos, horarios, porciones/preparación y revisión.
- [x] Patrón habitual separado; frecuencia por 16 grupos y cantidades de bebidas.
- [x] Jornada, oportunidades reales para comer, equipamiento, preparación y barreras.
- [x] Preferencias; alergia confirmada/sospechada e intolerancia diagnosticada/percibida.
- [x] Compras, presupuesto, acceso, escasez referida y apoyos.
- [x] Relación con la comida, hambre/saciedad, emociones y experiencias que requieren exploración.
- [x] Síntesis revisable; diferencia entre información referida y criterio profesional.

## Experiencia y persistencia

14 bloques, 103 preguntas configurables (incluyen grupos de registros y campos
condicionales). Solo una nota larga opcional en la plantilla. Ningún síntoma ni
respuesta se marca por defecto. “Ninguno”, “no sabe” y “prefiere no responder” son
excluyentes cuando corresponden. Los campos opcionales no bloquean el cierre.

Desde **Plantillas → Entrevista inicial** se puede probar sin crear pacientes,
crear una copia y cambiar guiones, preguntas, tipos, opciones, campos de registros,
obligatoriedad y orden. Se guardan todos los cambios juntos, con verificación de
versión; los elementos desactivados siguen editables. Las condiciones existentes
se conservan: no se incluye todavía un editor visual de reglas complejas.

Un borrador previo muestra **Usar entrevista actualizada**. La adopción es explícita
y crea una revisión adicional; no cambia la plantilla personal ni el historial
cerrado. Copia únicamente respuestas con clave, tipo, área y opciones compatibles.
Las demás permanecen consultables en la revisión anterior. No se hizo conversión
masiva de respuestas ni se modificaron expedientes reales al instalar la plantilla.

Los guardados se serializan. Fallar al guardar detiene la navegación de sección y
los enlaces internos se guardan antes de salir. La recarga advierte si hay datos
pendientes. No se guardan respuestas clínicas en localStorage.

## Verificación reproducible

- `cd frontend && npm run lint && npm run typecheck && npm test && npm run build`
- SQL: `supabase/tests/database/rls.sql` (30 comprobaciones) e
  `supabase/tests/database/interview_revisions.sql` (29 comprobaciones), con rollback.
- UI con datos ficticios y servicios en memoria: ver `frontend/qa/README.md`.
- Resultado de esta entrega: 42 pruebas de frontend, compilación, lint y tipos
  correctos; 59 comprobaciones SQL sin fallos. Verificación visual a 375, 768 y
  1440 px, incluyendo captura de medicamentos y frecuencias, guardado al navegar,
  copia/edición de plantilla y actualización de borrador con datos ficticios.
- Supabase: migraciones registradas como `20260902222858` y `20260902222900`.
  La instalación dejó las consultas existentes en su revisión original y no dejó
  cuentas de prueba persistidas.
- Datos de plantilla: `frontend/src/features/consultations/interviewTemplate.ts`.
  La migración de semilla se imprime con `node --experimental-strip-types scripts/print-interview-seed.mjs`.

## Fuera de esta entrega

- [ ] Antropometría e historia cuantitativa de peso.
- [ ] Laboratorios, interpretación diagnóstica/PES, prescripción y ADIME completo.
- [ ] Ampliación clínica del seguimiento e indicadores longitudinales.
- [ ] Portal de preconsulta para el paciente, consentimientos y módulos especializados.
- [ ] Instrumentos validados de cribado: no se ofrecen puntuaciones SCOFF ni Hunger Vital Sign.

La estructura se apoya en la propuesta proporcionada y en los dominios del
[NCP: Nutrition Assessment](https://www.eatrightpro.org/practice/nutrition-care-process/ncp-overview/nutrition-assessment).
La captura de recordatorio incorpora pasos de entrevista descritos por
[USDA AMPM](https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/food-surveys-research-group/docs/ampm-usda-automated-multiple-pass-method/),
sin presentarse como implementación validada o equivalente al instrumento USDA.

## Comprobación del servidor publicado

Se detectó un HTTP 500 posterior a una compilación exitosa. Se reprodujo un fallo
de interoperabilidad de `tslib` al empaquetar Supabase (`__extends` sobre un
`default` indefinido), coincidente con el
[reporte de Rolldown](https://github.com/rolldown/rolldown/issues/10360).
También se reprodujo la ausencia de `cookie` (dependencia de React Router) al
ejecutar el artefacto fuera del repositorio. Se fija la entrada ESM de `tslib` y
se empaquetan las dependencias tanto en Vite SSR como en Nitro.
`NITRO_PRESET=vercel npm run build` ahora copia el artefacto a una carpeta temporal
aislada, sin acceso al `node_modules` del proyecto, y ejecuta el handler compilado
en `/`, `/login` y `/app/consultation-templates/initial`; falla si recibe HTTP 500
o una página de error. No inicia sesiones ni escribe datos clínicos.

## Avisos previos, no introducidos por esta entrega

El asesor de seguridad sigue indicando que la
[protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
está desactivada. No se modificó Auth ni se debilitó ningún control de acceso.
Persisten avisos informativos de
[claves foráneas sin índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
en módulos anteriores y de
[índices todavía sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
No se eliminaron índices ni se cambiaron módulos ajenos a la entrevista.
