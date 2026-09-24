import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ActionForm,
  AuditList,
  Badge,
  Field,
  Heading,
  Ready,
  UsageTable,
  useAdminData,
} from "./AdminPages";
import {
  dateLabel,
  arrangementLabels,
  adminRequest,
  valueLabel,
  type Catalog,
  type EntitlementValue,
  type ProfessionalDetail,
} from "./api";
const localDate = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
export const nowInput = () => localDate(new Date());
export const daysInput = (days: number) =>
  localDate(new Date(Date.now() + days * 86400000));
export const instant = (value: string) =>
  value ? new Date(value).toISOString() : null;
export function PlanSelect({
  catalog,
  value,
  onChange,
}: {
  catalog: Catalog;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Plan">
      <select required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Seleccionar plan</option>
        {catalog.plans
          .filter((p) => p.active)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
    </Field>
  );
}
function AccessForm({
  professional,
  catalog,
  onSaved,
  courtesy,
  founder = false,
}: {
  professional: ProfessionalDetail;
  catalog: Catalog;
  onSaved: () => void;
  courtesy: boolean;
  founder?: boolean;
}) {
  const [plan, setPlan] = useState(professional.access.plan_id ?? ""),
    [start, setStart] = useState(nowInput),
    [end, setEnd] = useState(
      courtesy
        ? daysInput(90)
        : professional.access.ends_at
          ? localDate(new Date(professional.access.ends_at))
          : "",
    ),
    [reason, setReason] = useState(""),
    [status, setStatus] = useState("active"),
    [interval, setInterval] = useState(
      professional.base_access?.billing_interval ?? "manual",
    ),
    [oneTimePrice, setOneTimePrice] = useState("");
  return (
    <ActionForm
      action={
        founder ? "grant_founder" : courtesy ? "grant_access" : "set_access"
      }
      values={{
        professional_id: professional.id,
        plan_id: plan,
        starts_at: instant(start),
        ends_at: founder ? null : instant(end),
        billing_interval: interval,
        one_time_price: oneTimePrice === "" ? null : Number(oneTimePrice),
        status,
        reason,
      }}
      onSaved={onSaved}
      button={
        founder
          ? "Otorgar acceso permanente"
          : courtesy
            ? "Otorgar cortesía"
            : "Aplicar plan"
      }
    >
      <h2>
        {founder
          ? "Acceso Founder"
          : courtesy
            ? "Dar cortesía"
            : "Cambiar plan o vigencia"}
      </h2>
      <div className="admin-fields">
        <PlanSelect catalog={catalog} value={plan} onChange={setPlan} />
        {!courtesy && !founder && (
          <Field label="Modalidad">
            <select
              value={interval}
              onChange={(e) => {
                const value = e.target.value as typeof interval;
                setInterval(value);
                if (value !== "manual") {
                  const d = new Date(start);
                  const day = d.getDate();
                  d.setDate(1);
                  d.setMonth(d.getMonth() + (value === "annual" ? 12 : 1));
                  d.setDate(
                    Math.min(
                      day,
                      new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
                    ),
                  );
                  setEnd(localDate(d));
                }
              }}
            >
              <option value="manual">Administrativo / sin ciclo</option>
              <option value="monthly">Mensual</option>
              <option value="annual">Anual</option>
            </select>
          </Field>
        )}
        {founder && (
          <Field label="Precio único acordado (opcional)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={oneTimePrice}
              onChange={(e) => setOneTimePrice(e.target.value)}
            />
          </Field>
        )}
        {!courtesy && !founder && (
          <Field label="Estado">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Activo</option>
              <option value="trial">En prueba</option>
              <option value="grace">Período de gracia</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </Field>
        )}
        <Field label="Desde">
          <input
            type="datetime-local"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        {!founder && (
          <Field
            label={
              courtesy || interval !== "manual"
                ? "Hasta"
                : "Hasta (vacío = indefinido)"
            }
          >
            <input
              type="datetime-local"
              required={courtesy || interval !== "manual"}
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        )}
        <Field
          label={
            courtesy
              ? "Motivo administrativo (opcional)"
              : "Motivo administrativo"
          }
          wide
        >
          <input
            required={!courtesy}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
      <p className="admin-note mt-4">
        {founder
          ? "Founder otorga acceso SaaS permanente al plan seleccionado. Incluye cero créditos IA mensuales; las cortesías se agregan por separado. El precio es informativo y no realiza cobros."
          : courtesy
            ? "La cortesía usa los permisos del plan durante estas fechas. Al vencer, se vuelve al acceso base si sigue vigente."
            : "El cambio se aplica inmediatamente y retira las cortesías de plan anteriores. Las excepciones de permisos se conservan."}{" "}
        Asignar un plan no modifica el saldo de IA. Horas en tu zona local.
      </p>
    </ActionForm>
  );
}
function CreditForm({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [kind, setKind] = useState("add"),
    [amount, setAmount] = useState("300"),
    [reason, setReason] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <ActionForm
      action="adjust_credits"
      values={{
        professional_id: id,
        amount: (kind === "add" ? 1 : -1) * Number(amount),
        reason,
        operation_key: key,
      }}
      onSaved={() => {
        setKey(crypto.randomUUID());
        onSaved();
      }}
      button={kind === "add" ? "Agregar créditos" : "Retirar créditos"}
    >
      <h2>Ajustar créditos IA</h2>
      <div className="admin-fields">
        <Field label="Movimiento">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setKey(crypto.randomUUID());
            }}
          >
            <option value="add">Agregar cortesía</option>
            <option value="remove">Retirar créditos</option>
          </select>
        </Field>
        <Field label="Créditos">
          <input
            required
            type="number"
            min="0.001"
            max="1000000"
            step="0.001"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setKey(crypto.randomUUID());
            }}
          />
        </Field>
        <Field label="Motivo administrativo" wide>
          <input
            required
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Cortesía para piloto de Nuthrick"
          />
        </Field>
      </div>
      <p className="admin-note mt-4">
        Cada ajuste queda registrado. El retiro utiliza primero los créditos de
        recarga y cortesía y respeta las reservas en curso.
      </p>
    </ActionForm>
  );
}
function AllocationForm({
  professional,
  onSaved,
}: {
  professional: ProfessionalDetail;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const eligible =
    ["monthly", "annual"].includes(professional.access.arrangement ?? "") &&
    !professional.access.read_only;
  async function allocate() {
    setBusy(true);
    setMessage("");
    try {
      const result = await adminRequest<{
        allocated?: boolean;
        saved?: boolean;
        reason?: string;
      }>("allocate_credits", {
        professional_id: professional.id,
        reason: "Asignación manual del período mensual vigente",
      });
      setMessage(
        result.saved
          ? "Asignación registrada en el ledger."
          : ((
              {
                already_allocated: "Este mes ya fue asignado.",
                current_period_preserved:
                  "Se conserva la asignación vigente hasta su vencimiento.",
                no_included_credits:
                  "Este acceso no incluye créditos mensuales.",
                grant_active:
                  "La cortesía vigente no tiene renovación mensual automática.",
              } as Record<string, string>
            )[result.reason ?? ""] ??
              "Esta modalidad no tiene asignación mensual."),
      );
      onSaved();
      window.dispatchEvent(new Event("nuthrick:ai-balance"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo asignar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-card">
      <h2>Asignación mensual del plan</h2>
      <p className="admin-note my-4">
        Reemplaza los incluidos vencidos; conserva las recargas y cortesías. Los
        reintentos no duplican créditos. No hay un job automático ni llamadas de
        IA.
      </p>
      <button
        className="admin-button secondary"
        disabled={busy || !eligible}
        onClick={() => void allocate()}
      >
        {busy ? "Verificando período…" : "Asignar período vigente"}
      </button>
      {message && (
        <p role="status" className="mt-4">
          {message}
        </p>
      )}
    </section>
  );
}
function OverrideForm({
  id,
  catalog,
  onSaved,
}: {
  id: string;
  catalog: Catalog;
  onSaved: () => void;
}) {
  const [key, setKey] = useState(catalog.entitlements[0]?.key ?? ""),
    [value, setValue] = useState<EntitlementValue>(true),
    [start, setStart] = useState(nowInput),
    [end, setEnd] = useState(""),
    [reason, setReason] = useState("");
  const entitlement = catalog.entitlements.find((e) => e.key === key);
  return (
    <ActionForm
      action="set_override"
      values={{
        professional_id: id,
        entitlement_key: key,
        value,
        starts_at: instant(start),
        ends_at: instant(end),
        reason,
      }}
      onSaved={onSaved}
      button="Crear excepción"
    >
      <h2>Excepción individual</h2>
      <div className="admin-fields">
        <Field label="Funcionalidad o límite">
          <select
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setValue(
                catalog.entitlements.find((x) => x.key === e.target.value)
                  ?.value_type === "boolean"
                  ? true
                  : 0,
              );
            }}
          >
            {["Clínica", "Taller", "Paciente", "Agenda", "IA", "Límites"].map(
              (group) => (
                <optgroup key={group} label={group}>
                  {catalog.entitlements
                    .filter((e) => e.category === group)
                    .map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.label}
                      </option>
                    ))}
                </optgroup>
              ),
            )}
          </select>
        </Field>
        {entitlement?.value_type === "boolean" ? (
          <Field label="Permiso">
            <select
              value={String(value)}
              onChange={(e) => setValue(e.target.value === "true")}
            >
              <option value="true">Habilitar</option>
              <option value="false">Deshabilitar</option>
            </select>
          </Field>
        ) : (
          <Field label="Límite">
            <div className="admin-inline">
              <input
                aria-label="Cantidad del límite"
                type="number"
                min="0"
                max="100000000"
                step="1"
                required
                disabled={value === "unlimited"}
                value={typeof value === "number" ? value : ""}
                onChange={(e) => setValue(Number(e.target.value))}
              />
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  disabled={key === "ai.monthly_credits"}
                  checked={value === "unlimited"}
                  onChange={(e) => setValue(e.target.checked ? "unlimited" : 0)}
                />
                Sin límite
              </label>
            </div>
          </Field>
        )}
        <Field label="Desde">
          <input
            required
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Hasta (vacío = indefinido)">
          <input
            type="datetime-local"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
        <Field label="Motivo administrativo" wide>
          <input
            required
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
      <p className="admin-note mt-4">
        La excepción tiene prioridad sobre el plan durante su vigencia. No
        reactiva cuentas suspendidas o vencidas.
      </p>
    </ActionForm>
  );
}
function StateForm({
  professional,
  onSaved,
}: {
  professional: ProfessionalDetail;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  const suspended = ["suspended", "cancelled"].includes(
    professional.access.status,
  );
  return (
    <ActionForm
      action={suspended ? "reactivate" : "suspend"}
      values={{ professional_id: professional.id, reason }}
      onSaved={onSaved}
      button={suspended ? "Reactivar cuenta" : "Suspender cuenta"}
    >
      <h2>{suspended ? "Reactivar" : "Suspender"} cuenta</h2>
      <p className="admin-note mb-4">
        {suspended
          ? "Se conserva el plan y su vencimiento. Si ya venció, asigna una nueva vigencia."
          : "La cuenta podrá consultar expedientes e históricos. No podrá crear, modificar, publicar, enviar mensajes ni generar con IA. Los registros se conservarán."}
      </p>
      <Field label="Motivo administrativo">
        <input
          required
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </ActionForm>
  );
}
function RevokeForm({
  owner,
  id,
  action,
  label,
  onSaved,
}: {
  owner: string;
  id: string;
  action: string;
  label: string;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ActionForm
      className="mt-3"
      action={action}
      values={{ professional_id: owner, id, reason }}
      button={label}
      onSaved={onSaved}
    >
      <Field label="Motivo para retirar">
        <input
          required
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </ActionForm>
  );
}
export function ProfessionalPage() {
  const { professionalId } = useParams();
  const detail = useAdminData<ProfessionalDetail>("professional", {
      professional_id: professionalId,
    }),
    catalog = useAdminData<Catalog>("catalog");
  const [tab, setTab] = useState("summary");
  const p = detail.data,
    c = catalog.data;
  return (
    <>
      <Heading
        eyebrow="Profesionales"
        title={p?.name || "Ficha administrativa"}
        text={p?.email}
      >
        <Link className="admin-link" to="/admin/professionals">
          Volver al listado
        </Link>
      </Heading>
      <Ready data={p && c} error={detail.error || catalog.error}>
        {p && c && (
          <>
            <div className="admin-actions mb-6">
              {[
                ["summary", "Resumen"],
                ["plan", "Cambiar plan"],
                ["courtesy", "Dar cortesía"],
                ["founder", "Acceso Founder"],
                ["credits", "Ajustar créditos"],
                ["override", "Excepciones"],
                ["state", "Estado de cuenta"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`admin-button ${tab === key ? "" : "secondary"}`}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "plan" && (
              <AccessForm
                key={`plan-${p.id}`}
                professional={p}
                catalog={c}
                onSaved={detail.reload}
                courtesy={false}
              />
            )}
            {tab === "courtesy" && (
              <AccessForm
                key={`courtesy-${p.id}`}
                professional={p}
                catalog={c}
                onSaved={detail.reload}
                courtesy
              />
            )}
            {tab === "founder" && (
              <AccessForm
                key={`founder-${p.id}`}
                professional={p}
                catalog={c}
                onSaved={detail.reload}
                courtesy={false}
                founder
              />
            )}
            {tab === "credits" && (
              <>
                <CreditForm id={p.id} onSaved={detail.reload} />
                <AllocationForm professional={p} onSaved={detail.reload} />
              </>
            )}
            {tab === "override" && (
              <OverrideForm id={p.id} catalog={c} onSaved={detail.reload} />
            )}
            {tab === "state" && (
              <StateForm professional={p} onSaved={detail.reload} />
            )}
            <div className="admin-grid">
              <section className="admin-card">
                <h2>Acceso actual</h2>
                <Badge status={p.access.status} />
                <p className="mt-4 text-2xl">
                  {p.access.plan_name ?? "Sin plan"}
                </p>
                <dl className="mt-5 space-y-3 text-sm">
                  <div>
                    Inicio:{" "}
                    {p.access.starts_at
                      ? dateLabel(p.access.starts_at)
                      : "Sin asignar"}
                  </div>
                  <div>Vencimiento: {dateLabel(p.access.ends_at)}</div>
                  <div>
                    Modalidad:{" "}
                    {arrangementLabels[p.access.arrangement ?? "manual"]}
                  </div>
                  {p.access.patient_usage && (
                    <div>
                      Pacientes activos: {p.access.patient_usage.active} /{" "}
                      {valueLabel(p.access.patient_usage.limit)}{" "}
                      {p.access.patient_usage.over_limit && (
                        <strong>
                          {" "}
                          · Sobre el límite; se conserva el historial
                        </strong>
                      )}
                    </div>
                  )}
                  {p.access.read_only && <div>Acceso en modo de consulta</div>}
                  {p.onboarding_completed === false && (
                    <div>Registro profesional incompleto</div>
                  )}
                  <div>Registro: {dateLabel(p.created_at)}</div>
                  <div>
                    Último inicio de sesión:{" "}
                    {p.last_activity
                      ? dateLabel(p.last_activity)
                      : "Sin actividad"}
                  </div>
                  <div>
                    Plan base:{" "}
                    {c.plans.find((x) => x.id === p.base_access?.plan_id)
                      ?.name ?? "Sin asignar"}
                  </div>
                </dl>
              </section>
              <section className="admin-card">
                <h2>Créditos IA</h2>
                <div className="admin-metric">
                  <p>Saldo disponible</p>
                  <strong>{p.ai.available.toLocaleString("es-MX")}</strong>
                </div>
                <div className="admin-fields mt-5">
                  <p className="admin-note">
                    Incluidos vigentes
                    <br />
                    <strong>{p.ai.included}</strong>
                  </p>
                  <p className="admin-note">
                    Recargas y cortesías
                    <br />
                    <strong>{p.ai.purchased}</strong>
                  </p>
                  <p className="admin-note">
                    Consumo total
                    <br />
                    <strong>{p.ai.consumed}</strong>
                  </p>
                  <p className="admin-note">
                    Configurados por mes
                    <br />
                    <strong>
                      {valueLabel(p.access.values["ai.monthly_credits"])}
                    </strong>
                  </p>
                </div>
              </section>
              <section className="admin-card">
                <h2>Permisos efectivos</h2>
                {[
                  "Clínica",
                  "Taller",
                  "Paciente",
                  "Agenda",
                  "IA",
                  "Límites",
                ].map((group) => (
                  <div key={group}>
                    <h3 className="admin-section-title">{group}</h3>
                    {c.entitlements
                      .filter((e) => e.category === group)
                      .map((e) => (
                        <div className="admin-entitlement" key={e.key}>
                          <span>
                            {e.label}
                            <small>
                              {
                                {
                                  override: "Excepción individual",
                                  courtesy: "Cortesía",
                                  plan: "Plan",
                                  access_state: "Estado de acceso",
                                }[p.access.sources[e.key]]
                              }
                            </small>
                          </span>
                          <strong>{valueLabel(p.access.values[e.key])}</strong>
                        </div>
                      ))}
                  </div>
                ))}
              </section>
              <div>
                <section className="admin-card">
                  <h2>Consumo reciente</h2>
                  <UsageTable rows={p.ai.usage} />
                </section>
                <section className="admin-card">
                  <h2>Historial administrativo</h2>
                  <AuditList rows={p.audit} />
                </section>
              </div>
            </div>
            {(tab === "courtesy" || p.grants.length > 0) && (
              <section className="admin-card">
                <h2>Cortesías</h2>
                {p.grants.map((g) => (
                  <div key={g.id} className="admin-card">
                    <strong>
                      {c.plans.find((p) => p.id === g.plan_id)?.name}
                    </strong>
                    <p className="admin-note">
                      {g.grant_kind === "founder" && "Founder · "}
                      {dateLabel(g.starts_at)} — {dateLabel(g.ends_at)}
                    </p>
                    <RevokeForm
                      owner={p.id}
                      id={g.id}
                      action="revoke_grant"
                      label={
                        g.grant_kind === "founder"
                          ? "Retirar acceso Founder"
                          : "Retirar cortesía"
                      }
                      onSaved={detail.reload}
                    />
                  </div>
                ))}
                {!p.grants.length && (
                  <p className="admin-note">Sin cortesías registradas.</p>
                )}
              </section>
            )}
            {(tab === "override" || p.overrides.length > 0) && (
              <section className="admin-card">
                <h2>Excepciones registradas</h2>
                {p.overrides.map((o) => (
                  <div key={o.id} className="admin-card">
                    <strong>
                      {
                        c.entitlements.find((e) => e.key === o.entitlement_key)
                          ?.label
                      }
                      : {valueLabel(o.value)}
                    </strong>
                    <p className="admin-note">
                      {dateLabel(o.starts_at)} — {dateLabel(o.ends_at)}
                    </p>
                    <RevokeForm
                      owner={p.id}
                      id={o.id}
                      action="revoke_override"
                      label="Retirar excepción"
                      onSaved={detail.reload}
                    />
                  </div>
                ))}
                {!p.overrides.length && (
                  <p className="admin-note">Sin excepciones registradas.</p>
                )}
              </section>
            )}
            {tab === "credits" && (
              <section className="admin-card">
                <h2>Movimientos de créditos</h2>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Movimiento</th>
                        <th>Incluidos</th>
                        <th>Recargas / cortesías</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.ai.ledger.map((l, i) => (
                        <tr key={i}>
                          <td>{dateLabel(l.created_at)}</td>
                          <td>
                            {{
                              ADMIN_ADJUSTMENT: "Ajuste administrativo",
                              PLAN_ALLOCATION: "Asignación de plan",
                              PURCHASE: "Recarga",
                              USAGE: "Consumo",
                              REFUND: "Devolución",
                              RESERVE: "Reserva",
                              RELEASE: "Liberación",
                            }[l.type] ?? "Movimiento"}
                          </td>
                          <td>{l.included_delta}</td>
                          <td>{l.purchased_delta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </Ready>
    </>
  );
}
