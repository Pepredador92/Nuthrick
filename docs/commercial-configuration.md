# Configuración comercial inicial de Nuthrick

Extiende ADMIN-1; no crea otro sistema de planes ni otro ledger. Proyecto único: `qlsqhvyrslclmlstlemn`. Fecha: 23 de septiembre de 2026 (México). Esta política de suspensión sustituye la descrita en el informe histórico de ADMIN-1.

## Catálogo y capacidades

| Capacidad / precio | Esencial | Profesional |
|---|---:|---:|
| Mensual, MXN | $349 | $499 |
| Anual, MXN | $3,490 | $4,990 |
| Pacientes activos | 30 | Ilimitados |
| Pacientes archivados / históricos | Sin consumir cupo | Sin consumir cupo |
| Pacientes, consultas y diseño de consulta | Sí | Sí |
| Taller manual, Agenda, perfil público | Sí | Sí |
| Superlink y chat | Sí | Sí |
| PDF de planes | Sí | Sí |
| Biblioteca personal | Sí | Sí |
| Biblioteca compartida | Selección inicial básica | Completa |
| R24h y PES: entitlement | Sí | Sí |
| Taller IA: entitlement | No | Sí |
| LaTeX y exportación avanzada de evolución | No | Sí |
| Créditos incluidos por mes, **provisionales** | **10** | **50** |
| Compra futura de créditos: entitlement | Sí | Sí |

Los precios mensual y anual se guardan por separado. No existe una fórmula obligatoria de descuento anual. Nombre, descripción, precios, visibilidad, capacidades, límites y créditos se editan en Admin → Planes. El catálogo público `/planes` tiene selector mensual/anual y se alimenta de la proyección `plan_catalog`; excluye planes internos/inactivos y datos de cuentas.

`exports` conserva su significado de PDF/exportación básica. `patient_superlink` cubre Superlink y chat. Se agregan únicamente `exports.tex`, `exports.advanced` y `diet_library.full`; no se duplican capacidades equivalentes. Los componentes consultan capacidades, nunca nombres de planes para autorizar.

La biblioteca básica conserva todas las bases propias y habilita tres bases compartidas existentes, seleccionadas inicialmente por título. Es una selección de producto provisional, **no una nueva revisión clínica**. El resto queda en nivel `full`. Tanto RLS como los RPC de aplicación verifican el nivel. Los planes internos conservan las funciones que ya tenían.

## Créditos provisionales y periodos

La [calibración existente](ai-phase-4d-calibration.md) midió aproximadamente 0.074 créditos por R24h, 0.606 por PES y 1.594–2.889 por Taller. La muestra es pequeña; 10/50 son parámetros iniciales editables, no una cifra comercial definitiva ni una garantía de número de consultas. La interfaz y el catálogo los identifican como provisionales. `ai.monthly_credits` debe ser entero entre 0 y 1,000,000; no admite `unlimited`.

- `included_credits`: asignación mensual del plan, vigente sólo durante su periodo. Al renovar se reemplaza el remanente, sin acumularlo.
- `purchased_credits`: recargas y cortesías administrativas; se conservan hasta consumirse. Una cortesía entra como `ADMIN_ADJUSTMENT`, no como renovación.
- Consumo: primero incluidos vigentes y después adicionales. La reserva/liquidación existente mantiene este orden.
- Ledger único: `PLAN_ALLOCATION`, `PURCHASE`, `ADMIN_ADJUSTMENT`, `USAGE`, `REFUND` y las operaciones existentes de reserva/liquidación.
- `billing_interval`: `manual`, `monthly` o `annual`. Los dos últimos necesitan fecha de fin. El precio no efectúa un cobro.
- Los créditos se asignan por **mes de calendario anclado al inicio original**, en UTC, incluso en acceso anual. Por ejemplo, 31/enero → 28/febrero → 31/marzo. El último periodo se corta al vencimiento comercial.
- Cambiar plan conserva el ancla y el periodo ya asignado; no entrega un segundo saldo en mitad del mismo periodo. La nueva cuota aplica a la siguiente asignación elegible. No se asignan meses atrasados de forma acumulada.
- La función de servicio `allocate_plan_credits(owner)` y el botón administrativo de asignación usan la misma función privada. No se instaló un job ni scheduler.
- Se serializa por cuenta, hay clave determinista de operación e índice único por cuenta/inicio de periodo. Ocho llamadas simultáneas producen una sola asignación y auditoría. Otra clave para el mismo periodo tampoco duplica créditos.
- Si quedan reservas de créditos incluidos sin liquidar, la renovación responde `unsettled_period`. Se debe reconciliar y reintentar. No borra reservas ni perjudica recargas.
- No se asigna mientras haya un grant activo, acceso manual, cuota cero, suspensión/cancelación o acceso fuera de vigencia.
- `ai_grant_credits` conserva su firma existente. Sus nuevas entradas registran cantidad y periodo para verificar idempotencia; una clave histórica sin esos metadatos devuelve conflicto si se reutiliza, sin alterar el saldo histórico.

## Founder, Beta y Full Access

**Founder** es `access_grants.grant_kind=founder`, vinculado a un plan y sin fecha de fin. Fuerza `ai.monthly_credits=0` en el resolver, incluso con un override de créditos, y no obtiene renovación. Las demás capacidades provienen del plan asignado. Admin puede otorgarlo/revocarlo; los códigos pueden otorgarlo con `max_redemptions` configurable y una cortesía inicial en el ledger. `one_time_price` es opcional e informativo; no se fijó ni publicó precio Founder. El grant no necesita un nuevo plan público.

**Beta** sigue interno. BETA5 conserva 90 días, máximo 5 canjes y 0 créditos iniciales. Admin puede dar 100, 300, 500 u otra cantidad mediante el ledger existente. No se anuncia un plan gratuito.

**Full Access** sigue interno, con todas las capacidades SaaS, sin vencimiento para la cuenta autorizada y sin cambiar su saldo existente. La disponibilidad global del proveedor IA sigue siendo una condición separada. La segunda cuenta mantiene su acceso y no recibe administración. El detalle administrativo identifica registros profesionales incompletos para distinguirlos de un onboarding terminado.

## Pacientes, downgrade y suspensión

El cupo cuenta `status=active`, `archived_at IS NULL`, `deleted_at IS NULL`. Un bloqueo por profesional serializa altas/reactivaciones. Al llegar a 30 se bloquea solamente agregar o reactivar por encima del cupo; editar, consultar y archivar pacientes existentes sigue permitido. Los archivados no consumen cupo. La UI explica el límite y enlaza a Ver planes.

Un downgrade de 60 activos a límite 30 devuelve `patient_usage.over_limit=true`; conserva los 60, no archiva ni elimina automáticamente. Sólo se admiten nuevas altas/reactivaciones cuando el resultado quede dentro del cupo.

Estados comerciales: `trial`, `active`, `grace`, `suspended`, `cancelled`; el resolver también representa no asignado, programado y vencido. Precedencia: suspensión/cancelación → grant vigente → acceso base; las excepciones vigentes prevalecen sobre capacidades del plan, salvo la cuota mensual cero de Founder.

**Suspensión:** `allowed=true`, `read_only=true`. Permite entrar, navegar y leer los expedientes, pacientes, consultas, planes y espacios clínicos existentes de la propia cuenta. No elimina datos. Mantiene lectura del Superlink previamente existente, autenticación de su portal y exportación de planes permitida por el entitlement (PDF; TEX sólo si lo incluye). Bloquea altas, edición, borrado, archivo/reactivación, publicación, cambios de Taller/biblioteca, configuración/operaciones de Agenda, nuevos enlaces, envío de mensajes/notas y operaciones IA. El perfil público deja de operar durante la suspensión. La exportación avanzada desde la interfaz queda bloqueada. Cancelación y vencimiento conservan la política previa de acceso cerrado; no se reinterpretan como suspensión.

RLS separa lectura de escritura manteniendo las políticas de pertenencia existentes. Triggers y guardas de funciones con privilegios cubren escrituras y rutas de servidor; una llamada directa al backend no evita los límites. `canReadFeature` conserva navegación de lectura; `canUseFeature` deniega operaciones si `read_only`. La interfaz muestra un aviso global de sólo lectura. Algunos editores clínicos existentes permanecen visibles, pero cualquier intento de guardar es rechazado por el servidor.

## Arquitectura, seguridad y auditoría

Se extienden tablas existentes: `plans`, `professional_access`, `access_grants`, `access_codes`, `ai_credit_ledger` y `diet_library_items`. No hay tablas comerciales o ledger duplicados. Se agregan restricciones, un índice único de asignaciones, helpers privados y wrappers públicos con permisos explícitos. Los RPC administrativos siguen exigiendo pertenecer a `platform_admins`; no confían en metadatos editables del usuario.

`resolve_effective_entitlements` es la fuente única. Cambiar los entitlements de un plan se refleja en la próxima lectura/actualización del acceso sin migrar cuentas. Se auditan configuración inicial, edición de planes/códigos, cambio de plan/modalidad, grants Founder, revocaciones, extensiones Beta, asignaciones nuevas y ajustes de créditos. Un reintento de renovación no genera una segunda asignación ni auditoría.

## Entrega solicitada (37 puntos)

1. Esencial configurado y público.
2. Profesional configurado y público.
3. Mensual: 349 / 499 MXN.
4. Anual: 3,490 / 4,990 MXN, valores independientes.
5. Beta, Full Access y acceso de transición internos.
6. Esencial: clínica/manual/Agenda/Superlink/PDF/biblioteca básica/R24h/PES.
7. Profesional: lo anterior + ilimitados, Taller IA, biblioteca completa, TEX y exportación avanzada.
8. `patients.limit`: 30 activos / ilimitado.
9. En 30: bloqueo exclusivo de altas/reactivaciones adicionales.
10. Downgrade: conserva expedientes, marca exceso, permite trabajo existente.
11. Superlink y chat incluidos en ambos.
12. Taller manual en ambos.
13. Taller IA sólo con `ai.diet_draft` (Profesional por defecto).
14. R24h entitlement en ambos; proveedor apagado.
15. PES entitlement en ambos; proveedor apagado.
16. 10 / 50 créditos mensuales provisionales editables.
17. Incluidos y adicionales separados en la cuenta/ledger existentes.
18. Consumo de incluidos vigentes antes de adicionales.
19. Renovación mensual idempotente, incluso en anual; sin scheduler.
20. Founder permanente como grant, cuota mensual cero, cortesías por ledger.
21. BETA5: 90 días / 5 canjes / 0 iniciales, sin cambios.
22. Full Access del propietario sin vencimiento, privilegios y saldo conservados.
23. Estados conservados; suspensión de sólo lectura documentada arriba.
24. Resolver efectivo central conservado y ampliado.
25. Backend: RLS, triggers, RPC y guardas de IA/portal/biblioteca.
26. Frontend: helpers de capacidades, avisos de límite/suspensión y comparador.
27. Auditoría en cambios y asignaciones; retries sin duplicado.
28. Migración `20260924004436_commercial_configuration.sql`, aplicada y verificada en el único proyecto autorizado.
29. Pruebas: 754 frontend (91 archivos), 110 IA + 19 pasos, 6 Agenda, 1 FastAPI; SQL y concurrencia con datos sintéticos locales.
30. TypeScript aprobado.
31. ESLint sin errores; advertencia previa `SecondShiftVisual` sin uso en LandingPage.
32. Build Vercel y smoke SSR aislado de seis rutas, incluyendo `/planes`.
33. Security Advisors: 35 hallazgos previos y los mismos 35 después; **cero regresiones nuevas**, comparación por identidad y no sólo por cantidad.
34. Un commit exclusivo de esta iteración; cambios ajenos excluidos.
35. Un push a main y un despliegue automático de Vercel tras validaciones.
36. **OPENAI CALLS = 0.** No se habilitó ningún proveedor ni se modificaron sus flags.
37. ADMIN-2: contratación/checkout, pasarela, estados de pago/webhooks y conexión del ciclo de renovación; validar precios/cuotas definitivos. Las recargas pagadas se conectarán en la fase de créditos prevista (ADMIN-3).

## Validación

`node scripts/test-admin.mjs` crea una base efímera local desde el esquema, aplica ADMIN-1 y esta migración, usa usuarios ficticios y elimina su entorno al terminar. Verifica paciente 31, archivo/reactivación, downgrade, suspensión, Founder por admin/código, anual con renovación mensual, meses cortos, reservas pendientes, idempotencia, carreras de cupos/códigos/créditos y HTTP real mediante PostgREST (admin 200, profesional 403, anónimo 401).

Pruebas visuales con fixtures ficticios: comparación mensual/anual, sólo dos planes públicos, formulario Founder, escritorio y ancho móvil 390 px sin desbordamiento horizontal. No se guardaron cambios en cuentas reales para probar la UI.

Security Advisors previos: 23 avisos INFO de RLS sin políticas en tablas privadas ya existentes, 11 WARN de funciones SECURITY DEFINER públicas ya existentes y 1 WARN de protección de contraseñas filtradas desactivada. Referencias: [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [funciones con privilegios](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

### Comprobación remota después de migrar

13 pacientes, 22 consultas, 9 planes clínicos, 2 perfiles, 45 entradas de ledger y 14 generaciones: sin cambios. Las huellas agregadas del contenido de pacientes y consultas coinciden antes/después. Ninguna función IA habilitada. Un único administrador: la cuenta del propietario previamente autorizada. Full Access permanece activo sin vencimiento; la segunda cuenta conserva Acceso previo. Catálogo público: exactamente Esencial y Profesional; biblioteca compartida: 3 básicas y 18 completas. BETA5 conserva 90/5/0.
