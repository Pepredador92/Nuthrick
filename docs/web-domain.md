# Dominio web oficial · LIVE-1B

## Decisión

Web pública y canonical: **https://nuthrick.com**. Dominio técnico/fallback:
`https://nuthrick.vercel.app`, que sigue sirviendo la aplicación. `www.nuthrick.com`
redirige al dominio raíz con HTTP 308 y conserva ruta/parámetros.

**Correo institucional temporal pendiente de migración futura**:
`sender_email`, `reply_to`, `support_email` y `privacy_email` tienen como objetivo
`susy.asistencia.online@gmail.com`. Tener dominio web no exige contratar buzones.
No se crean buzones, Google Workspace ni registros DNS de correo en esta entrega.
Los ajustes de Gmail preparados en `codex/live-one-b-gmail` siguen independientes
de esta publicación del dominio web; cambiar URLs no activa su hook de Auth.

## Configuración central

`supabase/functions/_shared/site.ts` contiene el dominio por defecto, el fallback
exacto y la validación de orígenes. No se permite cualquier subdominio de Vercel.

| Runtime | Configuración | Valor productivo |
| --- | --- | --- |
| Vercel/frontend | `NEXT_PUBLIC_SITE_URL` | `https://nuthrick.com` |
| Supabase billing | `BILLING_SITE_URL` | `https://nuthrick.com` |
| Supabase AI | `AI_SITE_URL` | `https://nuthrick.com` |
| Supabase Agenda/portal | `AGENDA_SITE_URL` | `https://nuthrick.com` |
| Supabase Auth | Site URL | `https://nuthrick.com` |
| Supabase Auth | Redirect URLs principales | `/auth/callback`, `/reset-password` en el dominio oficial |

Las rutas exactas antiguas de callback/reset y localhost permanecen en la lista de
Auth para enlaces ya emitidos y desarrollo. Las nuevas solicitudes desde el
producto hospedado usan el dominio principal; en localhost conservan su sesión
local. No se copia una sesión/token entre dominios. Puede ser necesario iniciar
sesión al pasar por primera vez del dominio técnico al oficial.

Las URLs de Supabase API, Storage, OAuth callback de Agenda y webhook de Stripe
siguen perteneciendo a Supabase: son endpoints técnicos, no enlaces públicos del
producto. No sustituir dominios de proveedores con un reemplazo de texto global.

## Cambios de código

- `frontend/src/lib/site.ts`: enlaces públicos y retornos Auth.
- Perfiles/Superlink compartidos y enlaces del portal usan el dominio principal
  incluso si se generan desde el fallback. Los tokens del portal siguen en el
  fragmento `#`, sin pasar a parámetros de consulta ni canonical.
- Canonical por ruta pública, Open Graph e imagen social con dominio oficial.
- `robots.txt` y `sitemap.xml` usan el dominio principal. Robots evita indexación
  de rutas privadas, autenticación y portal; no sustituye controles de acceso.
- Billing genera success/cancel de suscripciones/créditos y return URLs del portal
  desde la configuración central del servidor, nunca desde un Origin arbitrario.
- Agenda genera sus enlaces/retornos con la URL oficial. CORS acepta únicamente
  el dominio configurado y el fallback conocido. AI y correo aplican lo mismo.
- No se cambian permisos, se activan pagos Live ni se ejecutan cobros.

## Comprobaciones

Antes de publicar se verificó que Vercel ya tenía los tres dominios verificados,
HTTPS y `www → apex`. No fue necesario cambiar DNS. Auth ya tenía Site URL y las
rutas oficiales correctas. Sí se corrigió la variable productiva de Vercel y se
configuraron explícitamente las tres URLs de Edge Functions.

Pruebas locales: frontend, billing/correo y compilación Deno; smoke del artefacto
Vercel aislado incluyendo canonical, Open Graph, robots y sitemap. En producción,
preflight de las cuatro funciones acepta dominio oficial y fallback, y rechaza
un origen externo. No se enviaron correos ni se realizaron pagos para esta prueba.

Las comprobaciones de entrega/recepción de Gmail y la activación de su hook Auth
pertenecen a la integración de correo, no son requisitos para usar nuthrick.com.

## Resultado productivo · 25 de septiembre de 2026

Publicación Vercel: `nuthrick-b4me025h4-pepredador92.vercel.app`, asignada a
`nuthrick.com`, `www.nuthrick.com` y `nuthrick.vercel.app`. Verificación HTTP:

- Dominio principal HTTPS: 200. HTTP redirige a HTTPS.
- WWW: 308 al dominio raíz, preserva ruta y query.
- Fallback: 200, canonical del dominio principal.
- Canonical de landing, `/privacy`, `/p/jose-olmedo`: dominio oficial y ruta correcta.
- Imagen Open Graph: `https://nuthrick.com/og.png`.
- Robots: texto válido; sitemap: XML válido, ambos con enlaces oficiales.
- Cuatro funciones: orígenes principal/fallback aceptados; origen ajeno rechazado.

Pruebas repetidas antes de integrar: 794 frontend; 50 billing; 11 correo; 6 Agenda;
TypeScript, compilación Deno de AI/Agenda y smoke del
artefacto Vercel correctos. Lint sin errores; una advertencia preexistente en LandingPage.
No se modificaron DNS de correo, buzones, permisos ni interruptores Stripe Live/IA.

## Integración a main

Origen: rama `codex/live-one-b-domain`, worktree `live-one-b-domain/Nuthrick`.
La comparación con `origin/main` actualizado encontró la misma base `640f109`:
sin commits divergentes ni conflictos. El checkout principal local contiene trabajo
ajeno sin commit y permanece intacto. La integración usa un commit dedicado y un
push normal de `HEAD:main`, sin force. El resultado de ese push, su SHA y el nuevo
despliegue Vercel se registran en la entrega de esta tarea; la publicación anterior
identificada arriba es la verificación previa, no evidencia del nuevo despliegue Git.

No se incluyen archivos del worktree `live-one-b-gmail`, migraciones ni cambios de
proveedor de correo, SMTP o Send Email Hook. Supabase Auth email productivo por
Gmail continúa pendiente. Los ajustes independientes de otras tareas permanecen
en sus propios worktrees.

### Archivos del commit DOMAIN

- Configuración: `supabase/functions/_shared/site.ts`,
  `frontend/src/lib/site.ts`, `frontend/src/lib/site.test.ts`.
- Metadata: `frontend/src/lib/productMetadata.ts`, `frontend/app/layout.tsx`,
  `frontend/app/[[...path]]/page.tsx`, `frontend/app/p/[slug]/page.tsx`,
  `frontend/app/robots.ts`, `frontend/app/sitemap.ts`,
  `frontend/scripts/check-vercel-build.mjs`.
- URLs de producto: `frontend/src/screens/AuthPages.tsx`,
  `frontend/src/screens/ProfilePage.tsx`, `frontend/src/services/patientPortal.ts`.
- Edge Functions: `supabase/functions/agenda/index.ts`,
  `supabase/functions/ai/index.ts`, `supabase/functions/billing/index.ts`,
  `supabase/functions/billing/handler.ts`,
  `supabase/functions/transactional-email/domain.ts`,
  `supabase/functions/transactional-email/handler.ts`.
- Pruebas Billing: `supabase/functions/billing/billing.test.ts`,
  `supabase/functions/billing/environment.test.ts`.
- Documentación: `docs/web-domain.md`, `docs/live-one-b-legal-email.md`.

### URLs resultantes

- Auth: `https://nuthrick.com/auth/callback` y
  `https://nuthrick.com/reset-password`; Site URL `https://nuthrick.com`.
- Agenda: `https://nuthrick.com/app/agenda` tras OAuth y
  `https://nuthrick.com/agenda/responder#…` para propuestas.
- Perfiles/Superlink: `https://nuthrick.com/p/{slug}`.
- Portal: `https://nuthrick.com/mi-espacio#…`.
- Billing: `/app/my-plan?checkout=success`, `/planes?checkout=cancelled`,
  `/app/credits?purchase=…`, `/app/credits?checkout=cancelled` y retorno del portal
  `/app/my-plan`, todos bajo `https://nuthrick.com`.
- Legales: `https://nuthrick.com/terms`, `/privacy`, `/refunds`.

Los contactos de soporte, privacidad y Reply-To se comprobaron en la configuración
productiva: conservan `susy.asistencia.online@gmail.com`. La revisión del dominio
no aprueba los borradores legales ni certifica envío/recepción Auth. Consulta de
solo lectura antes de integrar: Stripe Live `checkout_enabled=false`; ninguna
feature OpenAI habilitada. No se realizan cobros ni solicitudes al proveedor IA.
