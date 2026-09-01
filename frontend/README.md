# Nuthrick frontend

Aplicación web de la primera versión de Nuthrick, construida con React, TypeScript, Tailwind y Vinext.

## Configuración

La aplicación usa el proyecto de Supabase `qlsqhvyrslclmlstlemn` mediante variables de entorno; las credenciales reales no se guardan en el repositorio.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Variables requeridas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

El sitio de producción es `https://nuthrick-susy-asistencia.pepeolmedo.chatgpt.site`.
