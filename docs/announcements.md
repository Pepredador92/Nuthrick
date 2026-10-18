# Anuncios y avisos

El módulo está en `/admin/announcements`. Solo los administradores de la plataforma pueden crear, editar, publicar, pausar o eliminar anuncios. La primera versión se dirige a todas las cuentas profesionales.

Cada anuncio admite título, mensaje opcional, una imagen o un video, descripción accesible, botón opcional, inicio, fin, prioridad y frecuencia. Las fechas se introducen en la zona horaria del navegador y se guardan como instantes UTC. Las imágenes se muestran completas y los videos tienen controles, empiezan silenciados y no se reproducen automáticamente.

Se aceptan JPG, PNG y WEBP de hasta 5 MiB, y MP4 y WEBM de hasta 50 MiB. Para máxima compatibilidad se recomienda MP4 con H.264. La interfaz comprueba formato, tamaño y firma del archivo; el bucket restringe MIME y tamaño, y el servidor valida el objeto antes de asociarlo al anuncio. Los archivos permanecen en un bucket privado y se sirven con enlaces firmados de una hora. Los borradores y anuncios fuera de vigencia solo se pueden previsualizar desde administración. Las operaciones administrativas quedan en `private.admin_audit`.

## Aparición al entrar

`EntryAnnouncements` conserva `EntryDigest` y espera a que termine de cargar y se cierren sus mensajes o recordatorios. Después consulta los anuncios vigentes y los muestra de uno en uno, por prioridad descendente y fecha de creación descendente. También cede ante otros diálogos de la aplicación, como el aviso de IA. Interrumpir un anuncio para mostrar otro diálogo no lo marca como cerrado.

- **Una sola vez:** la impresión se registra al abrir el modal y se conserva entre dispositivos.
- **Una vez por sesión:** se registra con el `session_id` de Supabase Auth. Recargar, renovar el token o volver a otra sesión ya abierta no lo repite.
- **Hasta que lo cierre:** una impresión no lo retira. Cerrar, pulsar Escape o seguir el botón del anuncio guarda el cierre.

El usuario efectivo siempre procede de `auth.uid()`. Las tablas de contenido y recibos son privadas, tienen RLS y se accede a ellas mediante funciones comprobadas en `private` y wrappers públicos con `SECURITY INVOKER`. Las impresiones de frecuencia única y por sesión son idempotentes ante solicitudes simultáneas. La edición conserva los recibos existentes; para enviar otra comunicación se crea un anuncio nuevo. Las revisiones evitan sobrescribir cambios de otro administrador.

Seguir el botón del anuncio cierra la secuencia para que el usuario pueda usar su destino. Los anuncios restantes conservan su estado y quedan disponibles para una siguiente entrada.

## Instalación y comprobaciones

Aplicar `supabase/migrations/20261018212357_platform_announcements.sql` al entorno correspondiente antes de desplegar el frontend. La migración crea las tablas, funciones, bucket y políticas; no crea anuncios ni los publica automáticamente.

```bash
node scripts/test-announcements.mjs
cd frontend
npm test -- src/features/announcements src/components/notifications/EntryDigest.test.tsx src/layouts/PrivateLayout.test.tsx
npm run typecheck
npm run build
```

La prueba SQL utiliza el PostgreSQL local en `/tmp`, una transacción que se revierte y fixtures mínimos de Auth/Storage. No modifica datos remotos ni requiere Docker. También permite exportar los fixtures con `--fixture` para comprobar la migración y ejecutar los advisors en una base de datos desechable.

La vista local aislada se sirve con `npx vite --config tests/visual/announcements.vite.config.ts` desde `frontend`, en `http://127.0.0.1:4197/tests/visual/announcements.html`. Usa fixtures en memoria y nunca publica cambios. La comprobación de navegador es `node frontend/tests/visual/announcements-check.mjs`, con `PLAYWRIGHT_MODULE` y `PLAYWRIGHT_CHANNEL` cuando sea necesario. Revisa tamaños de 320 a 1440 px, los temas día/noche, el foco del modal, Escape, vistas previas y reproducción de un WebM generado localmente.
