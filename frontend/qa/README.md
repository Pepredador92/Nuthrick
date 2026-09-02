# Verificación visual aislada

Ejecutar desde `frontend`: `npx vite --config qa/vite.config.ts`.
Abrir http://127.0.0.1:4174 y entrar al borrador ficticio o a Plantillas.

Este servidor renderiza los componentes reales con servicios en memoria y datos
ficticios. No usa Supabase, credenciales ni expedientes reales. No forma parte de
las rutas Vinext ni del build de producción. La recarga reinicia los datos.

Comprobar actualización explícita del borrador, revisión anterior, campos
condicionales, edición de opciones, registro de medicamentos, frecuencias y
revisión final. Tamaños recomendados: 375, 768 y 1440 píxeles.
La persistencia y el aislamiento reales se prueban por separado con
`supabase/tests/database/interview_revisions.sql`, siempre en rollback.
