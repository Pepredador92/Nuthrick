# Integración en main — 28 de septiembre de 2026

El usuario pidió reunir el proyecto en `main` y continuar realizando commits y push de lo terminado.

## Integrado

- Los cuatro commits pendientes de Legal v2 y preparación de OAuth se incorporaron por avance directo, sin reescribir historia. `origin/main` llegó a `a2425ee`.
- Todas las demás ramas locales de funcionalidades ya eran antecesoras de `origin/main`: Administración, configuración comercial, Stripe TEST, notificaciones, dominio, correo, pacientes, Superlink/QR y landing/SEO.
- Vercel confirmó `a2425ee` como Production / Ready del proyecto `nuthrick`, con `nuthrick.com` asignado. El fallo anterior de Preview correspondía a una configuración que aún anunciaba el dominio técnico en robots; la compilación productiva pasó sus controles. El proyecto distinto `frontend` conserva un estado fallido y no es el destino verificado de `nuthrick.com`.
- Se encontraron ajustes existentes del Taller aún sin commit en la carpeta principal. Se trasladaron ocho archivos sobre la base actualizada: confirmación de equivalentes, margen de confirmación de opciones, registro de la decisión y pruebas/fixture correspondientes. Se conserva la distribución prescrita; una diferencia fuera del margen exige confirmación expresa del profesional.
- Verificación de esos ajustes: 10 archivos de pruebas / 144 pruebas aprobadas, TypeScript aprobado y build Vercel completo con comprobación del handler SSR aislado, canonical, Open Graph, robots y sitemap.

## Conservado fuera de la integración

La carpeta principal conserva copias antiguas de trabajo: varias coinciden con archivos o versiones anteriores ya integradas. No se copiaron sobre el código reciente. Entre ellas hay una variante antigua de landing con contactos y enlaces legales superados por las decisiones actuales, fixtures de demostraciones anteriores y artefactos `output/`/`tmp/`. No se eliminaron ni se publicaron como cambios nuevos.

La aprobación y los textos legales completos pertenecen al estado auditado de la base. El repositorio conserva las plantillas y el registro sin duplicar los datos particulares del operador. Las credenciales y tokens privados tampoco forman parte de los commits.
