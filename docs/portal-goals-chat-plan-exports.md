# Entrega: objetivos, chat y planes publicados

21 de septiembre de 2026. Proyecto Supabase: `qlsqhvyrslclmlstlemn` exclusivamente.

## Resultado funcional y arquitectura

1. El objetivo real está en `consultation_answers.value`, claves `objectives` y `next_objectives`, área `professional_assessment`. Se comprueba la revisión contra `consultation_snapshots` y la presencia de la pregunta en su estructura. De las respuestas repetibles se extrae únicamente `objetivo`, no prioridad ni otros campos privados.
2. `private.portal_goals` consulta esa fuente; no hay tabla ni columna clínica redundante. El JSON de publicación existente conserva el texto aprobado y su referencia de origen para evitar publicaciones silenciosas.
3. Las respuestas históricas no se editan. La selección del portal no escribe en consultas ni respuestas.
4. La consulta finalizada más reciente con objetivo válido se ofrece como candidata. Borradores y eliminadas quedan fuera. Una nueva consulta no cambia automáticamente lo ya aprobado para el paciente.
5. En **Qué compartir**, el profesional ve contenido, fecha de origen y **Compartir objetivo**. Revisa y publica. Puede desactivarlo. **Texto personalizado** es una alternativa explícita para compatibilidad, nunca una edición del historial.
6. Enter envía en los dos roles, con `trim`, bloqueo inmediato de envíos simultáneos e idempotencia existente.
7. Shift+Enter conserva el salto de línea. Composición IME y pulsaciones repetidas no disparan envíos accidentales.
8. El botón **Enviar mensaje** sigue disponible; no se agregó texto de ayuda que sature el chat.
9. Historial → **Planes** muestra versiones publicadas separadas. **Todo** combina consultas finalizadas y publicaciones cronológicamente. **Ver** es de solo lectura.
10. El profesional utiliza **Exportar ▾ → PDF** sobre una versión específica.
11. **Exportar ▾ → LaTeX (.tex)** descarga UTF-8 compilable con LuaLaTeX, sin `shell-escape` y con logotipo incrustado cuando está disponible.
12. El paciente ve únicamente **Descargar PDF** en **Mi plan**, para el plan expresamente compartido y su versión publicada actual.
13. La exportación lee `nutrition_plan_versions.snapshot`, no el borrador. La base valida pertenencia al profesional y paciente. Los borradores no entran al historial de publicaciones ni a estos endpoints.
14. El profesional selecciona `versionId`: v1 sigue siendo v1 aunque haya v2. El paciente no puede proporcionar `versionId` ni `planId` para escoger otra versión.
15. Se reutilizó el membrete clínico de exportación de consultas: verde/dorado, identidad profesional, cédula, contacto, logotipo y pie confidencial. Su implementación se extrajo a `document-letterhead.ts`.
16. `PublishedNutritionPlanDocumentModel` y `planDocumentBlocks` centralizan proyección y orden clínico para PDF y TEX. Se reutiliza la proyección segura del plan del Superlink.
17. El texto dinámico LaTeX escapa barra inversa, llaves, numeral, dólar, porcentaje, ampersand, guion bajo, tilde y circunflejo. Las imágenes solo llegan como raster autorizado, nunca como comandos o URL de usuario.
18. Generación bajo demanda en Edge, sin archivos clínicos públicos ni caché persistente. El navegador recibe el archivo y libera su URL temporal. No se crearon buckets públicos.
19. `patient_portal` sigue siendo SECURITY INVOKER, ejecutable solo por `service_role`. Edge autentica al profesional con Auth.getUser o valida la sesión portal. La autorización y versión se comprueban de nuevo después de generar el documento. Hay límites de frecuencia, tamaño y páginas.
20. Migraciones: `portal_objectives_and_plan_exports` amplía funciones/permisos mínimos sin columnas nuevas; `allow_manual_portal_without_email` retira una exigencia antigua de correo incompatible con los códigos manuales. Conserva validación de nacimiento y teléfono. El acceso por email sigue exigiendo destinatario; el manual sigue siendo de un solo uso y con caducidad.

## Calidad y despliegue

21. Pruebas nuevas: origen/publicación explícita de objetivos; chat de ambos roles y duplicados/IME; menú de exportación y permisos; modelos PDF/TEX y caracteres especiales; v1/v2; revocación; aislamiento SQL; reducción acotada de logotipos con transparencia.
22. Copia limpia de la entrega: **560 pruebas Vitest en 76 archivos**, todas pasan (incluye la regresión de edición de pacientes sin correo). Además, **2 pruebas Deno** del logotipo, integración SQL y prueba de concurrencia de códigos pasan. En el árbol de trabajo original hay un fallo ajeno en `LandingPage.test.tsx` por texto esperado distinto al H1; se preservaron ambos cambios pendientes de Landing, sin publicarlos ni eliminar pruebas.
23. TypeScript: pasa.
24. ESLint: pasa sin errores. La copia limpia conserva un warning preexistente de `SecondShiftVisual` sin uso en LandingPage; no se modificó ese trabajo ajeno.
25. Build de producción: pasa; comprobación Vercel incluida.
26. Commits funcionales: `cdc9114` (integración) y `04efd72` (correcciones detectadas en producción).
27. Ambos enviados a `origin/main`, sin force push y con staging selectivo.
28. Vercel: despliegue inicial `dpl_22ymAj1oEyS2R8cMo1HWP6wG7A7Z` Ready; actualización de cierre en `https://nuthrick-at7ea5c35-pepredador92.vercel.app`. Edge `agenda` v11 ACTIVE, con autenticación propia existente.
29. Validación en producción con **PRUEBA QA Portal 21 septiembre**: creado desde UI; consulta/respuestas sintéticas preparadas en base; v1 y v2 publicadas mediante el RPC real, sin insertar ni modificar snapshots directamente. Desde UI se aprobó/publicó el objetivo, se compartió v2, se generó y canjeó código manual sin correo, se enviaron mensajes por Enter en ambos roles y dos líneas con Shift+Enter + botón. Se descargaron PDF v1 profesional, PDF v2 paciente y TEX v1 profesional. Extracción de los PDFs confirmó arroz solo en v1 y tortillas solo en v2. TEX descargado compiló. Peticiones reales del paciente para TEX, `versionId` y `planId` fueron rechazadas. Revocar el enlace impidió la descarga. El expediente y plan ficticios quedaron archivados y todas sus sesiones revocadas; no se modificaron expedientes reales.
30. Límites: nombre/título y contenido clínico vienen del snapshot; logo/cédula/contacto proceden del perfil vigente porque los snapshots anteriores no contienen esos campos. Se reconocen las claves canónicas de objetivos, no preguntas personalizadas arbitrarias. LuaLaTeX es el compilador previsto. No se hizo prueba en un teléfono físico: el intento de cambiar viewport del navegador integrado no alteró sus dimensiones efectivas. La consulta de prueba se preparó como fixture, no recorriendo todo el Guión por UI. No hay envíos automáticos, firma ni exportación de borradores.

## Revisión visual y operativa

La habilidad PDF se utilizó para renderizar e inspeccionar primera página, páginas intermedias, planes de tres y seis tiempos, instrucciones y sustituciones largas, acentos y membrete real. La habilidad Supabase guio la revisión de permisos, funciones y pruebas de aislamiento.

El logotipo de producción original excedía el presupuesto de CPU al reprocesarlo. Ahora los PNG se acotan a 384 px para el membrete de 28 mm, conservando transparencia y dejando intacto el original privado. La exportación de prueba quedó en aproximadamente 550 KB. Imágenes malformadas o fuera del límite se omiten, sin ocultar identidad ni contenido clínico.

El asesor de seguridad conserva avisos de tablas privadas cerradas sin políticas cliente y RPC SECURITY DEFINER preexistentes. No se abrió acceso directo al portal. También sigue pendiente la configuración global de [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), fuera de esta iteración. Referencias de los avisos: [tablas privadas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) y [RPC autenticados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
