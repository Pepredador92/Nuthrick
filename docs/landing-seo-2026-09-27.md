# Landing Nuthrick · auditoría y cambios locales

## Alcance y base

Base: origin/main b458799, copia aislada `landing-seo`. Se incorporaron los cambios locales previos de LandingPage y su prueba antes de comenzar. El checkout original y el worktree de Ajustes permanecen intactos. No se realizan commit, push ni despliegue.

## Auditoría previa

- React 19, TypeScript, Tailwind 4 y vinext sobre Vite 8, con App Router de Next para entradas/metadata y React Router 7 para la aplicación. Nitro genera el despliegue. No migrar framework.
- La ruta opcional `app/[[...path]]` incluye `/` y carga ClientApplication. Su guarda useSyncExternalStore entrega únicamente un div vacío durante SSR: el texto comercial depende de JavaScript y carga el árbol del producto, autenticación y módulos clínicos.
- Existe un H1 comercial, pero no explica la categoría del producto. Hay abundantes H2 de beneficios y H3 dentro de simulaciones, sin una presentación concreta de expediente y planes.
- Metadata compartida: título centrado en el lema, descripción extensa, OG/Twitter con imagen local. El dominio canónico ya está centralizado en SITE_ORIGIN (nuthrick.com por defecto) en la versión publicada. `lang=es`, viewport y fuentes Geist locales a través de next/font.
- Robots y sitemap ya existen en origin/main. El sitemap sólo lista portada y tres documentos legales. Las rutas internas tienen noindex, pero robots bloquea su rastreo, impidiendo que Google vea ese noindex.
- No hay JSON-LD ni sección del creador. Las imágenes conceptuales están hechas con HTML, no son capturas reales; no presentar pacientes ficticios como testimonios. No hay métricas ni reseñas verificadas que marcar.
- Landing muy largo, redundante; navegación de secciones desaparece entre 640 y 1023px. Header/footer están dentro de main. Hay un botón de demostración sin acción. Textos pequeños y claros en simulaciones; precios en columnas estrechas en tablet. CTA repetido, pero algunas promesas son absolutas.
- Hay enlaces a registro, acceso y documentos legales. Los precios son una presentación inicial estática y no garantizan condiciones vigentes; debe quedar claro y enlazar los planes actuales.
- No se encontró analítica de marketing en app, src/lib ni dependencias. No incorporar terceros.
- Sin datos de campo de LCP, CLS e INP: no atribuir una mejora numérica ni prometer posicionamiento. Medición local posterior separada de Core Web Vitals de usuarios reales.
- Tres fallos previos de pruebas (de 866): uno en LandingPage por H1 desactualizado y dos en LegalPage (mock sin supabase.from); registrar resultados completos al finalizar. Lint/typecheck/build: ver verificación final.

## Plan de implementación

1. Entrada `/` dedicada y renderizada en servidor; catch-all obligatorio para las demás rutas. Landing sin contexto de autenticación/router. Sólo menú móvil interactivo como isla cliente.
2. Conservar identidad, colores y CTA «Registrarme»; H1 define software para nutriólogos y mantiene la propuesta «Termina cada consulta con el trabajo hecho».
3. Reducir secciones redundantes, describir expediente, planes, cálculos y seguimiento con precisión. Conservar distinción de funcionalidades en desarrollo. FAQ visible y enlaces a planes vigentes.
4. Sección creador destacada antes de precios, fotografía original sin retoque creativo, WebP en dos resoluciones, dimensiones y lazy loading. Texto completo y énfasis solicitados.
5. Metadata específica, canonical raíz, OG/Twitter, icono y JSON-LD SoftwareApplication/Organization/WebSite/Person, sin ratings, ofertas ni acreditaciones inventadas.
6. Robots compatible con noindex y sitemap público existente; no nuevas páginas de palabras clave. Mantener rutas, API, base de datos y autenticación.
7. Verificar HTML sin JS, navegación, menú, responsive, pruebas existentes, lint, typecheck y build de producción.

## Criterios SEO

Principal: «software para nutriólogos», intención de evaluar una herramienta de consulta. Secundarias naturales: software de nutrición, expediente clínico nutricional, planes de alimentación, seguimiento nutricional e inteligencia artificial como apoyo. No se utilizan volúmenes inventados ni meta keywords.

Fuentes técnicas: [JavaScript y SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [noindex y rastreo](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [datos estructurados](https://developers.google.com/search/docs/appearance/structured-data/sd-policies). El renderizado inicial reduce la dependencia del rastreo de JavaScript. Los datos estructurados no garantizan resultados enriquecidos.

## Resultado implementado

- Portada independiente en `frontend/app/page.tsx`, con HTML renderizado desde servidor; catch-all movido a `app/[...path]/page.tsx`. La aplicación conserva sus proveedores, rutas y controles de acceso.
- Landing con header, main y footer separados, salto al contenido, navegación también en tablet, controles táctiles, foco visible y títulos de sección moderados. Se retiraron un botón ficticio, decoraciones que sobresalían y bloques redundantes.
- Se conservan el CTA «Registrarme», el enlace al problema de la segunda jornada, el contacto y el mensaje comercial. La marca «Nuthrick» se muestra en header y footer. Se reincorpora Reembolsos porque la versión publicada contiene esa página legal.
- Funciones organizadas por expediente, planes, cálculos y evolución; las demostraciones se identifican como ilustrativas. Las funciones en desarrollo no se anuncian como disponibles. No hay promesas de resultados clínicos.
- Sección del creador antes de los precios, con la fotografía real completa, alt descriptivo, dimensiones reservadas, srcset y lazy loading. Original de 2,458,322 bytes; versiones WebP de aproximadamente 48 y 144 KiB. No se publica el JPG pesado ni su metadata EXIF.
- Planes con precios de referencia existentes, enlace a `/planes` y explicación de condiciones vigentes. Se elimina la afirmación no sustentada de «Mejor valor». No se cambia el sistema comercial.
- FAQ visible que responde dudas de uso. No se añade FAQPage: aporta contenido para el visitante sin perseguir una presentación enriquecida. JSON-LD de SoftwareApplication, Organization, WebSite y Person; sin ofertas, ratings, reseñas, certificaciones ni cifras nuevas.
- Robots permite leer el noindex de las páginas privadas. El sitemap mantiene únicamente `/`, `/terms`, `/privacy` y `/refunds`; autenticación y permisos siguen protegiendo la información. Los documentos legales reciben títulos diferentes en sus entradas.
- Sin librerías nuevas de producción, sin scripts de analítica, sin consultas a servicios de datos desde el landing. Sólo el menú es interactivo del lado cliente. Los esquemas y el contenido principal no esperan una interacción.

### Metadata final

- Title: `Software para nutriólogos | Nuthrick`.
- Description: `Organiza expedientes, cálculos, planes de alimentación y seguimiento con Nuthrick. Software creado por un nutriólogo para terminar cada consulta con el trabajo hecho.`
- Canonical: `https://nuthrick.com/` por defecto, usando la configuración SITE_ORIGIN existente. El serializador puede emitir la raíz sin slash; es la misma URL.
- OG: website, locale es_MX, site_name Nuthrick, título y descripción anteriores, imagen local existente `/og.png` (1730 × 909).
- Twitter: summary_large_image, mismo título, descripción e imagen.
- Documento en español, viewport responsive, favicon SVG explícito, robots index/follow sólo en la portada; rutas internas noindex/nofollow.

### Archivos

- `frontend/app/page.tsx`: portada pública SSR y JSON-LD.
- `frontend/app/[...path]/page.tsx`: entrada restante (renombrada desde la ruta opcional), títulos legales y noindex existente.
- `frontend/app/robots.ts`, `frontend/app/globals.css`: rastreo y estilos de accesibilidad limitados al landing.
- `frontend/src/screens/LandingPage.tsx`, `frontend/src/components/marketing/LandingHeader.tsx`: contenido y diseño.
- `frontend/src/lib/productMetadata.ts`, `frontend/src/lib/landingStructuredData.ts`: identidad de búsqueda y datos estructurados.
- `frontend/public/images/jose-olmedo-nuthrick-{640,1280}.webp`: fotografía optimizada.
- `frontend/src/screens/LandingPage.test.tsx`, `frontend/src/lib/landingSeo.test.ts`, `frontend/scripts/check-vercel-build.mjs`: verificaciones de SSR, metadata y rutas.
- `frontend/scripts/preview-landing.mjs`, `frontend/scripts/check-landing.mjs`: preview del bundle de Vercel y comprobación visual reproducible (Playwright externo vía PLAYWRIGHT_MODULE).

## Siguientes páginas: recomendaciones, no creadas

Estas son hipótesis de intención, que deben validarse con consultas reales de Search Console; no son resultados de un estudio de volumen.

| Página propuesta | Decisión y contenido necesario |
|---|---|
| `/software-para-nutriologos` | Evitar por ahora: compite con la intención principal de `/`. Mantener la portada como destino principal. |
| `/expediente-nutricional` | Potencial intención diferenciada: explicar estructura, entrevista, historia y continuidad con capturas reales de datos ficticios y un caso de uso completo. |
| `/planes-de-alimentacion` | Potencial intención sobre elaboración de dietas: equivalentes, distribución, menús y revisión profesional. Publicar sólo con explicación sustancial del flujo disponible. |
| `/seguimiento-nutricional` | Potencial intención sobre evolución, gráficas y reportes; demostrar comparación entre consultas sin inventar resultados de pacientes. |
| `/ia-para-nutriologos` | Esperar una delimitación comercial estable de capacidades disponibles, controles de revisión y limitaciones. No posicionar promesas de desarrollo como producto terminado. |

## Medición y pendientes externos

No se encontró una solución de analítica de marketing que reutilizar. Los CTA principales incluyen identificadores `data-cta` (hero-register y closing-register), sin enviar información a terceros.

1. Tras aprobar y desplegar: verificar propiedad del dominio en Search Console, enviar sitemap, inspeccionar `/` y revisar canonical elegido, rastreo, indexación y páginas excluidas.
2. Consultar rendimiento por búsqueda, landing page, país y dispositivo. Medir impresiones, clics y CTR de las consultas semilla sin repetirlas artificialmente.
3. Si se aprueba GA4 u otra herramienta: registrar clics CTA por posición y `sign_up` sólo tras registro confirmado; atribuir conversiones de tráfico orgánico, sin datos clínicos ni identificadores de pacientes. No contar un clic como registro.
4. Revisar Core Web Vitals de campo en Search Console/CrUX tras acumular tráfico suficiente. INP requiere interacción real y no se sustituye por TBT de Lighthouse.
5. Comprobar configuración productiva de dominio, compresión, caché y ausencia de noindex/X-Robots-Tag heredado del proveedor. La preview local no demuestra la configuración del futuro despliegue.
6. Los documentos legales y perfiles públicos conservan su renderizado del producto: mejorar su SSR, si se desea, requiere un alcance separado con su fuente dinámica. No se copian textos legales ni datos privados al landing.

## Verificación final

| Comprobación | Resultado |
|---|---|
| Suite completa antes | 863 aprobadas, 3 fallidas (H1 previo y dos mocks de LegalPage) |
| Suite completa después | 868 aprobadas, 2 fallidas preexistentes de LegalPage; 111 archivos aprobados de 112 |
| Pruebas del landing/SEO tras los últimos ajustes | 7/7 aprobadas |
| Lint, typecheck, git diff --check | Aprobados |
| Build con NITRO_PRESET=vercel | Aprobado; pruebas del handler aislado para portada, login, planes y rutas privadas/admin |
| HTML inicial | Un H1, texto del creador, JSON-LD, canonical y robots correctos; contenido visible sin JavaScript |
| Navegación | CTA abre registro; `/app` y `/admin` redirigen a login sin sesión; menú abre/cierra y navega al creador |
| Responsive | 320, 390, 768 y 1440 px sin desbordamiento horizontal ni elementos fuera del viewport |
| Axe | 0 infracciones detectadas a 390 y 1440 px |
| Lighthouse móvil local | Rendimiento 96; accesibilidad 100; buenas prácticas 100; SEO 100 |
| Métricas de laboratorio | LCP 2.4 s, CLS 0, TBT 0 ms; transferencia inicial 214 KiB |

Lighthouse se ejecutó sobre el bundle real de Vercel servido localmente con gzip y caché de archivos estáticos en el script de preview. No es una medición de producción ni una comparación estadística antes/después. No se cambió la configuración de transporte productiva. La foto del creador carga de forma diferida al aproximarse a la sección y no pertenece a esos 214 KiB iniciales. No se realizó un inicio de sesión con credenciales ni operaciones sobre pacientes: se verificaron las guardas de acceso sin sesión y las pruebas existentes. Persisten advertencias de tamaño de chunks del producto durante build; el landing no carga esos módulos clínicos.

Los dos fallos previos restantes están en `frontend/src/screens/LegalPage.test.tsx`: el mock no define `supabase.from`, que utiliza SupportContact. Se preservaron los archivos ajenos a este encargo. La suite no está completamente verde por esa deuda previa.

Evidencias en `output/landing-seo/`: capturas por tamaño, browser-results.json, axe-390.json, axe-1440.json y lighthouse-mobile.report.html/json.

### Revisar y retomar

- Preview: http://localhost:4188/#creador
- Copia de trabajo: `/Users/jose/.codex/worktrees/landing-seo/Nuthrick`.
- Reiniciar preview: dentro de `frontend`, ejecutar `node scripts/preview-landing.mjs` después de `NITRO_PRESET=vercel npm run build`.
- Esta copia usa un enlace al node_modules ya instalado del proyecto para no reinstalar dependencias. No se copiaron credenciales ni archivos .env.
- Todo el resultado está sin commit. El checkout original no fue actualizado ni limpiado. No se hizo push, merge o deploy del landing.

## Autorización posterior

Después de revisar la entrega local, el usuario autorizó el push del landing el 27 de septiembre de 2026. Las menciones anteriores a mantener el resultado sin commit describen el estado de la entrega inicial. Para publicar se comprobó que origin/main seguía en b458799 y se seleccionaron únicamente los 16 archivos de este encargo; las capturas, logs y archivos ajenos permanecen fuera del commit.
