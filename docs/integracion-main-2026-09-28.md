# Integración en main — 28 de septiembre de 2026

El usuario pidió reunir el proyecto en `main` y continuar realizando commits y push de lo terminado.

## Integrado

- Los cuatro commits pendientes de Legal v2 y preparación de OAuth se incorporaron por avance directo, sin reescribir historia. `origin/main` llegó a `a2425ee`.
- Todas las demás ramas locales de funcionalidades ya eran antecesoras de `origin/main`: Administración, configuración comercial, Stripe TEST, notificaciones, dominio, correo, pacientes, Superlink/QR y landing/SEO.
- Vercel confirmó `a2425ee` como Production / Ready del proyecto `nuthrick`, con `nuthrick.com` asignado. El fallo anterior de Preview correspondía a una configuración que aún anunciaba el dominio técnico en robots; la compilación productiva pasó sus controles. El proyecto distinto `frontend` conserva un estado fallido y no es el destino verificado de `nuthrick.com`.
- Se encontraron ajustes existentes del Taller aún sin commit en la carpeta principal. Se trasladaron ocho archivos sobre la base actualizada: confirmación de equivalentes, margen de confirmación de opciones, registro de la decisión y pruebas/fixture correspondientes. Se conserva la distribución prescrita; una diferencia fuera del margen exige confirmación expresa del profesional.
- Verificación de esos ajustes: 10 archivos de pruebas / 144 pruebas aprobadas, TypeScript aprobado y build Vercel completo con comprobación del handler SSR aislado, canonical, Open Graph, robots y sitemap.

## Conservado fuera de la integración

La carpeta principal contenía copias antiguas de trabajo: varias coincidían con archivos o versiones anteriores ya integradas. No se copiaron sobre el código reciente. Entre ellas había una variante antigua de landing con contactos y enlaces legales superados por las decisiones actuales y fixtures de demostraciones anteriores. Se preservaron 60 archivos en el stash local `codex: preserve prior local drafts before main sync 2026-09-28`, sin publicarlos ni eliminar el respaldo. Después se actualizó `main` local por avance directo y se sincronizaron las dependencias con `npm ci --ignore-scripts`. Los artefactos `output/` y `tmp/` permanecen intactos fuera del commit.

La instalación reportó nueve avisos de dependencias (uno bajo y ocho altos). Este bloque no aplicó actualizaciones forzadas ni acredita una auditoría de dependencias; esa salida requiere revisar alcance y compatibilidad antes de atribuir riesgo a producción.

El archivo HTML de propiedad de Google se añadió posteriormente con autorización expresa en `76058e2`, incorporado a ambas ramas y al `main` local. Vercel terminó el despliegue productivo; se comprobó su contenido público y Search Console confirmó «Propiedad verificada» para `https://nuthrick.com/` con la cuenta propietaria del proyecto Google Cloud.

La aprobación y los textos legales completos pertenecen al estado auditado de la base. El repositorio conserva las plantillas y el registro sin duplicar los datos particulares del operador. Las credenciales y tokens privados tampoco forman parte de los commits.
