# Cierre técnico HTTP de PES + Objetivo

2026-09-21, hora local; ejecución UTC 2026-09-22. No publicación.

## Ruta real inspeccionada

`frontend/src/services/ai.ts:runAIRequest` llama a `supabase.functions.invoke('ai', {body})`. El SDK añade `Authorization: Bearer <access_token>` y `apikey`; JSON usa `Content-Type: application/json`. Endpoint local: `http://127.0.0.1:54321/functions/v1/ai`; remoto configurado: `https://qlsqhvyrslclmlstlemn.supabase.co/functions/v1/ai` (no invocado en esta fase). Método POST, OPTIONS para preflight. Origin se limita a AI_SITE_URL (predeterminado nuthrick.vercel.app). Respuestas no-store y nosniff.

Gateway `verify_jwt=true`; la función vuelve a verificar con `auth.getUser(token)` y rechaza usuarios anónimos. El propietario se obtiene de esa sesión, jamás del payload. La función usa service_role exclusivamente en servidor; `ai_clinical_source` comprueba paciente, profesional, consulta draft y revisión. La configuración y créditos/piloto se consultan y reservan en servidor antes del proveedor.

Entrada PES: `{feature:'pes_diagnosis', idempotencyKey:UUID, patientId:UUID, consultationId:UUID, revision:entero>=1}`. IDs no admiten null/cadenas vacías. No acepta narrativa, contexto, profesional, modelo, precios ni propiedades desconocidas. El contrato genérico incluye otros campos para otras features; no son válidos para PES. Body PES limitado a 60000 bytes; lectura streaming acotada a 750000 bytes en el handler compartido.

Contexto: respuestas permitidas de la entrevista, mediciones, cálculos y laboratorios de la base. Redacta identificadores; mantiene valores/unidades y fecha de medición. Las respuestas de entrevista JSON conservan comillas en su representación textual; no se recalibró el modelo ni se cambiaron esos datos. El caso A completo produjo 5 facts, peso 70 kg y estatura 170 cm, con timestamp 2026-09-21T12:00:00Z y nombres de catálogo. El contexto de servidor no es una copia arbitraria enviada por cliente.

Salida exitosa: `{generationId, status:'succeeded', output:PesDraft, replay:false}`. Replays pueden devolver estado e ID sin output, sin nueva generación. `PesDraft` exige problem (<=500), etiology (<=1500), pesStatement (<=2000), signsSymptoms, evidence, missingContext y uncertainties; arrays <=30, textos <=2000, evidence con source/finding obligatorios. Sin nulls ni campos extra. Las cadenas diagnósticas vacías son válidas como abstención informativa, pero no como aprobación. Parser JSON + AJV + cotejo literal de evidencia contra facts preceden al retorno. Datos no válidos nunca se devuelven como PES listo, aunque su consumo se registra.

Errores: handler 405 method_not_allowed, 400 invalid_request, 401 unauthorized, 402 insufficient_credits; otros errores técnicos 409 con `{error:code}`. Gateway puede devolver 401 con su propio cuerpo `Invalid JWT format`. Provider timeout configurado 30000 ms, AbortSignal; no reintenta timeout/5xx/error de red incierto. Solo puede reintentar una respuesta explícita 429; no hubo ninguna en la llamada real. Cliente no tiene un timeout adicional explícito; marca incertidumbre y consulta estado para evitar duplicación. RPC internos idempotentes admiten un segundo intento, no una nueva generación.

Generar persiste exclusivamente reserva, consumo, estado y vínculo a revisión/stamp; no aprueba ni escribe respuestas clínicas. UI ofrece revisar/editar. Aprobación posterior: `clinical_workspace` → `save_consultation_responses` y auditoría. `clinical_objective` mantiene aprobación independiente. Las kcal/macros no se generan con IA ni se alteran desde estas operaciones.

## Fallos reales y correcciones

1. Body JSON null provocaba acceso a `.action` y 409 genérico. Ahora se valida objeto antes del acceso: 400.
2. El diagnóstico de proveedor copiaba su campo code arbitrario al log. Prueba adversarial con un secreto centinela demostró exposición potencial. Ahora solo se conservan códigos técnicos enumerados; texto desconocido nunca se imprime.
3. Contexto completamente vacío podía consumir API sin sustento. Ahora falla con context_unavailable antes de reservar/llamar. Contexto incompleto con facts sigue permitido.
4. Con auto_expose_new_tables=false faltaban SELECT de service_role para perfiles, pacientes, consultas, mediciones, catálogo, cálculos y laboratorios. La prueba HTTP real de contexto falló antes de OpenAI. Migración `20260922044231_clinical_http_service_permissions.sql` añade solo lectura del servidor sobre tablas requeridas. No concede permisos nuevos a anon/authenticated ni cambia RLS.

No refactor de arquitectura, modificación del prompt ni cambio del modelo. Se mantienen tres definiciones que requieren vigilancia: PesDraft frontend (tipo), pesSchema servidor (validación completa) y límites de aprobación SQL/frontend. No son idénticas por diseño: un borrador puede abstenerse; una aprobación requiere problema/enunciado/signos no vacíos. Las cotas principales y respuestas reales se cubren en tests; no se creó otro schema de respuesta en el nuevo harness HTTP.

## Validación sin consumo

`supabase/functions/ai/http_test.ts` levanta el handler real de index.ts en HTTP loopback, interceptando solo dependencias externas. 18 pasos: métodos, JSON inválido/null/array, campos ausentes, nulls y revisión inválida, propiedad desconocida, auth ausente/inválida, contexto ajeno/vacío, respuesta que rompe schema, upstream 503, timeout, respuesta válida y secretos fuera de logs. Nunca permite conexión real al proveedor.

`clinical_calibration_test.ts` añade matriz de schema completo: campos requeridos, nullables rechazados, tipos, límites exactos/excedidos, arrays, campos desconocidos y abstención. Pruebas anteriores preservan unidades, fechas y cantidades.

Runtime real: `supabase functions serve ai --env-file supabase/functions/.env`, gateway y Supabase Auth/PostgREST locales reales. El local tenía 0 usuarios/0 pacientes y migraciones hasta 20260915171014. Se aplicó la cadena ya existente pendiente, sin editar código de Taller; después la migración correctiva de permisos. No reset, ni base remota ni despliegue. Se creó únicamente un usuario/paciente/consulta/plan sintéticos, con portal deshabilitado. Preflight autenticado verificó 400 para requests inválidos, 401 para token inválido, 409 context_unavailable para paciente ajeno, cinco facts con unidades correctas y cero generaciones antes del envío real.

## Una sola llamada real

Evidencia reproducible: `output/pes-http-real-20260922.json`. El script deja un marcador exclusivo antes del envío y no permite repetir automáticamente.

- Caso A, POST HTTP al gateway local; una generación real, sin rechazo ni reintento del proveedor.
- Estado HTTP 200; generación succeeded; parser/schema/evidencias válidos (condición del handler para ese estado).
- Modelo enviado/registrado por el servidor: gpt-5.6-terra. No se añadió telemetría del campo model del response upstream; el ledger conserva el modelo de la configuración enviada.
- Entrada 404, salida 433, cacheados 0, total 837 tokens.
- Latencia HTTP extremo a extremo: 8793 ms.
- Costo real calculado y asentado en ledger: USD 0.006004.
- Acumulado: USD 0.016352 + 0.006004 = **USD 0.022356**.
- Tarifas verificadas en https://developers.openai.com/api/docs/models/gpt-5.6-terra : USD 2/millón entrada y 12/millón salida. No es lectura de factura/saldo.
- Clave local nunca impresa ni copiada al reporte. Comparación en memoria del secreto contra logs del runtime y reporte: ambos negativos.

## Persistencia sobre esquema completo

La misma respuesta se aprobó con RPC HTTP y JWT del profesional sintético. Se comprobó que antes de aprobar no existía PES aprobado; después llega a Objetivo sin aprobarlo automáticamente. Objetivo se guardó con el RPC real (retorno 204, no 200 como supuesto inicialmente por el harness), se aprobó y conservó revisión 1. Cambiar entrevista invalidó PES y Objetivo. El plan completo permaneció idéntico: 2100 kcal y 100 g de proteína. No hubo otra llamada a OpenAI.

El fixture inicial debió usar response_area=professional_assessment, conforme a la restricción real; el primer intento de seed se revirtió transaccionalmente. Estas dos correcciones fueron del harness, no cambios para debilitar validaciones del producto.

## Diagnóstico separado: límite diario

En `20260922030609_ai4_pilot_controls.sql`, función ai_server/reserve:

- Protección intencional: tope total y diario por profesional/feature, presupuesto diario del profesional compartido entre features, concurrencia y frecuencia. PES está sujeto a ellos; Objetivo no llama a IA ni reserva créditos.
- Bug: compara `spent >= max_daily_credits` antes de calcular y sumar `needed`. Una nueva reserva puede superar el presupuesto. El lock de cuenta evita carreras, pero no corrige esa desigualdad.
- Reproducción sin OpenAI, dentro de BEGIN/ROLLBACK: 0.601 créditos consumidos reales + dos reservas máximas de 2.868 = **6.337**, permitidos con tope **5.000**. No quedó ninguna reserva extra.
- Posible bloqueo legítimo: el contador diario incluye intentos fallidos, aunque terminaran sin consumo; estados uncertain mantienen reservas y ocupan concurrencia hasta conciliación. Es una política conservadora que requiere decisión, distinta al bug aritmético. El día se calcula con timezone de la base, no con la zona del profesional.
- No se corrigió; no impidió esta validación. Debe tratarse antes de ampliar el piloto/publicar IA; no impide desarrollar Taller por separado.

## Resultado final y alcance

- Deno: 47 pruebas y 18 pasos HTTP, todo aprobado.
- SQL clínico: 41 comprobaciones; SQL core: 22, ambos ROLLBACK y salida exitosa.
- HTTP real de aprobación/persistencia sobre schema completo: aprobado.
- TypeScript frontend: aprobado. Frontend completo: 615 pasan / 1 fallo previo / 616 total.
- Advisors de seguridad locales, nivel error: sin incidencias.
- Landing conserva el fallo anterior de texto H1 esperado frente al real; no importa módulos clínicos ni se editó durante esta fase.
- Git: staging vacío; cambios previos conservados. Sin commit, push, merge ni deploy. Sin empezar Taller.
- PES + Objetivo técnicamente cerrados para este flujo local real, no desplegados. No hay impedimento de este bloque para empezar desarrollo de Taller; publicar requiere revisión y autorización, además de atender por separado presupuesto y landing.

Archivos de esta fase: index.ts y core.ts de ai; nuevo http_test.ts; ampliación clinical_calibration_test.ts; nuevo scripts/test-pes-http-local.mjs; nueva migración de permisos; este informe y referencia en ai-calibration.md. Reporte generado en output/. El flag local temporal NUTHRICK_AI_ENABLED se retiró al terminar. El fixture local queda identificado como prueba, sin portal ni publicación; acceso al piloto deshabilitado al cierre.
