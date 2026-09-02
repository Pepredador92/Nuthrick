# Modelo de datos

## Tablas privadas

| Tabla | Propósito | Propietario |
|---|---|---|
| `professional_profiles` | Identidad profesional, onboarding y configuración pública | `id = auth.uid()` |
| `professional_businesses` | Establecimiento y logotipo | `professional_id` |
| `professional_education` | Múltiples formaciones ordenadas | `professional_id` |
| `professional_links` | Redes y enlaces personalizados | `professional_id` |
| `professional_service_images` | Metadatos de galería | `professional_id` |
| `professional_conditions` | Relación N:M con condiciones | `professional_id` |
| `professional_populations` | Relación N:M con poblaciones | `professional_id` |
| `availability_settings` | Duración, zona IANA y horizonte en días | `professional_id` |
| `availability_slots` | Rangos semanales normalizados | `professional_id` |
| `patients` | Ficha privada y estado del paciente | `professional_id` |
| `patient_tags` | Etiquetas propias del profesional | `professional_id` |
| `patient_tag_assignments` | Relación N:M paciente-etiqueta | `professional_id` |
| `patient_measurements` | Historial antropométrico con IMC generado | `professional_id` |
| `consultations` | Historial de consultas | `professional_id` |
| `consultation_notes` | Notas asociadas a una consulta | `professional_id` |
| `patient_progress_photos` | Metadatos de fotos privadas | `professional_id` |

Todas usan UUID, foreign keys y borrado en cascada desde el perfil. `updated_at` se mantiene con un trigger compartido.

## Catálogos

`conditions` y `patient_populations` son catálogos relacionales. Las relaciones profesionales nunca se guardan como texto separado por comas. El seed es idempotente y puede reactivarlos sin crear datos demo privados.

## Horarios

`weekday` usa 0–6, `start_time` y `end_time` usan `time`. Un check exige `end_time > start_time`. La extensión `btree_gist` y una exclusión sobre el rango de minutos impiden que dos filas del mismo profesional y día se superpongan, incluso bajo escrituras concurrentes.

Las zonas horarias se contrastan mediante trigger con `pg_timezone_names`, de modo que valores como `GMT-6` o nombres inventados no llegan a persistirse.

## Slug

`public_slug` es `citext`, por lo que la unicidad no distingue mayúsculas. Un trigger normaliza acentos, espacios y símbolos al formato `a-z`, `0-9` y guiones. La misma normalización existe en TypeScript para feedback inmediato, pero PostgreSQL conserva la autoridad.

## Proyección pública

`public_professional_pages` tiene:

- `slug`: identificador público.
- `profile_key`: UUID aleatorio para medios; no es `auth.users.id`.
- `content`: JSON sanitizado con sólo datos presentables.
- `updated_at`.

El JSON es una proyección de lectura, no la fuente de verdad. Triggers lo regeneran a partir de relaciones normalizadas y lo eliminan al despublicar el perfil.

## Storage

Bucket privado `professional-media`:

```text
{storage_key}/
  avatar/
  logo/
  services/
```

`storage_key` es distinto del ID de Auth. El bucket limita tamaño a 5 MiB y MIME a JPEG, PNG y WEBP. Las políticas también validan carpeta y extensión. Para visitantes anónimos, la ruta completa debe aparecer en la proyección pública; otros objetos del mismo namespace siguen siendo privados.

Las fotos de progreso usan el bucket privado `patient-progress` con la ruta
`{professional_id}/patients/{patient_id}/{archivo}`. Las políticas comprueban
el profesional autenticado y que el paciente pertenezca a ese profesional.
El IMC de `patient_measurements` es una columna generada; no se acepta como
valor manual.
