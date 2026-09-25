import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import {
  actionLabels,
  adminRequest,
  dateLabel,
  featureLabels,
  statusLabels,
  valueLabel,
  type AccessCode,
  type Audit,
  type Catalog,
  type Entitlement,
  type EntitlementValue,
  type Plan,
  type Professional,
  type ProfessionalDetail,
  type Usage,
} from "./api";

export function Heading({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-heading">
      <div>
        <p className="admin-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {text && <p className="admin-description">{text}</p>}
      </div>
      {children}
    </div>
  );
}
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`admin-field ${wide ? "admin-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`admin-badge ${status}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}
export function useAdminData<T>(
  action: string,
  params: Record<string, unknown> = {},
) {
  const key = JSON.stringify(params);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void adminRequest<T>(action, JSON.parse(key))
      .then((value) => {
        if (active) {
          setData(value);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [action, key, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}
function LoadError({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="admin-error">
      {error}
    </div>
  ) : null;
}
function Ready({
  data,
  error,
  children,
}: {
  data: unknown;
  error: string;
  children: ReactNode;
}) {
  if (error) return <LoadError error={error} />;
  return data ? (
    children
  ) : (
    <p className="admin-loading">Cargando administración…</p>
  );
}
export function ActionForm({
  action,
  values,
  onSaved,
  children,
  button = "Guardar",
  className = "admin-card",
}: {
  action: string;
  values: Record<string, unknown>;
  onSaved: () => void;
  children: ReactNode;
  button?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setSuccess(false);
    try {
      await adminRequest(action, values);
      setSuccess(true);
      onSaved();
      window.dispatchEvent(new Event("nuthrick:access"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setPending(false);
    }
  };
  return (
    <form className={className} onSubmit={submit}>
      <fieldset disabled={pending} style={{ minWidth: 0 }}>
        {children}
        <div className="mt-5">
          <LoadError error={error} />
          {success && (
            <p role="status" className="admin-success">
              Cambio guardado.
            </p>
          )}
          <button className="admin-button" disabled={pending}>
            {pending ? "Guardando…" : button}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
function AuditList({ rows }: { rows: Audit[] }) {
  return rows.length ? (
    <div>
      {rows.map((a) => (
        <div key={a.id} className="admin-audit">
          <strong>{actionLabels[a.action] ?? "Cambio administrativo"}</strong>
          <small>
            {a.actor} · {dateLabel(a.created_at)}
          </small>
          {a.reason && <p>{a.reason}</p>}
        </div>
      ))}
    </div>
  ) : (
    <p className="admin-note">Todavía no hay movimientos administrativos.</p>
  );
}
export function AdminHome() {
  const { data, error } = useAdminData<{
    registered: number;
    active: number;
    trial: number;
    suspended: number;
  }>("overview");
  const audit = useAdminData<Audit[]>("audit");
  return (
    <>
      <Heading
        eyebrow="Tu plataforma"
        title="Control de Nuthrick"
        text="Gestiona profesionales, accesos y capacidades desde un solo lugar."
      />
      <Ready data={data} error={error}>
        <div className="admin-metrics">
          {[
            ["Profesionales registrados", data?.registered],
            ["Activos", data?.active],
            ["En prueba", data?.trial],
            ["Suspendidos", data?.suspended],
          ].map(([label, n]) => (
            <div className="admin-metric" key={label}>
              <p>{label}</p>
              <strong>{n}</strong>
            </div>
          ))}
        </div>
        <div className="admin-grid">
          {[
            [
              "professionals",
              "Profesionales",
              "Revisa cuentas, vigencia y excepciones.",
            ],
            ["plans", "Planes", "Decide qué incluye cada acceso."],
            ["access", "Accesos", "Otorga pruebas y crea códigos beta."],
            ["credits", "IA y créditos", "Consulta consumo y ajusta créditos."],
          ].map(([path, title, text]) => (
            <Link className="admin-card" to={`/admin/${path}`} key={path}>
              <div className="flex justify-between">
                <h2>{title}</h2>
                <ArrowUpRight size={20} />
              </div>
              <p className="admin-note">{text}</p>
            </Link>
          ))}
        </div>
        <section className="admin-card">
          <h2>Actividad administrativa</h2>
          <LoadError error={audit.error} />
          <AuditList rows={audit.data ?? []} />
        </section>
      </Ready>
    </>
  );
}
function ProfessionalsTable({ items }: { items: Professional[] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Profesional</th>
            <th>Plan</th>
            <th>Estado</th>
            <th>Vigencia</th>
            <th>Créditos IA</th>
            <th>Último inicio de sesión</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>
                <Link to={`/admin/professionals/${p.id}`}>
                  {p.name || "Cuenta sin nombre"}
                </Link>
                <small>{p.email}</small>
                {p.onboarding_completed === false && (
                  <small className="text-amber-800">
                    Registro profesional incompleto
                  </small>
                )}
              </td>
              <td>{p.access.plan_name ?? "Sin plan"}</td>
              <td>
                <Badge status={p.access.status} />
              </td>
              <td>{dateLabel(p.access.ends_at)}</td>
              <td>{p.credits.toLocaleString("es-MX")}</td>
              <td>
                {p.last_activity ? dateLabel(p.last_activity) : "Sin actividad"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && (
        <p className="admin-empty">No se encontraron profesionales.</p>
      )}
    </div>
  );
}
export function ProfessionalsPage({
  accessMode = false,
}: {
  accessMode?: boolean;
}) {
  const [input, setInput] = useState(""),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const { data, error } = useAdminData<{
    items: Professional[];
    total: number;
  }>("professionals", { search, offset });
  return (
    <>
      <Heading
        eyebrow="Administración"
        title={accessMode ? "Accesos" : "Profesionales"}
        text={
          accessMode
            ? "Revisa la vigencia de cada cuenta. Abre una ficha para asignar un plan, otorgar una cortesía o extender el período."
            : "Cuentas registradas en Nuthrick y su situación actual."
        }
      >
        {accessMode && (
          <Link className="admin-button" to="/admin/access/codes">
            <Plus size={16} />
            Códigos beta
          </Link>
        )}
      </Heading>
      {accessMode && (
        <div className="admin-tabs">
          <NavLink end to="/admin/access">
            Accesos por cuenta
          </NavLink>
          <NavLink to="/admin/access/codes">Códigos beta</NavLink>
        </div>
      )}
      <section className="admin-card">
        <form
          className="admin-inline mb-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(input);
            setOffset(0);
          }}
        >
          <Search size={18} />
          <input
            aria-label="Buscar profesionales por nombre o correo"
            className="admin-search"
            placeholder="Buscar por nombre o correo"
            value={input}
            maxLength={100}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="admin-button secondary">Buscar</button>
        </form>
        <Ready data={data} error={error}>
          <ProfessionalsTable items={data?.items ?? []} />
          <div className="admin-actions mt-5">
            <button
              className="admin-button secondary"
              disabled={offset === 0}
              onClick={() => setOffset((v) => Math.max(0, v - 50))}
            >
              Anterior
            </button>
            <span className="admin-note">{data?.total ?? 0} cuentas</span>
            <button
              className="admin-button secondary"
              disabled={offset + 50 >= (data?.total ?? 0)}
              onClick={() => setOffset((v) => v + 50)}
            >
              Siguiente
            </button>
          </div>
        </Ready>
      </section>
    </>
  );
}
export function PlansPage() {
  const { data, error } = useAdminData<Catalog>("catalog");
  return (
    <>
      <Heading
        eyebrow="Configuración comercial"
        title="Planes"
        text="Los cambios en un plan se reflejan en sus cuentas. Las excepciones individuales conservan su prioridad."
      >
        <Link to="/admin/plans/new" className="admin-button">
          <Plus size={16} />
          Crear plan
        </Link>
      </Heading>
      <Ready data={data} error={error}>
        <div className="admin-grid">
          {data?.plans.map((p) => (
            <section className="admin-card" key={p.id}>
              <div className="flex justify-between mb-4">
                <span className="admin-eyebrow">
                  {p.internal_only !== false
                    ? "PLAN INTERNO"
                    : "PLAN COMERCIAL"}
                </span>
                <span className="admin-badge">
                  {p.active ? "Disponible" : "Inactivo"}
                </span>
              </div>
              <h2 className="admin-plan-name">{p.name}</h2>
              <p className="admin-note min-h-12">{p.description}</p>
              <p className="mt-5 text-xl">
                {p.monthly_price === null
                  ? "Precio por definir"
                  : `${p.monthly_price.toLocaleString("es-MX")} ${p.currency} / mes`}
              </p>
              <p className="admin-note mt-2">
                {p.annual_price === null
                  ? "Anual por definir"
                  : `${p.annual_price.toLocaleString("es-MX")} ${p.currency} / año`}
              </p>
              <p className="admin-note mt-2">
                {valueLabel(p.values["patients.limit"])} pacientes activos
              </p>
              <p className="admin-note mt-2">
                {valueLabel(p.values["ai.monthly_credits"])} créditos IA por mes{" "}
                {p.credits_provisional !== false && "· provisionales"}
              </p>
              <div className="mt-6">
                <Link
                  to={`/admin/plans/${p.id}`}
                  className="admin-button secondary"
                >
                  Editar plan
                </Link>
              </div>
            </section>
          ))}
        </div>
      </Ready>
    </>
  );
}
const groups = ["Clínica", "Taller", "Paciente", "Agenda", "IA", "Límites"];
function EntitlementInputs({
  catalog,
  values,
  onChange,
}: {
  catalog: Entitlement[];
  values: Record<string, EntitlementValue>;
  onChange: (key: string, value: EntitlementValue) => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <section key={group}>
          <h3 className="admin-section-title">{group}</h3>
          {catalog
            .filter((e) => e.category === group)
            .map((e) =>
              e.value_type === "boolean" ? (
                <label className="admin-toggle" key={e.key}>
                  <input
                    type="checkbox"
                    checked={values[e.key] === true}
                    onChange={(v) => onChange(e.key, v.target.checked)}
                  />
                  {e.label}
                </label>
              ) : (
                <div className="admin-fields my-3" key={e.key}>
                  <Field label={e.label}>
                    <input
                      type="number"
                      min="0"
                      max={e.key === "ai.monthly_credits" ? 1000000 : 100000000}
                      step="1"
                      disabled={
                        values[e.key] === "unlimited" &&
                        e.key !== "ai.monthly_credits"
                      }
                      required
                      value={
                        typeof values[e.key] === "number"
                          ? String(values[e.key])
                          : ""
                      }
                      onChange={(v) => onChange(e.key, Number(v.target.value))}
                    />
                  </Field>
                  <label className="admin-toggle">
                    <input
                      type="checkbox"
                      disabled={e.key === "ai.monthly_credits"}
                      checked={values[e.key] === "unlimited"}
                      onChange={(v) =>
                        onChange(e.key, v.target.checked ? "unlimited" : 0)
                      }
                    />
                    Sin límite
                  </label>
                </div>
              ),
            )}
        </section>
      ))}
    </>
  );
}
function PlanEditor({
  initial,
  catalog,
  onSaved,
}: {
  initial: Plan;
  catalog: Entitlement[];
  onSaved: () => void;
}) {
  const [plan, setPlan] = useState(initial);
  const set = (key: string, value: unknown) =>
    setPlan((p) => ({ ...p, [key]: value }));
  return (
    <ActionForm action="save_plan" values={{ ...plan }} onSaved={onSaved}>
      <h2>Definición del plan</h2>
      <div className="admin-fields">
        <Field label="Nombre">
          <input
            required
            maxLength={100}
            value={plan.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="Referencia comercial">
          <input
            required
            pattern="[a-z][a-z0-9_]{2,59}"
            value={plan.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="profesional"
          />
        </Field>
        <Field label="Descripción" wide>
          <textarea
            maxLength={1000}
            value={plan.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <Field label="Precio mensual">
          <input
            type="number"
            min="0"
            step="0.01"
            value={plan.monthly_price ?? ""}
            onChange={(e) =>
              set(
                "monthly_price",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        </Field>
        <Field label="Precio anual">
          <input
            type="number"
            min="0"
            step="0.01"
            value={plan.annual_price ?? ""}
            onChange={(e) =>
              set(
                "annual_price",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        </Field>
        <Field label="Moneda">
          <input
            required
            pattern="[A-Z]{3}"
            maxLength={3}
            value={plan.currency}
            onChange={(e) => set("currency", e.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Orden en el catálogo">
          <input
            type="number"
            value={plan.display_order}
            onChange={(e) => set("display_order", Number(e.target.value))}
          />
        </Field>
      </div>
      <label className="admin-toggle mt-3">
        <input
          type="checkbox"
          checked={plan.active}
          onChange={(e) => set("active", e.target.checked)}
        />
        Disponible para nuevas asignaciones
      </label>
      <label className="admin-toggle">
        <input
          type="checkbox"
          checked={plan.internal_only !== false}
          onChange={(e) => set("internal_only", e.target.checked)}
        />
        Solo administración (ocultar del catálogo público)
      </label>
      <label className="admin-toggle">
        <input
          type="checkbox"
          checked={plan.credits_provisional !== false}
          onChange={(e) => set("credits_provisional", e.target.checked)}
        />
        Créditos mensuales provisionales
      </label>
      <p className="admin-note">
        Los precios son informativos. Desactivar un plan conserva los accesos ya
        asignados.
      </p>
      <EntitlementInputs
        catalog={catalog}
        values={plan.values}
        onChange={(key, value) =>
          setPlan((p) => ({ ...p, values: { ...p.values, [key]: value } }))
        }
      />
      <p className="admin-note mt-5">
        La asignación mensual reemplaza los créditos incluidos del período
        anterior y conserva las recargas y cortesías. En anual se asigna cada
        mes. La renovación automática se conectará con pagos; hoy se ejecuta
        desde la ficha administrativa.
      </p>
    </ActionForm>
  );
}
export function PlanEditorPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const { data, error, reload } = useAdminData<Catalog>("catalog");
  const initial =
    planId === "new"
      ? ({
          code: "",
          name: "",
          description: "",
          active: true,
          internal_only: true,
          credits_provisional: true,
          display_order: 30,
          monthly_price: null,
          annual_price: null,
          currency: "MXN",
          values: Object.fromEntries(
            (data?.entitlements ?? []).map((e) => [
              e.key,
              e.value_type === "boolean" ? false : 0,
            ]),
          ),
        } satisfies Plan)
      : data?.plans.find((p) => p.id === planId);
  return (
    <>
      <Heading
        eyebrow="Planes"
        title={planId === "new" ? "Crear plan" : "Editar plan"}
      >
        <Link className="admin-link" to="/admin/plans">
          Volver a planes
        </Link>
      </Heading>
      <Ready data={data} error={error}>
        {initial ? (
          <PlanEditor
            key={initial.updated_at ?? planId}
            initial={initial}
            catalog={data?.entitlements ?? []}
            onSaved={() => {
              if (planId === "new") navigate("/admin/plans");
              else reload();
            }}
          />
        ) : (
          <p>Plan no encontrado.</p>
        )}
      </Ready>
    </>
  );
}
export function UsageTable({ rows }: { rows: Usage[] }) {
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Función</th>
          <th>Ejecuciones</th>
          <th>Créditos usados</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.feature}>
            <td>{featureLabels[r.feature] ?? "Otras funciones"}</td>
            <td>{r.executions}</td>
            <td>{r.credits}</td>
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={3}>Sin consumo en los últimos 30 días.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
export function CreditsPage() {
  const { data, error } = useAdminData<{
    accounts: Professional[];
    usage: Usage[];
  }>("ai_summary");
  return (
    <>
      <Heading
        eyebrow="Uso de la plataforma"
        title="IA y créditos"
        text="Consulta los saldos y abre una cuenta para agregar o retirar créditos con un motivo administrativo."
      />
      <nav className="billing-controls mb-6" aria-label="Administrar créditos"><Link className="admin-button" to="/admin/credits/packages">Paquetes de créditos</Link><Link className="admin-button secondary" to="/admin/credits/purchases">Compras de créditos</Link></nav>
      <Ready data={data} error={error}>
        <section className="admin-card">
          <h2>Consumo de los últimos 30 días</h2>
          <UsageTable rows={data?.usage ?? []} />
        </section>
        <section className="admin-card">
          <h2>Saldos por profesional</h2>
          <ProfessionalsTable items={data?.accounts ?? []} />
        </section>
      </Ready>
    </>
  );
}
export { AuditList, LoadError, Ready, EntitlementInputs };
export type { AccessCode, ProfessionalDetail };
