# ADMIN-1 — Control de Nuthrick

## Arquitectura y seguridad

La interfaz privada vive en `/admin`. El frontend usa `my_access()` para UX y `admin_api(action, data)` para operaciones administrativas. La autorización real ocurre en PostgreSQL: una fachada `SECURITY INVOKER` llama a una implementación `SECURITY DEFINER` en `private`, con `search_path=''`, que exige `auth.uid()` en `platform_admins` y `enabled=true` **en cada llamada**. Ni email, metadatos editables ni parámetros de URL conceden acceso. El rol no concede acceso a expedientes clínicos.

La membresía inicial se provisiona una sola vez para la cuenta propietaria confirmada por el usuario, mediante una operación administrativa de infraestructura auditada. No hay privilegios implícitos para otras cuentas ni un endpoint de autoalta de administradores. Un administrador puede seguir entrando a `/admin` aunque su acceso como profesional venza.

Todas las tablas nuevas están en `private`, tienen RLS, denegación explícita para `authenticated` y privilegios directos revocados a `PUBLIC`, `anon`, `authenticated` y `service_role`. Las funciones internas no se exponen como RPC. Las únicas fachadas públicas conceden los mínimos permisos necesarios. `admin_api` rechaza profesionales normales con SQLSTATE `42501`, que PostgREST convierte en HTTP 403; anónimos reciben 401.

## Modelo

| Tabla privada | Responsabilidad |
| --- | --- |
| `platform_admins` | Administradores autorizados y revocables |
| `plans` | Definición comercial, precios mensual/anual, moneda, disponibilidad y orden |
| `entitlement_catalog` | Capacidades y límites tipados, etiquetas y grupos |
| `plan_entitlements` | Valores por plan, validados según el catálogo |
| `professional_access` | Plan base, estado, vigencia y origen |
| `access_grants` | Cortesías temporales de un plan, revocables |
| `professional_overrides` | Excepciones individuales temporales o indefinidas |
| `access_codes` | Hash del código, plan, duración, cupo, fechas, créditos iniciales |
| `access_code_redemptions` | Uso único por combinación código/cuenta |
| `admin_audit` | Actor, acción, destino, entidad, fecha, motivo y cambios mínimos |
| `commercial_usage_months` | Contador de consultas por mes UTC, resistente a cambios de fecha y borrado |

El saldo sigue en `private.ai_accounts`, `private.ai_credit_ledger` y `private.ai_generations`. No se duplicó el sistema de IA ni se agregó billing.

## Catálogo inicial

- **Nuthrick Full Access**: continuidad de la cuenta propietaria, capacidades SaaS e IA preparadas; cero créditos mensuales y sin compras activas.
- **Nuthrick Beta**: módulos SaaS, cero créditos incluidos, capacidades IA inicialmente deshabilitadas. Pueden habilitarse por plan o excepción cuando corresponda; eso no enciende el proveedor.
- **Acceso previo**: preserva las funciones SaaS de las demás cuentas existentes, sin elevarlas a administrador ni añadir créditos.

Son definiciones temporales editables, con precios inicialmente sin definir. Desactivar un plan impide nuevas asignaciones y canjes; conserva las cuentas que ya lo usan. Las ediciones requieren la revisión `updated_at` leída, para detectar cambios simultáneos.

Capacidades: `patients`, `consultations`, `consultation_design`, `diet_workshop`, `diet_library`, `agenda`, `public_profile`, `patient_superlink`, `exports`, `ai.recall_24h`, `ai.pes`, `ai.diet_draft`, `ai.credit_purchase`.

Límites: `patients.limit`, `consultations.monthly_limit`, `ai.monthly_credits`. Los valores son booleanos, enteros no negativos o el valor explícito `"unlimited"`; nunca `-1`. Se validan con un trigger contra el tipo del catálogo. La interfaz muestra nombres agrupados en Clínica, Taller, Paciente, Agenda, IA y Límites.

## Resolver único

`private.resolve_effective_entitlements(professional_id)` es la única fuente de permisos efectivos. Las aplicaciones usan `canUseFeature`, `getLimit`, `requireEntitlement` y sus equivalentes SQL. Ningún módulo profesional decide permisos mediante el nombre de un plan.

Orden de resolución:

1. `suspended` o `cancelled` bloquean las capacidades, incluso si hay cortesías u overrides.
2. Una cortesía vigente sustituye temporalmente el plan base. Al vencer o retirarse vuelve el acceso base, si sigue vigente. Una cortesía sin plan base no crea acceso indefinido.
3. En ausencia de cortesía, se usa el plan base dentro de su vigencia.
4. Un override vigente tiene prioridad sobre los valores de ese plan, incluso para deshabilitar una capacidad. No reactiva una cuenta sin acceso.
5. Ante ventanas superpuestas gana el inicio más reciente, luego fecha de creación e ID, con orden determinista.

Las ventanas son `[starts_at, ends_at)`. `ends_at=null` permite vigencia indefinida en acceso base y overrides; las cortesías siempre vencen. Los estados almacenados son `trial`, `active`, `grace`, `suspended`, `cancelled`; el resolver también informa `scheduled`, `expired` y `unassigned`. No existe renovación automática. La reactivación conserva el vencimiento anterior: una cuenta vencida necesita además extensión o reasignación.

Los cambios de plan son inmediatos y revocan cortesías anteriores de plan. Las excepciones se conservan hasta retirarlas o vencer. No hay cambios programados para el próximo período en esta fase.

## Flujos administrativos

Inicio muestra profesionales registrados, activos, en prueba y suspendidos, además del historial administrativo. Profesionales incluye búsqueda por nombre/correo y paginación. El correo proviene de `auth.users` mediante la proyección autorizada. La actividad disponible se etiqueta con precisión como **último inicio de sesión**.

La ficha muestra información de cuenta, acceso base/efectivo, permisos, vigencias, cortesías, excepciones, saldo, uso agregado por función en 30 días y movimientos del ledger. No consulta ni devuelve pacientes, consultas, laboratorios, PES, prompts ni planes nutricionales.

Acciones: cambiar plan/vigencia, dar cortesía, agregar o retirar créditos, crear/retirar excepciones, retirar cortesías, suspender y reactivar. Suspender actualiza el estado comercial; no elimina registros. Los motivos son obligatorios para ajustes de crédito, cambios de acceso, excepciones y suspensión; la nota de cortesía es opcional.

## Créditos y auditoría

`private.adjust_ai_credits` reutiliza el ledger existente con `ADMIN_ADJUSTMENT`. Un bloqueo de la cuenta y una clave de operación hacen la transacción atómica e idempotente. La misma clave con un importe diferente falla. Ledger, proyección de saldo y auditoría se confirman juntos; ningún navegador puede modificar saldos directamente.

Los créditos manuales se agregan al bucket durable existente `purchased_credits`. La UI lo llama **Recargas y cortesías** porque el modelo original comparte ese bucket; el tipo de ledger y la auditoría distinguen la procedencia. Los retiros consumen primero ese bucket, después créditos incluidos vigentes, respetando reservas y evitando saldos negativos. El uso histórico no se reescribe.

`ai.monthly_credits` es configuración comercial; editarlo o asignar un plan **no** acredita saldos. La asignación periódica y su scheduler quedan para billing. Beta incluye cero créditos por defecto; el ajuste manual permite, por ejemplo, regalar 300 sin habilitar OpenAI.

La auditoría es append-only para clientes: no hay RPC de edición/borrado ni acceso directo a la tabla. Cada cambio registra actor autenticado, destino, motivo y valores pertinentes. La redención registra al propio usuario como actor; no lo presenta como administrador.

## Códigos beta

El administrador define un código legible que se normaliza a mayúsculas y se guarda únicamente con SHA-256. Se muestra durante su creación; el catálogo devuelve el nombre administrativo y configuración, nunca el hash ni el código almacenado. No se registran códigos en auditoría.

`redeem_access_code(code)` deriva el profesional de Auth, exige cuenta verificada, bloquea cuenta y código, verifica plan activo, fechas, cupo y uso previo, asigna trial y opcionalmente acredita por el mismo ledger. La operación completa es transaccional. Una cuenta con acceso vigente, suspendida o cancelada no puede usar un código para sustituirlo. El doble canje falla incluso bajo concurrencia. No hay onboarding público nuevo.

El ejemplo BETA5 corresponde a 90 días, máximo 5 profesionales y cero créditos. Es un código de acceso piloto; no un cupón de descuento ni un precio recurrente.

## Enforcement y migración

`AccessProvider` consulta acceso al cambiar de cuenta, al recuperar foco, tras cambios administrativos y cada 60 segundos. La navegación y los guards de rutas consultan capabilities; las decisiones críticas se vuelven a validar en servidor. Un fallo de verificación cierra el acceso y ofrece reintento.

En SQL se añaden políticas RLS **restrictivas** que se combinan con el aislamiento previo de cada profesional. Triggers protegen escrituras desde RPC privilegiadas y servicios. Se guardan explícitamente las RPC clínicas privilegiadas, la reserva/claim/config de IA, Agenda pública, Superlink y sus exportaciones. Los templates siguen siendo legibles para consultas aunque el plan no incluya editar su diseño. Los permisos de edición se validan por separado.

Los límites de pacientes y consultas se aplican con bloqueos por profesional. El contador mensual se incrementa al insertar, en UTC; cambiar `created_at` o borrar la consulta no recupera el cupo. La conciliación/liberación del ledger de IA puede completar operaciones ya reservadas después de un cambio de acceso.

La proyección del perfil público se conserva, pero su política comprueba vigencia y capability en cada lectura. La exportación de evolución desde el navegador verifica el permiso con RPC; las descargas de Superlink lo exigen dentro de la operación del servidor. El permiso de exportación gobierna la función del producto: no es DRM sobre datos clínicos previamente entregados al propietario.

La migración asigna continuidad una sola vez a perfiles preexistentes; no crea una regla de acceso completo para futuros registros. El propietario confirmado recibe Full Access y el rol de administrador por un bootstrap auditado. No se modifican pacientes ni expedientes en producción.

Migraciones: `20260923222850_admin_foundation.sql` y `20260923222911_admin_enforcement.sql`. Destino remoto único: `qlsqhvyrslclmlstlemn`.

## Validación y despliegue

- `node scripts/test-admin.mjs`: clona **solo el esquema** del Supabase local en una base temporal, aplica ambas migraciones, verifica continuidad y ejecuta SQL de permisos, planes, vigencias, overrides, cortesías, ledger, códigos, suspensión y aislamiento.
- Pruebas concurrentes: ocho reintentos de créditos, retiros simultáneos, último cupo de código, límite de pacientes y límite mensual de consultas con fechas manipuladas.
- PostgREST real aislado: administrador HTTP 200, profesional HTTP 403, anónimo HTTP 401. Datos sintéticos y JWT local exclusivo. Se elimina el entorno al terminar.
- Frontend: suite existente más pruebas de guards, errores de autorización, búsqueda, edición de planes, cortesía, ajuste de 300 créditos y BETA5.
- Backend: pruebas Deno de IA y Agenda y pytest de FastAPI, sin proveedores reales.
- TypeScript, ESLint y build con `NITRO_PRESET=vercel`; smoke SSR aislado incluye `/admin` y `/admin/plans`.
- Revisión visual con fixtures sintéticas en escritorio y móvil, sin desbordamiento horizontal.
- Advisors antes/después: comparar y resolver únicamente hallazgos nuevos de esta fase.

### Resultados del 23 de septiembre de 2026

- Frontend: **747 pruebas, 90 archivos, todas pasan** (`--maxWorkers=2 --testTimeout=15000`; la ejecución inicial con mayor concurrencia tuvo tres timeouts, sin fallos de aserción).
- SQL/PostgREST: todas las pruebas pasan, incluidos retiros de créditos incluidos, reservas y créditos vencidos; respuestas reales 200/403/401.
- IA Deno: **110 pruebas + 19 pasos**, todas pasan. Agenda Deno: **6**, todas pasan. FastAPI: **1**, pasa. Red de pruebas IA restringida a loopback y proveedores simulados.
- TypeScript: sin errores. ESLint: cero errores; una advertencia previa por `SecondShiftVisual` sin uso en LandingPage.
- Build Vercel y cinco smoke SSR: pasan.
- Supabase remoto: migraciones aplicadas exclusivamente a `qlsqhvyrslclmlstlemn`. Versiones locales alineadas con el registro remoto generado por MCP.
- Bootstrap auditado para la cuenta propietaria confirmada: administrador y Full Access indefinido. Segunda cuenta: Acceso previo, sin administrador. Lectura autenticada del propietario y denegación de `admin_api` a la segunda cuenta verificadas en producción, con transacciones de solo comprobación y rollback.
- BETA5: activo, 90 días, cinco usos, cero créditos iniciales. Se puede canjear hasta el 31 de diciembre de 2026 (vencimiento del código: 1 de enero de 2027, 00:00, México); cada canje inicia sus propios 90 días. La redención server-side está lista; el onboarding público se reserva para ADMIN-2.
- Antes/después: 2 profesionales, 13 pacientes, 22 consultas, 9 planes nutricionales, 45 movimientos del ledger y 14 generaciones históricas. Sin cambios a esos registros ni saldos. Funciones IA operativamente habilitadas: **0**. **OPENAI CALLS = 0**.

### Advisors

**Cero hallazgos de seguridad nuevos**, comparación por tipo y entidad. Permanecen 23 avisos informativos de [RLS sin políticas en tablas privadas previas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 11 advertencias de [RPC SECURITY DEFINER previas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) y la advertencia previa de [protección contra contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No se alteraron asuntos ajenos a ADMIN-1.

El advisor de rendimiento informa índices nuevos todavía sin uso, algo esperado al estrenar tablas con pocos datos. Se conservan: respaldan FKs y búsquedas por profesional. No hay FKs nuevas sin índice.

Vercel está conectado a la rama `main` de GitHub. La publicación se realiza con un solo push; se espera el despliegue automático de ese commit, sin un segundo deploy por CLI. La referencia definitiva del commit y del despliegue se registra en la entrega.

## ADMIN-2 y ADMIN-3

Quedan pendientes pasarela y checkout, compra real de créditos, webhooks, asignación periódica automática de créditos, renovaciones, cambio al próximo período, onboarding público para códigos, promociones complejas y precios recurrentes, facturación, impuestos/CFDI y afiliados. `source='billing'`, precios y catálogo están preparados; no se realizan cobros. Los interruptores operativos de IA y sus controles del piloto siguen independientes y apagados en producción.
