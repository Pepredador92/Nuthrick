# Identidad visual de Nuthrick

Actualización: 5 de octubre de 2026.

El símbolo circular y la figura humana se adaptaron a curvas vectoriales a partir de la referencia de marca facilitada por el propietario. El original recibido es una composición raster, no un archivo maestro vectorial; el nombre usa tipografía de sistema en negrita, sin atribuirle una fuente original desconocida.

- Geometría única: `supabase/functions/_shared/brand-mark.ts`.
- UI: `BrandMark` y `Brand` en `frontend/src/components/ui/Brand.tsx`; `Logo` conserva su enlace actual.
- Recursos: `frontend/public/brand/`, favicon, icono Apple y Open Graph.
- Regeneración: `node --experimental-strip-types frontend/scripts/generate-brand-assets.mjs` (sharp del frontend).
- Documentos: símbolo vectorial en el pie compartido; se conservan logotipos, datos e identidad propios de los profesionales.
- Aplicaciones: acceso, navegación profesional, administración, perfil público, reservas, Super Link y landing.
- Los iconos de hoja usados para representar suplementos o grupos de alimentos son iconos funcionales, no marcas de Nuthrick.

Colores de marca: verde profundo #173f39, marfil #f8f5ed y lima #d2e89f. Las superficies de producto mantienen sus temas actuales.

No se incorporan nuevos flujos, permisos, PWA, pagos ni cambios de datos con esta actualización de identidad.

## Landing breve

La portada pasa a cuatro momentos: gancho de pendientes tras consulta, recorrido visual existente del producto, planes/registro y origen de Nuthrick. La portada utiliza la fotografía facilitada por el propietario, guardada sin alterar en `frontend/public/images/landing/paciente-conversacion.png`; las fotografías editoriales anteriores quedan disponibles para referencias existentes.

- El cierre muestra la fotografía del creador con sus tres monitores y destaca «Creado por un nutriólogo. Para nutriólogos.», sin nombre ni datos personales en el texto.
- «Ver planes» visible en la cabecera sticky, incluso en móvil, hacia `/planes`.
- Catálogo y precios siguen usando `loadPublicCommercialData`; no se inventan importes si la consulta no está disponible.
- Prueba social textual solicitada por el propietario, destacada sin cantidades y con el mensaje «Nutriólogos ya utilizan Nuthrick para mejorar su consulta». La conversación superpuesta a la fotografía es ficticia y se identifica con la nota «Conversación de ejemplo» debajo de la fotografía; no se presenta como testimonio real. Las burbujas son texto HTML accesible, independiente de la imagen.
- La landing abre en tema noche cuando no hay una preferencia válida guardada. El selector conserva la elección explícita del visitante; las demás rutas mantienen su valor predeterminado.
- Conserva el tour de pantallas, su manejo por teclado, registro, acceso, preguntas desplegables y temas día/noche.
- Sin NFC ni QR. Sin modificaciones a funciones clínicas, permisos o reglas comerciales.
- Verificación: typecheck, ESLint, pruebas de landing/SEO, render PDF, revisión visual y build `NITRO_PRESET=vercel` con smoke SSR aislado de todas las rutas críticas.
