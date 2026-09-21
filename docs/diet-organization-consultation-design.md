# Organización del Taller y Diseño de consulta

Entrega del 21 de septiembre de 2026. Se reutilizaron ambos módulos, sus servicios y snapshots; no se reconstruyeron.

## Taller de dietas

1. **Eliminar borradores:** menú contextual por tarjeta; confirmación modal nativa con foco contenido, Cancelar, bloqueo durante envío y errores recuperables. No se oculta la tarjeta hasta confirmar éxito del servidor.
2. **Protección histórica:** solo `status=draft`, sin `current_version_id` y sin ninguna fila en `nutrition_plan_versions`. El trigger también protege DELETE directo; la FK histórica continúa en RESTRICT. Un plan finalizado/archivado no puede degradarse a draft para eludir la protección.
3. **Asignados:** mismo flujo; la confirmación incluye el nombre del paciente. No elimina pacientes ni consultas. La tarjeta, contador y orden se actualizan sin recargar.
4. **Backend/RLS:** RPC `delete_nutrition_plan_draft`, SECURITY INVOKER; verifica propietario con `auth.uid()`, revisión optimista y bloqueo de fila (el mismo usado al publicar). Se conserva RLS de ownership. Anónimos no pueden ejecutar. No se añadieron CASCADE. Las relaciones existentes son versiones RESTRICT, puntero del portal SET NULL y respaldo interno de biblioteca CASCADE; solo este último es un respaldo del borrador.
5. **Tarjetas:** título, fecha, nombre del paciente, relación, estado y acceso al plan. Menú con Abrir, Renombrar, Ver paciente cuando corresponde y Eliminar borrador únicamente cuando es elegible.
6. **Paleta:** superficies blancas, bordes `#dfe6e1`; asignado `#8fab9a` / `#edf5ef` / `#315e4f`; libre gris azulado `#a6b5d2` / `#eef1f8` / `#495c80`; estado neutral `#f3f5f2` / `#52665a`. No se pinta toda la tarjeta de color intenso.
7. **Relación vs estado:** dos badges independientes. Plan libre / Paciente asignado no sustituyen Borrador / Publicado vN / Archivado. Texto e iconos acompañan al color.
8. **Filtros y orden:** Borradores, Publicados, Archivados, Todos, con contadores; segunda fila por destino (todos, asignados, libres). Por defecto borradores recientes; en todos los filtros, actualización descendente. Estado vacío y acceso a crear plan/biblioteca. Sin selección masiva.

No se reutiliza `agenda_audit` para registrar acciones ajenas a Agenda: no existe auditoría genérica del Taller. No se creó infraestructura adicional ni se almacenó contenido clínico en logs.

## Diseño de consulta

9. **Nombre visible:** Diseño de consulta, en navegación, cabeceras y accesos desde la consulta.
10. **Rutas:** permanece `/app/consultation-templates/:consultationType`; no se renombraron tablas ni IDs. Archivos principales: `PrivateLayout.tsx`, `ConsultationPage.tsx`, `ConsultationTemplateEditorPage.tsx`.
11. **Home:** “Tu consulta”, nombre real, número de secciones/preguntas activas y mapa numerado. Botones principales antes de la lista. Diseños alternativos bajo “Otros diseños y variantes”. No se inventaron secciones; el diseño inicial actual tiene 15 secciones y 107 preguntas.
12. **Personalización:** la base crea una copia personal; un diseño propio abre su editor existente. Primero estructura, luego sección y después preguntas desplegables. Permanecen metadatos, duplicado, archivo, predeterminado y eliminación de diseños personales.
13. **Orden:** Subir/Bajar secciones y preguntas, operables con teclado. No se añadió drag-and-drop ni una dependencia adicional.
14. **Dependencias:** se protegen `objectives` / `next_objectives` (Superlink), `life_stage` (contexto de interpretación) y preguntas referenciadas por condiciones de otras preguntas. No pueden eliminarse/desactivarse ni cambiar su estructura de respuesta; sí se puede personalizar su texto y ayuda. La sección contenedora no se desactiva. Las mediciones y ecuaciones siguen en sus módulos separados.
15. **Vista previa:** reutiliza QuestionField y evaluación de condiciones, sin escribir respuestas en expedientes. Se corrigió una sobreescritura de etiquetas en la consulta real: ahora muestra el texto del snapshot, igual que la vista previa, en vez de sustituir títulos personalizados por frases fijas.
16. **Guardado/restauración:** explícito con control de concurrencia existente y aviso de cambios pendientes. Restaurar el diseño recomendado requiere confirmación y conserva copias/historia. Duplicar reutiliza el RPC existente. Ningún snapshot histórico se reescribe.

## Calidad y publicación

17. **Pruebas nuevas:** diez casos de organización/borrado, tres de home/preview/dependencias/restauración y uno que garantiza respetar un título personalizado con clave canónica. Se adaptaron pruebas de navegación a los nuevos nombres, sin quitar casos existentes. Se corrigió una opción `exact` no admitida por Testing Library en una prueba previa.
18. **Suite:** entrega final limpia: 574 tests aprobados en 77 archivos. El árbol de trabajo original conserva una discrepancia anterior en LandingPage; esos cambios no se publican en esta entrega.
19. **TypeScript:** sin errores.
20. **ESLint:** sin errores; el checkout limpio conserva una advertencia previa de LandingPage (`SecondShiftVisual` no usado).
21. **Build:** exitoso; advertencias informativas existentes por tamaño del bundle y clasificación estática de rutas.
22. **Migración:** `20260921223620_safe_diet_draft_deletion.sql`, aplicada solo a `qlsqhvyrslclmlstlemn`. Test local `node scripts/test-draft-deletion.mjs`, con rollback total: libres, asignados, ajenos, revisión obsoleta, puntero publicado, historial sin puntero, DELETE directo y no degradar estado.
23. **Commits:** `98c5138`, `ae902aa`, `6e587f1`, `b3bec99` (funcionalidad, diseño, feedback y títulos personalizados).
24. **Push:** origin/main, sin force; LandingPage, output y tmp preservados fuera de los commits.
25. **Vercel:** código final publicado Ready en `https://nuthrick-8lrvt5nqy-pepredador92.vercel.app`, alias `https://nuthrick.vercel.app`. Corrección de etiquetas verificada en producción.
26. **Validación real:** RPC probado con borradores ficticios en una transacción con rollback; publicado de prueba protegido. En producción se verificaron tarjetas, nombres, filtros y confirmación/cancelación. El menú de un publicado v3 no ofrece eliminar. Se creó una copia QA independiente, se editó una pregunta, se cambió el orden, se guardó y se recargó; una consulta nueva del paciente QA utiliza ese orden y muestra exactamente el título editado. La copia QA fue archivada y la consulta ficticia cancelada/ocultada; nunca se hizo predeterminada. No se modificó un expediente real.

## Límites de la comprobación

- Prueba de eliminación definitiva de los dos borradores ficticios mediante la interfaz: confirmación del usuario solicitada antes de la acción irreversible. Pendientes: «QA UX · Libre para eliminar» (`ae839629-600f-46c2-a41f-1ffd8f38428b`) y «QA UX · Asignado para eliminar» (`47367740-ad98-4a1a-8681-33a7b51e8e82`). Ambos vacíos y no publicados.
- Responsive implementado con una columna base y grid de dos columnas desde md; badges permiten wrap. El navegador no aplicó su override 390px, por lo que se validó el componente real en iframes aislados de 390 y 900 px (`frontend/tests/visual/plan-organization.html`). Captura revisada: una y dos columnas respectivamente; ancho útil móvil 388px y scrollWidth 388px, sin desbordamiento. No se declara validación física móvil. El override se restableció.
- Advisors no añadieron hallazgos: permanecen 16 tablas privadas con RLS cerrado sin políticas, 11 RPC SECURITY DEFINER existentes y protección de contraseñas filtradas desactivada. Referencias: [funciones expuestas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS privado](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
