# Fase 4E — contexto clínico compacto de diet_draft

Fecha: 2026-09-22. No cambios de UX/UI. Producción permanece deshabilitada.

## Contexto anterior y nuevo

El flujo vigente usa `buildDietGenerationContext` → `prepareDietGeneration` →
`prepareDietSnapshot`, no el antiguo `buildDietWorkshopClinicalContext`.
Incluía energía/macros deterministas, equivalentes y tiempos confirmados, PES y
objetivo aprobados, restricciones/exclusiones, preferencias, rutina, instrucciones
profesionales y candidatos acotados. No incluía R24h, antropometría ni laboratorios
directamente. No se agregaron laboratorios en esta fase.

Se añaden opcionalmente `clinical.recall24h` y `clinical.anthropometry`. La carga
procede del RPC service-only `ai_diet_source`, siempre de la consulta asociada al
borrador y su propietario. Ambos quedan dentro del snapshot y su fingerprint.
No existe un segundo cargador ni una nueva vía para enviar contexto del cliente.

### R24h

- Solo `clinical_records.recall` con `approved_at`; no narrativa, rawText,
  interpretación IA temporal ni respuestas sin confirmar.
- El SQL proyecta únicamente cantidades/unidades y alimento congelado necesario.
- El resumen usa `exchangeContributionForFood` y `calculateExchangeTotals`, los
  mismos motores de la vista de R24h. No acepta totales externos ni pide cálculos
  al LLM. Las sumas corresponden a **los alimentos confirmados**, no necesariamente
  a todo el consumo diario si el registro está incompleto.
- Hasta 150 ítems confirmados para el cálculo; nombres deduplicados por tiempo,
  máximo 8 tiempos × 8 alimentos × 64 caracteres. Si se recorta la lista se indica
  `foodListTruncated`; los totales no se recortan. Datos inválidos omiten el resumen.
- Un solo día observado, nunca un patrón habitual probado. Sin inferencias de
  déficit de verduras, frecuencias permanentes ni recomendaciones automáticas.

### Antropometría

- Solo peso, talla, cintura y composición disponibles en mediciones guardadas de
  esa consulta; IMC/composición derivados solo si ya existen y están vigentes.
- Unidades verificadas en SQL; valores positivos finitos en el proyector.
- No se recalcula IMC ni energía. No se cargan pliegues, todas las mediciones,
  notas, nombres de paciente, series históricas ni otras consultas.
- Cuando hay mediciones contradictorias de un mismo campo o varios métodos de
  cálculo sin selección explícita, se omite el valor ambiguo. Los datos directos
  únicos tienen prioridad sobre un cálculo derivado.
- `leanMassKg` corresponde al dato existente de masa libre de grasa, no a masa
  muscular. No se calcula una tendencia: aún no hay una comparación homogénea
  seleccionada que pueda usarse sin elegir métodos arbitrariamente.

## Jerarquía y prompt

`diet_draft@2`: prescripción + exclusiones obligatorias → objetivo/PES →
preferencias → alimentos observados en R24h → practicidad. Una exclusión nunca se
relaja para satisfacer un objetivo. La antropometría y el R24h no autorizan
recalcular ni cambiar la prescripción. Se conserva el adaptador @1 para trazabilidad.
El esquema de salida y los validadores no cambian.

## Tamaño y privacidad

En el mismo caso ficticio B: 10,035 → 10,385 bytes (+350; +3.49%). Estimación
JSON/4: 2,508 → 2,595 tokens (+87). No equivale a tokenización facturada.
El límite global del payload sigue vigente; hay regresiones sobre crecimiento,
historial, campos arbitrarios y privacidad del payload final.

No llegan nombres identificadores, correo, teléfono, dirección ni UUID de
profesional/paciente/consulta al provider; se conservan las referencias efímeras
de candidatos. Las fuentes internas no se publican. No se añadieron logs de
valores clínicos: la calibración imprime solo tamaños y métricas. Los resultados
anónimos de la prueba son datos ficticios.

## Verificación

- Frontend focal: 176 pruebas / 16 archivos, todas aprobadas.
- Backend IA: 110 pruebas + 19 subcasos HTTP, todas aprobadas.
- SQL local: 7 aserciones, transacción revertida: origen confirmado, peso, ausencia
  de narrativa/IDs del R24h, fingerprint, rechazo de borrador y permisos/ownership.
- HTTP real local con Auth/Postgres/handler y transporte simulado: A/B/C válidos,
  idempotencia, aplicación protegida, snapshot inmutable; cero llamadas pagadas.
- TypeScript, ESLint focal, build Vercel y 3 rutas SSR: aprobados.
- No se ejecutó una suite global del landing, fuera de alcance; su diff previo se
  conserva (SHA256 `10e35f6a7e5e7251f882211965559573776fe2de220b3c32accc45119aa9acbc`).
- Los primeros intentos de tests detectaron permisos faltantes del runner y el
  interruptor local apagado; se corrigió la invocación, no las protecciones.

## Única recalibración real Terra

Se ejecutó localmente con el adaptador real y una fuente completamente ficticia;
no se habilitó Supabase/producción ni se creó paciente alguno allí. El script
`scripts/calibrate-diet-context.ts` exige opt-in, guarda una marca de intento
duradera y permite una sola solicitud sin reintentos.

- Entrada máxima conservadora: 14,900 tokens; salida limitada a 1,024.
- Techo comprobado antes de llamar: **US$0.042088**, menor que US$0.05.
- Modelo: `gpt-5.6-terra`; prompt `diet_draft@2`.
- Entrada real: **3,447**; caché: **0**; salida: **363**; total: **3,810**.
- Latencia: **5,560 ms**; costo: **US$0.011250**.
- Resultado: completed; validator **valid**, issues vacíos.
- Totales deterministas: 1,730 kcal, 233 g CHO, 91 g proteína, 47 g grasa.
- `requiresTargetReview=true`: se conserva la revisión humana por la discrepancia
  entre los equivalentes prescritos y el objetivo de macros, sin alterar ninguno.
- No se aplicó, guardó ni publicó un plan. Sin cargos a cuentas de profesionales:
  esta llamada aislada se registra como costo de calibración del proyecto.
- Acumulado documentado: **US$0.138625** (0.127375 + 0.011250).

Referencia 4D Terra: 4,516 entrada / 575 salida / 9,437 ms / US$0.015932.
No es una comparación causal: el caso/pool sintético no es idéntico al de 4D.
El crecimiento real del contexto se compara arriba contra el mismo caso B.
La muestra de una sola llamada no demuestra una mejora clínica general.

## Seguridad, publicación y límites

No se cambiaron secretos ni interruptores reales; toda IA de producción continúa
OFF. Al terminar la llamada local el proceso finalizó, sin servidor habilitado.
Las pruebas SQL/HTTP usan únicamente el entorno local sintético. El historial
real de 4D y sus consumos permanecen intactos.

El commit final incorpora también los controles y el reporte de 4D que ya estaban
cerrados pero aún sin commit, como prerrequisito; excluye landing, rollback visual,
output y tmp. Se autoriza un solo push/despliegue final. El identificador de commit
y estado final de Vercel se entregan en el reporte de ejecución, sin un segundo
commit únicamente para introducir el hash de sí mismo.

Advisors: siguen los avisos previos de [funciones SECURITY DEFINER accesibles](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
y [protección de contraseñas filtradas deshabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Esta fase no amplía permisos ni agrega nuevas funciones expuestas.

Guías utilizadas: OpenAI Docs para modelo, costo y prompting; Supabase y Supabase
Postgres Best Practices para privacidad, permisos y consultas acotadas.
[Tarifas oficiales Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra):
US$2 / US$0.20 / US$12 por millón de tokens de entrada / caché / salida.
