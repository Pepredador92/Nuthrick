# Arquitectura de Nuthrick

## Alcance de la versión 1

La aplicación implementa la cuenta del profesional, autenticación, onboarding, perfil, medios, disponibilidad, página pública, landing y la primera versión del módulo privado de pacientes (ficha, etiquetas, mediciones, consultas, notas y fotos de progreso). Planes, cuestionarios, agenda transaccional, pagos y automatizaciones siguen como integraciones futuras.

## Componentes

### Frontend

React y TypeScript organizados por páginas, features, componentes, hooks, servicios, tipos y utilidades. React Router centraliza las rutas públicas y privadas:

- `/`: landing pública.
- `/login`, `/register`, `/forgot-password`, `/reset-password`: Auth.
- `/onboarding`: configuración inicial obligatoria.
- `/app`: dashboard protegido.
- `/app/profile`: módulo de perfil.
- `/app/patients`: listado privado con búsqueda, filtros y paginación.
- `/app/patients/:patientId`: ficha longitudinal privada; RLS determina si existe para el usuario.
- `/p/:slug`: proyección pública sin autenticación.

`AuthProvider` mantiene la sesión y el perfil. Los guards mejoran la UX, pero no autorizan operaciones de datos: Supabase RLS lo hace.

### Supabase

- Auth gestiona contraseña, recuperación, OAuth y sesiones.
- PostgreSQL guarda los datos normalizados.
- RLS limita cada relación privada al `auth.uid()` autenticado.
- Storage guarda avatar, logotipo y galería.
- `public_professional_pages` contiene exclusivamente el documento público por slug.

El frontend habla directamente con Supabase para CRUD sencillo. Cada escritura privada se valida nuevamente en PostgreSQL.

### FastAPI

FastAPI expone `GET /health` y una configuración CORS. Es el límite previsto para cálculos nutricionales, PDFs, procesamiento de archivos, IA y otras operaciones complejas futuras. No se usa como proxy innecesario para CRUD.

## Flujo de cuenta nueva

1. El usuario se registra con Google o email.
2. Supabase crea `auth.users`.
3. Un trigger idempotente inserta `professional_profiles` con el mismo UUID.
4. El frontend detecta `onboarding_completed = false`.
5. El usuario captura nombre, título, país y zona IANA.
6. El dashboard queda disponible.

## Flujo público

Cuando cambia un dato que puede ser público, un trigger actualiza `public_professional_pages` sólo si el perfil está marcado como público y terminó onboarding. La fila contiene JSON ya sanitizado y una clave aleatoria de medios; nunca contiene el UUID de Auth ni el email.

`/p/:slug` consulta únicamente esa tabla. Las URLs de medios son temporales porque el bucket es privado.

## Portabilidad

La lógica de producto reside en React, FastAPI y PostgreSQL. El hosting puede cambiar sin alterar el modelo. Las dependencias específicas de Supabase se concentran en Auth, Data API y Storage, con migraciones SQL conservadas en el repositorio.
