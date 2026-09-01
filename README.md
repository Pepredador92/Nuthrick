# Nuthrick

Nuthrick es la primera base de un SaaS multiusuario para profesionales de la nutrición. Esta etapa incluye autenticación, onboarding, dashboard, perfil profesional, disponibilidad, medios, página pública y landing. Pacientes, consultas, agenda operativa y pagos quedan explícitamente fuera de alcance.

## Arquitectura

```text
Navegador ── CRUD simple ──> Supabase Auth / Data API / Storage
    │                              │
    │                              └── PostgreSQL + RLS por profesional
    │
    └── lógica futura ──────> FastAPI ──> Supabase
```

El frontend usa React, TypeScript, React Router, Tailwind CSS y el runtime Vite/Vinext. FastAPI expone únicamente `GET /health`; no duplica la API automática de Supabase. La base de datos contiene una proyección pública separada que evita exponer las tablas privadas.

## Estructura

```text
frontend/    Aplicación web, rutas, componentes, servicios y pruebas
backend/     API FastAPI preparada para lógica compleja futura
supabase/    Configuración local, migraciones y catálogos iniciales
docs/        Arquitectura, modelo de datos y seguridad
```

## Requisitos

- Node.js 22.13 o posterior
- npm 11 o compatible
- Python 3.9 o posterior
- [uv](https://docs.astral.sh/uv/) para el entorno Python
- Supabase CLI 2.116.0 (puede ejecutarse con `npx`)
- Docker Desktop sólo si se ejecuta Supabase localmente

## Variables de entorno

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

El frontend recibe únicamente `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca coloques una clave secreta o `service_role` en una variable `VITE_*`.

El backend reserva `SUPABASE_SECRET_KEY` para futuros procesos de servidor. En esta versión no es necesaria para `/health`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

La aplicación se sirve normalmente en `http://localhost:3000`.

Comprobaciones:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

La versión privada publicada para revisión está disponible en
[`nuthrick-susy-asistencia.pepeolmedo.chatgpt.site`](https://nuthrick-susy-asistencia.pepeolmedo.chatgpt.site).

## Backend

```bash
cd backend
uv sync --dev
uv run uvicorn app.main:app --reload --port 8000
```

Comprobaciones:

```bash
uv run ruff check .
uv run pytest
curl http://localhost:8000/health
```

## Supabase local

```bash
npx --yes supabase@2.116.0 start
npx --yes supabase@2.116.0 db reset
```

`db reset` aplica las migraciones de `supabase/migrations/` y carga `supabase/seed.sql`. El seed sólo contiene catálogos; no crea usuarios de Auth.

Las pruebas PostgreSQL de aislamiento se ejecutan, con el stack local activo, mediante:

```bash
npx --yes supabase@2.116.0 test db
```

Para crear una migración adicional:

```bash
npx --yes supabase@2.116.0 migration new nombre_descriptivo
```

No edites el esquema manualmente en producción. Revisa primero los advisors de seguridad y rendimiento.

## Proyecto remoto

Nuthrick debe vincularse a un proyecto nuevo dentro de la organización correcta de Supabase. No reutilices otro producto ni copies sus claves.

Después de crear el proyecto y confirmar su referencia:

```bash
npx --yes supabase@2.116.0 link --project-ref TU_PROJECT_REF
npx --yes supabase@2.116.0 db push
```

Configura después las variables públicas del frontend con la URL y la publishable key de ese mismo proyecto. Las tablas creadas por SQL tienen privilegios Data API explícitos y RLS activo.

## Google OAuth

1. Crea un cliente OAuth Web en Google Cloud.
2. Añade la callback que muestra Supabase en **Authentication → Providers → Google**.
3. Configura el client ID y client secret exclusivamente en Supabase.
4. Activa Google como proveedor.
5. En **URL Configuration**, agrega las URLs permitidas, por ejemplo `http://localhost:3000/**` y el dominio desplegado.

El frontend llama `signInWithOAuth({ provider: "google" })`; el secreto de Google nunca viaja al navegador.

## Despliegue

El frontend genera un build compatible con hosting basado en Vite. Para Netlify o Vercel configura las mismas variables públicas y una regla de fallback hacia la aplicación para las rutas de React Router.

El backend puede ejecutarse en cualquier servicio compatible con ASGI. Define `CORS_ORIGINS` como JSON con los orígenes exactos autorizados.

Supabase permanece como servicio separado para Postgres, Auth y Storage. Antes de un lanzamiento público configura SMTP propio, CAPTCHA, Google OAuth, los redirect URLs finales y revisa los advisors.

## Decisiones principales

- Todas las tablas privadas usan RLS con propiedad derivada de `auth.uid()`.
- Las rutas React no son una barrera de autorización; RLS es la barrera real.
- `/p/:slug` consulta `public_professional_pages`, una proyección sin `auth.users.id`, email ni campos administrativos.
- Storage usa un bucket privado y un namespace aleatorio distinto del ID de Auth.
- Los archivos aceptados se limitan a JPEG, PNG y WEBP de hasta 5 MB tanto en UI como en el bucket.
- Los horarios son filas normalizadas y una exclusión PostgreSQL impide solapamientos concurrentes.

Consulta [arquitectura](docs/architecture.md), [base de datos](docs/database.md) y [seguridad](docs/security.md) para más detalle.
