# Capacitación Nuthrick

Implementación local del 14 de octubre de 2026, rama `codex/academy-nuthrick`.

## Uso

- **Espacio profesional → Capacitación Nuthrick** (`/app/academy`): videos publicados, numerados según el orden del catálogo, con miniatura y descripción. Está disponible para cuentas profesionales autenticadas que completaron el onboarding y la aceptación legal, incluso si su acceso comercial venció.
- **Administración → Capacitación** (`/admin/training`): agregar, editar, previsualizar, publicar/ocultar, eliminar y subir/bajar videos. Los registros nuevos empiezan ocultos salvo que se marque su visibilidad.
- Cada video se reproduce en un modal con el reproductor de YouTube. Cerrar, Escape desde los controles del diálogo o pulsar el fondo elimina el iframe, detiene la reproducción y devuelve el foco al control que abrió el video. El diálogo nativo mantiene el foco dentro y permite pantalla completa mediante YouTube. Dentro del reproductor, YouTube gestiona sus propias teclas; el botón Cerrar permanece disponible.
- El navegador puede exigir pulsar Play. El video debe permitir reproducción insertada en YouTube. El catálogo usa videos individuales; una playlist sin `v` no identifica un video.

## Catálogo inicial

Títulos y temas verificados mediante los metadatos públicos de la [playlist facilitada](https://www.youtube.com/playlist?list=PLBuZvLPXwzIs). La playlist está en orden inverso; se inicia con los tutoriales 01 a 05. Las descripciones son resúmenes editables de los temas publicados.

| Orden | Video | ID de YouTube |
| --- | --- | --- |
| 1 | ¿Dónde está cada cosa en Nuthrick? | `Nw6ZwFHWoqI` |
| 2 | Completa tu perfil profesional en Nuthrick | `ZcKpeXfjSdc` |
| 3 | Configura tu negocio y consultorios en Nuthrick | `rnzven3_7zs` |
| 4 | Configura tus horarios disponibles en Nuthrick | `VNuT6T7Or_s` |
| 5 | ¿Cómo agenda una cita un paciente en Nuthrick? | `PuIO8UgjOrM` |

## Datos y permisos

La migración `20261014221744_academy_training_catalog.sql` crea `private.training_videos` y el estado de revisión del catálogo. RLS está activo, con políticas de denegación y sin grants directos a clientes. `public.training_catalog` y `public.training_admin_api` son wrappers `SECURITY INVOKER`; sus implementaciones privadas fijan `search_path` y comprueban identidad profesional o el rol administrativo existente. Solo los administradores ven registros ocultos mediante el RPC administrativo.

Todas las mutaciones bloquean la fila de estado del catálogo y requieren `expected_revision`. Un catálogo cambiado en otra sesión rechaza la operación. Reordenar exige exactamente todos los IDs, incluyendo los ocultos, sin repeticiones ni IDs ajenos. El orden tiene una restricción única diferida; eliminación y orden se guardan de manera atómica. Cada mutación registra al administrador real en `private.admin_audit`.

Se almacena exclusivamente el ID de YouTube, validado también en SQL. El cliente acepta enlaces oficiales watch, youtu.be, shorts, live y embed; construye la URL del iframe desde un dominio fijo. No requiere claves de YouTube ni cambios en Edge Functions. Usa el reproductor `youtube-nocookie.com` y un `referrerPolicy` explícito para permitir la identificación que YouTube exige. El iframe se carga únicamente al abrir el video; las miniaturas provienen de YouTube.

Referencias: [reproductor de YouTube](https://developers.google.com/youtube/iframe_api_reference), [inserción y restricciones](https://support.google.com/youtube/answer/171780?hl=es), [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Verificación

- 44 pruebas focales de frontend: enlaces seguros, carga del reproductor al pulsar, cierre/foco, publicación, catálogo vacío, reintentos, orden, edición conservada tras conflicto, y capacitación accesible sin plan vigente.
- TypeScript y ESLint focal correctos.
- SQL ejecutado en PostgreSQL local: acceso profesional, denegación anónima/no administrativa, publicación/ocultamiento, validación, concurrencia por revisión, orden completo, eliminación, RLS y auditoría. Fixtures y cambios revertidos.
- Asesores de seguridad/rendimiento de Supabase CLI sobre una base local aislada: `No issues found`. La base y los roles temporales se eliminaron.
- Navegador: Capacitación y Administración a 320, 390, 768 y 1440 px en día/noche, sin desbordamientos. Verificados alta, edición, publicación, ocultamiento, orden y eliminación; reproducción real dentro del modal, cierre, Escape, fondo, foco y una sola pestaña. Sin llamadas a Supabase desde la preview.
- Build Vercel con smoke SSR aislado correcto, incluyendo las rutas nuevas y su `noindex`.

## Reproducir

```bash
node scripts/test-training.mjs
cd frontend
npm test -- src/features/training/model.test.ts src/features/training/training.test.tsx src/layouts/PrivateLayout.test.tsx src/features/admin/admin.test.tsx
npm run typecheck
NITRO_PRESET=vercel npm run build
npx vite --config tests/visual/training.vite.config.ts
```

Preview: `http://127.0.0.1:4196/tests/visual/training.html`. Usa los componentes reales con un catálogo de demostración en memoria; los cambios de la preview desaparecen al recargar. Las pruebas de navegador usan `PLAYWRIGHT_MODULE` para localizar Playwright instalado y opcionalmente `PLAYWRIGHT_CHANNEL=chrome`.

Evidencias locales: `output/academy/`. La migración se aplicó en el proyecto productivo de Supabase `qlsqhvyrslclmlstlemn` el 14 de octubre de 2026; el archivo conserva la versión registrada por Supabase. Se verificaron los cinco videos publicados en orden, revisión inicial 1, acceso mediante los RPC profesional y administrativo y ausencia de permisos directos para clientes. Los advisors de seguridad y rendimiento no añadieron hallazgos respecto a la revisión previa.

El frontend se publica en Vercel desde `main` con `NEXT_PUBLIC_SITE_URL=https://nuthrick.com`. La configuración histórica de Preview usa el dominio técnico y falla la comprobación que impide anunciarlo en robots/sitemap; Producción utiliza el dominio oficial.
