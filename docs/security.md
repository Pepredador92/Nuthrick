# Seguridad

## Modelo de amenaza principal

El riesgo crítico de un SaaS multiusuario es que una cuenta lea o modifique filas de otra. Nuthrick no acepta el `professional_id` como prueba de identidad y no confía en filtros React.

## Auth y sesión

- Las contraseñas pertenecen exclusivamente a Supabase Auth.
- La aplicación conserva y refresca la sesión mediante el SDK oficial.
- El UUID efectivo de operaciones privadas es `auth.uid()` en PostgreSQL.
- Los metadatos editables del usuario sólo pueden sugerir un nombre de presentación; nunca deciden autorización.
- Google OAuth guarda su client secret en Supabase, no en el frontend.

## RLS

Cada tabla privada tiene RLS activo y políticas para `authenticated` que comparan `(select auth.uid())` con `id` o `professional_id`. Las políticas `UPDATE` contienen `USING` y `WITH CHECK`; también existe `SELECT`, requerido por PostgreSQL para actualizar.

Las tablas tienen privilegios Data API explícitos. Esto es independiente de RLS: el GRANT permite llegar a la tabla y RLS decide qué filas se ven.

Los catálogos son sólo lectura para usuarios autenticados. `public_professional_pages` es la única tabla legible por `anon`.

## Información pública

La página pública no consulta `professional_profiles`. Un trigger privilegiado, ubicado en el esquema no expuesto `private`, construye una proyección que omite:

- ID de Auth.
- email.
- `storage_key` dentro del contenido.
- razón social.
- indicadores administrativos.
- datos que no forman parte del perfil publicado.

La tabla pública se elimina automáticamente al desactivar `is_public`.

## Funciones privilegiadas

Las funciones `SECURITY DEFINER` viven en `private`, fijan `search_path` y revocan `EXECUTE` a `PUBLIC`. Sólo la función booleana necesaria para políticas de Storage concede ejecución a `anon` y `authenticated`; no devuelve datos.

Las RPC de selección de catálogos usan `SECURITY INVOKER`. Derivan la cuenta de `auth.uid()` y se someten a las mismas políticas RLS.

## Storage

El bucket es privado. Un usuario puede listar, firmar, insertar, actualizar y borrar únicamente su prefijo `storage_key`. La lectura anónima sólo permite operaciones de obtención/firma cuando la ruta exacta aparece como avatar, logotipo o imagen de galería en la proyección pública activa; no basta con conocer el prefijo y nunca se permite listar el bucket.

La interfaz y Storage validan MIME, extensión y límite de 5 MiB. El frontend nunca recibe una secret key ni `service_role`.

## Checklist antes de producción

- Ejecutar advisors de seguridad y rendimiento.
- Probar RLS con dos usuarios reales y con el rol `anon`.
- Configurar SMTP propio, CAPTCHA y límites de Auth.
- Confirmar URLs de redirección exactas.
- Mantener expiración JWT corta y revisar sesiones ante operaciones sensibles.
- Rotar cualquier credencial que se haya expuesto fuera de variables seguras.
- No conectar herramientas de desarrollo con datos clínicos reales.
