# Taller IA — Fase 4B: implementación mínima para revisión

22 de septiembre de 2026. Sin commit, push, merge ni deploy. No se inicia otra fase.

## 1. Alcance y archivos

Base: HEAD `2ba8d35178f8656f7160dffb12edd42ae0938433`. Baseline: 169 pruebas focales aprobadas antes de editar.

Modificados por esta fase:

- `frontend/src/components/diet/DietMenuStep.tsx`: ranura de acciones en el encabezado; ningún otro acomodo cambia.
- `frontend/src/components/diet/DietWorkshopAI.tsx`: se adapta el componente existente y su dialog nativo.
- `frontend/src/components/diet/DietWorkshopAI.test.tsx`: se actualizan las tres pruebas del transporte antiguo y se amplía a doce casos de UX.
- `frontend/src/screens/DietWorkshopPage.tsx`: un solo acceso, exclusivamente en Menú; aplicación permanece en Menú.
- `frontend/src/services/dietWorkshopAI.ts`: conexión al flujo diet_draft existente, no al antiguo diet_workshop.
- `supabase/functions/ai/core.ts`: permite indicaciones diet_draft en narrative, texto máximo 1200 caracteres. La huella existente ya incluye narrative; no se modifica su algoritmo.
- `supabase/functions/ai/index.ts`: preflight autenticado de lectura, paso de indicaciones a additionalInstructions y devolución del resultado validado disponible en replay.
- `supabase/functions/ai/diet_test.ts`: ajusta la prueba contractual por el texto acotado ahora permitido, manteniendo el rechazo de payload, modelos, propietario y reglas del cliente.

Nuevos:

- `frontend/src/components/diet/dietCopilotPresentation.ts`: etiquetas profesionales, desconocidos y formato numérico.
- `frontend/src/services/dietWorkshopAI.test.ts`: cinco pruebas del transporte.
- `frontend/tests/fixtures/dietCopilotUX.ts`: FakeDietGenerator con elegibilidad, recálculo y adaptador reales del dominio, sin proveedor.
- `frontend/tests/visual/taller-phase4b.html` y `taller-phase4b.tsx`: escenarios ficticios.
- `frontend/tests/visual/phase4b-check.mjs`: recorrido de 27 estados/tamaños con red externa bloqueada.
- `supabase/functions/ai/diet-ux.ts`: proyección mínima y saneada del contexto; invoca getDietGenerationEligibility existente.
- `supabase/functions/ai/diet_ux_test.ts`: tres pruebas de proyección, privacidad e indicaciones.
- `supabase/functions/ai/diet_ux_http_test.ts`: prueba HTTP del preflight con dependencias interceptadas.
- Este informe.

### Incompatibilidad objetiva resuelta

El componente anterior enviaba feature=diet_workshop y aplicaba un preview firmado antiguo. Fase 3 implementa diet_draft con snapshots y validación, pero no exponía una consulta previa de elegibilidad/contexto al frontend y rechazaba narrative para esa función. Sin esta pequeña ampliación no era posible presentar el contexto real ni enviar las indicaciones solicitadas. Se mantiene /functions/v1/ai; no hay segundo generador, nuevas tablas, migraciones, cambios de provider, tolerancias, selector de candidatos, presupuesto o mecanismo de idempotencia.

El preflight no reserva créditos. Lee disponibilidad y saldo; la reserva existente sigue siendo la autoridad final para presupuesto suficiente y límites diarios, que pueden cambiar entre revisión y generación.

## 2–19. Experiencia implementada

2. Único botón «Crear propuesta con IA» en el encabezado de Nuthrick a la Mesa, junto a Vista clásica. No se monta en otros pasos.
3. DietWorkshopAI sigue siendo el punto de integración; no se añadió otro componente raíz ni drawer.
4. Dialog nativo, ancho máximo 820 px, altura máxima 90dvh, scroll interno, botones y colores existentes.
5. Estado inicial: explicación de que el borrador no cambia hasta aplicar, acción Revisar contexto y generación habilitada solo con elegibilidad aprobada.
6. Contexto bajo demanda: prescripción, PES/objetivo aprobados, tiempos, reacciones/restricciones, preferencias y rutina. Desconocido permanece «No especificado». No aparecen expediente completo, candidatos, tokens, modelo, IDs o hashes.
7. Indicaciones adicionales: textarea opcional acotado, helper solicitado. El servidor sanea el texto antes del snapshot/proveedor.
8. Loading: «Preparando propuesta…», borrador intacto, controles deshabilitados y bloqueo síncrono de doble envío. Se conserva el control de solicitudes inciertas por clave, sin regeneración automática.
9. Preview: tiempos, nombres, cantidades, unidades e instrucciones de receta cuando existen. Solo lectura.
10. Comparación: objetivo/propuesta/diferencia para kcal, proteína, carbohidratos y grasa. Solo validation.totals recalculados por el dominio; no valores declarados por el LLM. Dos columnas en escritorio/tablet, una en móvil.
11. VALID: «Compatible con la prescripción» y revisión profesional. Si el validador exige aceptar diferencias nutricionales, sigue siendo obligatorio aunque las porciones coincidan.
12. NEEDS_ADJUSTMENT: «Requiere revisión», ámbar, diferencias numéricas y checkbox. No usa ErrorState ni crea tolerancias nuevas.
13. INVALID: «Esta propuesta no se puede aplicar», explicación legible y sin botón de aplicación. El handler descarta el output malformado; en ese caso se muestra la causa segura de estructura inválida, no el contenido bruto.
14. Aplicar: usa apply_diet_draft existente; solo cambia el menú del borrador, no publica ni aprueba. Cierra el dialog y actualiza el Taller normal permaneciendo en Menú.
15. Menú previo: confirmación dentro del mismo dialog; Cancelar conserva el trabajo; Reemplazar con propuesta IA requiere acción explícita. No hay merge automático. Se lleva foco y scroll a la confirmación.
16. Contexto obsoleto: preflight fresco antes de aplicar compara contexto; la protección de revisión/stamp del servidor permanece como autoridad final. Se bloquea la aplicación ante cambios.
17. Descartar: abandona la propuesta según el flujo existente; no modifica menú, prescripción, PES, Objetivo, tiempos ni equivalentes.
18. Procedencia: no se añadió un campo de origen a DietMenu/NutritionPlan. La trazabilidad existente sigue en el registro técnico de generación; solo se muestra confirmación discreta al aplicar, sin modelo/proveedor ni banner permanente de IA.
19. No existe segundo editor. La edición continúa con alimentos, recetas y controles normales de Mesa.

## 20–26. Preservación, responsive y accesibilidad

20. Entrevista, PES y Objetivo: cero cambios. Hash de ConsultationPage y archivos de componentes clínicos preservados. No se corrigió su problema previo de pestañas móviles.
21. Equivalentes, Tiempos, selector de candidatos, dominio nutricional y snapshots: sin cambios. Bundle compartido verificado con build-diet-generation-domain.mjs --check.
22–24. Capturas a 1440×1000, 834×1112 y 390×844. Nueve estados en cada tamaño; 27 capturas. Sin desbordamiento horizontal del diálogo.
25. Foco inicial en título, Tab dentro del dialog, Escape cuando no hay operación pendiente, devolución del foco al botón, labels/ayuda del textarea, disabled, role=status/alert y estados textuales. No se realizó una auditoría exhaustiva con lector de pantalla.
26. Fixture local con datos sintéticos de calibración, FakeDietGenerator y backend simulado. No usa expedientes reales ni guarda datos remotos. Su estado loading permanece intencionalmente pendiente para inspección; cambiar de ruta permite salir.

## 27–31. Verificación

27. Doce casos de componente y cinco del servicio cubren entrada única, ausencia en Entrevista, elegibilidad, contexto privado/desconocido, indicaciones, doble clic, loading, estados, recálculo, aplicación draft sin publicación, cierre, confirmación/cancelación, contexto obsoleto, descarte y solicitud incierta. La regresión manual existente continúa pasando.
28. Regresión final focal: **306 pruebas aprobadas en 29 archivos**. Backend: **102 pruebas aprobadas + 19 pasos HTTP**, dependencias simuladas y permiso de red limitado a localhost. El nuevo preflight HTTP verifica autenticación, propietario, privacidad, saldo y ausencia de llamadas al proveedor.
29. `npm run typecheck`: aprobado.
30. ESLint focalizado de los archivos frontend y fixtures de la fase: aprobado. `git diff --check`: correcto.
31. No se ejecutó suite global ni se corrigió el fallo conocido del landing. Los hashes inicial/final de sus dos archivos coinciden.

## 32. Git status final esperado

```text
 M frontend/src/components/diet/DietMenuStep.tsx
 M frontend/src/components/diet/DietWorkshopAI.test.tsx
 M frontend/src/components/diet/DietWorkshopAI.tsx
 M frontend/src/screens/DietWorkshopPage.tsx
 M frontend/src/screens/LandingPage.test.tsx
 M frontend/src/screens/LandingPage.tsx
 M frontend/src/services/dietWorkshopAI.ts
 M supabase/functions/ai/core.ts
 M supabase/functions/ai/diet_test.ts
 M supabase/functions/ai/index.ts
?? docs/diet-ai-phase-4b-ux.md
?? frontend/src/components/diet/dietCopilotPresentation.ts
?? frontend/src/services/dietWorkshopAI.test.ts
?? frontend/tests/fixtures/dietCopilotUX.ts
?? frontend/tests/visual/phase4b-check.mjs
?? frontend/tests/visual/rollback-fixtures.ts
?? frontend/tests/visual/rollback-interview.html
?? frontend/tests/visual/rollback-interview.tsx
?? frontend/tests/visual/rollback.vite.config.ts
?? frontend/tests/visual/taller-phase4b.html
?? frontend/tests/visual/taller-phase4b.tsx
?? output/
?? supabase/functions/ai/diet-ux.ts
?? supabase/functions/ai/diet_ux_http_test.ts
?? supabase/functions/ai/diet_ux_test.ts
?? tmp/
```

Landing, rollback fixtures, output/ y tmp/ son cambios/locales anteriores, no de esta fase. No se editaron. Capturas nuevas fuera del repositorio en `/Users/jose/Documents/Proyectos/Nuthrick-fase4B-upRfXV`. Índice vacío.

## 33–35. Consumo y publicación

33. Cero llamadas reales OpenAI. Recorrido Chromium: cero solicitudes externas. Pruebas backend: transporte falso, red restringida a localhost.
34. Consumo adicional US$0; acumulado documentado **US$0.068974**. No es una consulta de saldo ni una afirmación sobre consumo externo a esta tarea.
35. Sin commit, push, merge, deploy ni cambios de base de datos. La extensión del endpoint está solo en código local; no se afirma que esta UX esté habilitada en producción.

## 36. Rutas exactas

Servidor de revisión: desde frontend, `./node_modules/.bin/vite --config tests/visual/vite.config.ts --port 4195 --strictPort`.

- Normal: http://127.0.0.1:4195/tests/visual/taller-phase4b.html?state=normal
- Inicial: http://127.0.0.1:4195/tests/visual/taller-phase4b.html?state=initial
- Contexto: http://127.0.0.1:4195/tests/visual/taller-phase4b.html?state=context
- Loading: http://127.0.0.1:4195/tests/visual/taller-phase4b.html?state=loading
- VALID: http://127.0.0.1:4195/tests/visual/taller-phase4b.html?state=valid
- NEEDS_ADJUSTMENT: http://127.0.0.1:4195/tests/visual/taller-phase4b.html?state=needs_adjustment
- INVALID: http://127.0.0.1:4195/tests/visual/taller-phase4b.html?state=invalid
- Reemplazo: http://127.0.0.1:4195/tests/visual/taller-phase4b.html?state=replace
- Aplicada: http://127.0.0.1:4195/tests/visual/taller-phase4b.html?state=applied

## 37–39. Límites y decisión

37. La revisión por tiempos requiere scroll interno en móvil; las acciones permanecen accesibles. La fuente de las fixtures es fallback de sistema, no la Geist cargada por el layout Next de producción. Las unidades conservan las etiquetas actuales del sistema (por ejemplo, «2 tortilla»); no se modificó ese catálogo. El problema previo de pestañas de Entrevista sigue fuera de alcance.
38. Se conserva el wireframe A sin rediseñar Mesa. No se muestran horarios aunque existan en el plan: el payload de Fase 3 envía nombres de comidas, no horarios; mostrarlos como contexto enviado sería inexacto. Se eligió preservar ese contrato. Indicaciones adicionales usan narrative ya fingerprinted; es la única ampliación de entrada acotada. La comprobación técnica no sustituye revisión clínica ni publicación explícita.
39. **Fase 4B lista para revisión visual local: sí.** Se detiene para aprobación. No se implementan otras funciones.
