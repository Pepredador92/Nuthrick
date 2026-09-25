import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  adminRequest as adminApi,
  type Catalog,
  type Plan,
} from "../admin/api";
import {
  type Benefit,
  benefitLabel,
  billingAction,
  billingAdmin,
  type Campaign,
  dateLabel,
  durationLabel,
  hostedUrl,
  type Interval,
  money,
  type Payment,
  stateLabel,
  type Subscription,
} from "./api";
import type { CreditPackage } from "./credits-api";
import "./billing.css";
const audiences: Record<string, string> = {
  student: "Estudiantes",
  university: "Universidad",
  clinic: "Consultorio",
  influencer: "Influencer",
  partner: "Convenio",
  campaign: "Campaña",
  custom: "Personalizada",
};
const benefitNames: Record<Benefit["type"], string> = {
  percentage_discount: "Descuento porcentual",
  fixed_discount: "Descuento en MXN",
  custom_price: "Precio promocional",
  free_period: "Período gratis",
  initial_ai_credits: "Créditos IA iniciales",
  bonus_ai_credits: "Créditos bonus por recarga",
  temporary_entitlement: "Permiso temporal",
  plan_upgrade: "Mejora temporal de plan",
};
function Heading(
  { title, description, children }: {
    title: string;
    description: string;
    children?: React.ReactNode;
  },
) {
  return (
    <header className="admin-heading">
      <div>
        <p className="admin-eyebrow">BILLING</p>
        <h1>{title}</h1>
        <p className="admin-description">{description}</p>
      </div>
      {children}
    </header>
  );
}
function ErrorMessage({ error }: { error: string }) {
  return error ? <p role="alert" className="admin-error">{error}</p> : null;
}
export function PromotionsPage() {
  const [now] = useState(() => Date.now());
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void billingAdmin<Campaign[]>("campaigns").then(setRows).catch((e) =>
      setError(e.message)
    );
  }, []);
  return (
    <>
      <Heading
        title="Promociones"
        description="Códigos, beneficios y atribución por universidad, consultorio o campaña."
      >
        <Link className="admin-button" to="/admin/promotions/new">
          Nueva promoción
        </Link>
      </Heading>
      <ErrorMessage error={error} />
      {!rows && !error
        ? <p>Cargando promociones…</p>
        : (
          <section className="admin-card">
            {!rows?.length
              ? (
                <p className="admin-note">
                  Aún no hay promociones. Crea un código y define sus
                  beneficios.
                </p>
              )
              : (
                <div className="billing-table-wrap">
                  <table className="billing-table">
                    <thead>
                      <tr>
                        <th>Código / Nombre</th>
                        <th>Audiencia</th>
                        <th>Plan / Paquete</th>
                        <th>Beneficio</th>
                        <th>Vigencia</th>
                        <th>Usos</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <Link
                              className="admin-link"
                              to={`/admin/promotions/${c.id}`}
                            >
                              {c.code}
                            </Link>
                            <br />
                            {c.name}
                          </td>
                          <td>{audiences[c.audience]}</td>
                          <td>{c.plan_names?.join(", ") ?? "Ver detalle"}</td>
                          <td>
                            {c.benefits.map((b, i) => (
                              <div key={i}>
                                {benefitLabel(b)} · {durationLabel(b)}
                              </div>
                            ))}
                          </td>
                          <td>
                            {dateLabel(c.starts_at)} → {dateLabel(c.ends_at)}
                          </td>
                          <td>
                            {c.redeemed} / {c.max_redemptions ?? "Sin límite"}
                            <br />
                            <small>{c.reserved} reservados</small>
                          </td>
                          <td>
                            {!c.active
                              ? "Desactivada"
                              : c.ends_at && Date.parse(c.ends_at) < now
                              ? "Vencida"
                              : Date.parse(c.starts_at) > now
                              ? "Programada"
                              : "Activa"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
        )}
    </>
  );
}
const initial = (): Campaign => ({
  id: crypto.randomUUID(),
  version: 1,
  code: "",
  name: "",
  audience: "university",
  audience_note: "",
  visibility: "private",
  active: true,
  starts_at: new Date().toISOString(),
  ends_at: null,
  target: "subscription",
  eligible_package_ids: [],
  eligible_plan_ids: [],
  intervals: ["monthly"],
  benefits: [{
    type: "custom_price",
    amount: 249,
    duration: { kind: "months", months: 12 },
  }],
  max_redemptions: 100,
  max_per_professional: 1,
  new_customers_only: false,
  fallback: "normal_plan",
  redeemed: 0,
  reserved: 0,
});
function localDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
    .slice(0, 16);
}
function isoDate(value: string) {
  return value ? new Date(value).toISOString() : null;
}
export function PromotionEditorPage() {
  const { campaignId } = useParams();
  const isNew = !campaignId;
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign>(initial);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    void Promise.all([
      adminApi<Catalog>("catalog"),
      isNew
        ? Promise.resolve(null)
        : billingAdmin<Campaign>("campaign", { id: campaignId }),
    ]).then(([cat, row]) => {
      if (!mounted) return;
      setCatalog(cat);
      if (row) setCampaign(row);
      setLoading(false);
    }).catch((e) => {
      if (mounted) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [campaignId, isNew]);
  useEffect(() => {
    void billingAdmin<{ credit_packages?: CreditPackage[] }>("overview").then(
      (d) => setPackages(d?.credit_packages ?? []),
    ).catch(() => {});
  }, []);
  const isCredit = campaign.target === "ai_credit_package";
  const update = (v: Partial<Campaign>) => setCampaign((c) => ({ ...c, ...v }));
  const benefit = (index: number, v: Partial<Benefit>) =>
    setCampaign((c) => ({
      ...c,
      benefits: c.benefits.map((b, i) => i === index ? { ...b, ...v } : b),
    }));
  const plans = catalog?.plans.filter((p) => p.active && !p.internal_only) ??
    [];
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await billingAdmin<Campaign>("save_campaign", campaign);
      navigate(`/admin/promotions/${saved.id}`, { replace: true });
      setCampaign({
        ...saved,
        redemptions: campaign.redemptions,
        mappings: campaign.mappings,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    setError("");
    try {
      await billingAdmin("disable_campaign", { id: campaign.id });
      setCampaign(
        await billingAdmin<Campaign>("campaign", { id: campaign.id }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link className="admin-link" to="/admin/promotions">← Promociones</Link>
      <Heading
        title={isNew ? "Nueva promoción" : campaign.code || "Promoción"}
        description="Combina un beneficio de precio con créditos o acceso temporal. Los beneficios concedidos conservan su duración original."
      />
      <ErrorMessage error={error} />
      {loading ? <p>Cargando…</p> : (
        <>
          <form className="admin-card" onSubmit={save}>
            <label className="admin-field mb-5">
              Aplica a<select
                disabled={!isNew}
                value={campaign.target ?? "subscription"}
                onChange={(e) =>
                  update({
                    target: e.target.value as Campaign["target"],
                    eligible_plan_ids: [],
                    eligible_package_ids: [],
                    benefits: [{
                      type: "percentage_discount",
                      amount: 20,
                      duration: { kind: "invoice" },
                    }],
                  })}
              >
                <option value="subscription">Suscripciones</option>
                <option value="ai_credit_package">
                  Paquetes de créditos IA
                </option>
              </select>
            </label>
            <div className="billing-form-grid">
              <label className="admin-field">
                Nombre<input
                  required
                  maxLength={120}
                  value={campaign.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label className="admin-field">
                Código<input
                  required
                  pattern="[A-Z0-9_-]{3,40}"
                  minLength={3}
                  maxLength={40}
                  disabled={!isNew}
                  value={campaign.code}
                  onChange={(e) =>
                    update({
                      code: e.target.value.toUpperCase().replace(/\s/g, ""),
                    })}
                />
              </label>
              <label className="admin-field">
                Audiencia<select
                  value={campaign.audience}
                  onChange={(e) => update({ audience: e.target.value })}
                >
                  {Object.entries(audiences).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend className="admin-note">
                  {isCredit ? "Paquetes elegibles" : "Planes elegibles"}
                </legend>
                {(isCredit ? packages : plans).map((p) => (
                  <label className="billing-check" key={p.id}>
                    <input
                      type="checkbox"
                      checked={(isCredit
                        ? campaign.eligible_package_ids ?? []
                        : campaign.eligible_plan_ids).includes(p.id!)}
                      onChange={(e) =>
                        update({
                          [
                            isCredit
                              ? "eligible_package_ids"
                              : "eligible_plan_ids"
                          ]: e.target.checked
                            ? [
                              ...(isCredit
                                ? campaign.eligible_package_ids ?? []
                                : campaign.eligible_plan_ids),
                              p.id!,
                            ]
                            : (isCredit
                              ? campaign.eligible_package_ids ?? []
                              : campaign.eligible_plan_ids).filter((id) =>
                                id !== p.id
                              ),
                        })}
                    />
                    {p.name}
                  </label>
                ))}
              </fieldset>
            </div>
            <section className="billing-section">
              <h2>Beneficios</h2>
              {campaign.benefits.map((b, index) => (
                <div className="billing-benefit-editor" key={index}>
                  <div className="billing-form-grid">
                    <label className="admin-field">
                      Beneficio {index + 1}
                      <select
                        value={b.type}
                        onChange={(e) => {
                          const type = e.target.value as Benefit["type"];
                          benefit(index, {
                            type,
                            amount: type === "initial_ai_credits"
                              ? 20
                              : type === "percentage_discount"
                              ? 20
                              : 249,
                            duration: isCredit || type === "initial_ai_credits"
                              ? { kind: "invoice" }
                              : { kind: "months", months: 3 },
                          });
                        }}
                      >
                        {Object.entries(benefitNames).filter(([key]) =>
                          isCredit
                            ? [
                              "percentage_discount",
                              "fixed_discount",
                              "bonus_ai_credits",
                            ].includes(key)
                            : key !== "bonus_ai_credits"
                        ).map(([key, label]) => (
                          <option value={key} key={key}>{label}</option>
                        ))}
                      </select>
                    </label>
                    {[
                      "percentage_discount",
                      "fixed_discount",
                      "custom_price",
                      "initial_ai_credits",
                      "bonus_ai_credits",
                    ].includes(b.type) && (
                      <label className="admin-field">
                        {b.type === "percentage_discount"
                          ? "Porcentaje"
                          : b.type === "bonus_ai_credits"
                          ? "Créditos bonus"
                          : b.type === "initial_ai_credits"
                          ? "Créditos iniciales"
                          : "Importe en MXN"}
                        <input
                          required
                          type="number"
                          min={b.type === "custom_price"
                            ? 0
                            : b.type === "initial_ai_credits"
                            ? 1
                            : 0.01}
                          max={b.type === "percentage_discount" ? 100 : 1000000}
                          step={b.type === "bonus_ai_credits"
                            ? 0.001
                            : b.type === "initial_ai_credits"
                            ? 1
                            : 0.01}
                          value={b.amount ?? ""}
                          onChange={(e) =>
                            benefit(index, { amount: Number(e.target.value) })}
                        />
                      </label>
                    )}
                    {b.type === "plan_upgrade" && (
                      <label className="admin-field">
                        Plan durante el beneficio<select
                          required
                          value={b.plan_id ?? ""}
                          onChange={(e) =>
                            benefit(index, { plan_id: e.target.value })}
                        >
                          <option value="">Selecciona…</option>
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {b.type === "temporary_entitlement" && (
                      <>
                        <label className="admin-field">
                          Permiso<select
                            required
                            value={b.entitlement ?? ""}
                            onChange={(e) =>
                              benefit(index, {
                                entitlement: e.target.value,
                                value: catalog?.entitlements.find((x) =>
                                    x.key === e.target.value
                                  )?.value_type === "boolean"
                                  ? true
                                  : 1,
                              })}
                          >
                            <option value="">Selecciona…</option>
                            {catalog?.entitlements.map((x) => (
                              <option key={x.key} value={x.key}>
                                {x.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {catalog?.entitlements.find((x) =>
                            x.key === b.entitlement
                          )?.value_type === "boolean"
                          ? (
                            <label className="admin-field">
                              Valor<select
                                value={String(b.value)}
                                onChange={(e) =>
                                  benefit(index, {
                                    value: e.target.value === "true",
                                  })}
                              >
                                <option value="true">Habilitado</option>
                                <option value="false">Deshabilitado</option>
                              </select>
                            </label>
                          )
                          : (
                            <label className="admin-field">
                              Límite<input
                                required
                                value={String(b.value ?? "")}
                                placeholder="Cantidad o unlimited"
                                onChange={(e) =>
                                  benefit(index, {
                                    value: e.target.value === "unlimited"
                                      ? "unlimited"
                                      : Number(e.target.value),
                                  })}
                              />
                            </label>
                          )}
                      </>
                    )}
                    {!isCredit && b.type !== "initial_ai_credits" && (
                      <>
                        <label className="admin-field">
                          Duración<select
                            value={b.duration.kind}
                            onChange={(e) =>
                              benefit(index, {
                                duration: {
                                  kind: e.target
                                    .value as Benefit["duration"]["kind"],
                                  months: 3,
                                  until: new Date(Date.now() + 90 * 86400000)
                                    .toISOString(),
                                },
                              })}
                          >
                            <option value="invoice">Una factura</option>
                            <option value="months">Número de meses</option>
                            <option value="until">Hasta una fecha</option>
                            <option value="forever">Indefinida</option>
                          </select>
                        </label>
                        {b.duration.kind === "months" && (
                          <label className="admin-field">
                            Meses<input
                              required
                              type="number"
                              min={1}
                              max={120}
                              value={b.duration.months ?? ""}
                              onChange={(e) =>
                                benefit(index, {
                                  duration: {
                                    kind: "months",
                                    months: Number(e.target.value),
                                  },
                                })}
                            />
                          </label>
                        )}
                        {b.duration.kind === "until" && (
                          <label className="admin-field">
                            Termina el<input
                              required
                              type="datetime-local"
                              value={localDate(b.duration.until)}
                              onChange={(e) =>
                                benefit(index, {
                                  duration: {
                                    kind: "until",
                                    until: isoDate(e.target.value) ?? undefined,
                                  },
                                })}
                            />
                          </label>
                        )}
                      </>
                    )}
                  </div>
                  {b.type === "initial_ai_credits" && (
                    <p className="admin-note mt-3">
                      Se asignan una sola vez al confirmar la contratación y se
                      conservan como créditos adicionales.
                    </p>
                  )}
                  {campaign.benefits.length > 1 && (
                    <button
                      type="button"
                      className="admin-link mt-3"
                      onClick={() =>
                        update({
                          benefits: campaign.benefits.filter((_, i) =>
                            i !== index
                          ),
                        })}
                    >
                      Quitar beneficio
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="admin-button secondary"
                disabled={campaign.benefits.length >= (isCredit ? 2 : 8)}
                onClick={() =>
                  update({
                    benefits: [...campaign.benefits, {
                      type: isCredit
                        ? "bonus_ai_credits"
                        : "initial_ai_credits",
                      amount: 20,
                      duration: { kind: "invoice" },
                    }],
                  })}
              >
                Añadir beneficio
              </button>
              {isCredit
                ? (
                  <p className="admin-note mt-4">
                    El descuento y los créditos bonus se aplican una vez por
                    compra confirmada, sujetos a los límites del código.
                  </p>
                )
                : (
                  <p className="admin-note mt-4">
                    Después del beneficio de precio se cobra el precio normal
                    contratado. Los descuentos por meses en modalidad anual se
                    aplican a las facturas emitidas dentro de esa ventana.{" "}
                    Los períodos gratis por meses o hasta una fecha requieren
                    modalidad mensual. En anual puedes regalar una factura
                    completa.
                  </p>
                )}
            </section>
            <div className="billing-form-grid">
              <label className="admin-field">
                Máximo de usos totales<input
                  type="number"
                  min={1}
                  value={campaign.max_redemptions ?? ""}
                  placeholder="Sin límite"
                  onChange={(e) =>
                    update({
                      max_redemptions: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })}
                />
              </label>
              <label className="admin-field">
                Inicio de vigencia<input
                  required
                  type="datetime-local"
                  value={localDate(campaign.starts_at)}
                  onChange={(e) =>
                    update({ starts_at: isoDate(e.target.value) ?? "" })}
                />
              </label>
              <label className="admin-field">
                Fin de vigencia para nuevos canjes<input
                  type="datetime-local"
                  value={localDate(campaign.ends_at)}
                  onChange={(e) => update({ ends_at: isoDate(e.target.value) })}
                />
              </label>
            </div>
            <details className="billing-details">
              <summary>Condiciones adicionales</summary>
              <div className="billing-form-grid">
                {!isCredit && (
                  <fieldset>
                    <legend className="admin-note">
                      Modalidades elegibles
                    </legend>
                    {(["monthly", "annual"] as Interval[]).map((i) => (
                      <label className="billing-check" key={i}>
                        <input
                          type="checkbox"
                          checked={campaign.intervals.includes(i)}
                          onChange={(e) =>
                            update({
                              intervals: e.target.checked
                                ? [...campaign.intervals, i]
                                : campaign.intervals.filter((x) =>
                                  x !== i
                                ),
                            })}
                        />
                        {i === "monthly" ? "Mensual" : "Anual"}
                      </label>
                    ))}
                  </fieldset>
                )}
                <label className="admin-field">
                  Usos por profesional<input
                    required
                    type="number"
                    min={1}
                    max={100}
                    value={campaign.max_per_professional}
                    onChange={(e) =>
                      update({ max_per_professional: Number(e.target.value) })}
                  />
                </label>
                <label className="billing-check">
                  <input
                    type="checkbox"
                    checked={campaign.new_customers_only}
                    onChange={(e) =>
                      update({ new_customers_only: e.target.checked })}
                  />
                  {isCredit
                    ? "Solo clientes sin compras ni suscripciones pagadas previas"
                    : "Solo nuevas suscripciones"}
                </label>
                <label className="admin-field">
                  Visibilidad<select
                    value={campaign.visibility}
                    onChange={(e) => update({
                      visibility: e.target.value as "private" | "public",
                    })}
                  >
                    <option value="private">Privada · requiere código</option>
                    <option value="public">Pública · para campañas</option>
                  </select>
                </label>
                <label className="admin-field wide">
                  Nota de atribución<input
                    maxLength={500}
                    value={campaign.audience_note}
                    onChange={(e) => update({ audience_note: e.target.value })}
                  />
                </label>
                <label className="billing-check">
                  <input
                    type="checkbox"
                    checked={campaign.active}
                    onChange={(e) => update({ active: e.target.checked })}
                  />Promoción activa
                </label>
              </div>
            </details>
            <div className="billing-controls">
              <button
                className="admin-button"
                disabled={busy || !campaign.eligible_plan_ids.length ||
                  !campaign.intervals.length}
              >
                {busy ? "Guardando…" : "Guardar promoción"}
              </button>
              {!isNew && campaign.active && (
                <button
                  type="button"
                  className="admin-button secondary"
                  disabled={busy}
                  onClick={() => void disable()}
                >
                  Desactivar promoción
                </button>
              )}
            </div>
          </form>
          {!isNew && (
            <>
              <section className="admin-card billing-section">
                <h2>Redenciones y suscripciones de origen</h2>
                {!campaign.redemptions?.length
                  ? (
                    <p className="admin-note">
                      Todavía no hay redenciones confirmadas.
                    </p>
                  )
                  : (
                    <div className="billing-table-wrap">
                      <table className="billing-table">
                        <thead>
                          <tr>
                            <th>Profesional</th>
                            <th>Fecha</th>
                            <th>Audiencia</th>
                            <th>Suscripción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {campaign.redemptions.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <Link
                                  className="admin-link"
                                  to={`/admin/professionals/${r.professional_id}`}
                                >
                                  {r.professional_name || "Profesional"}
                                </Link>
                              </td>
                              <td>{dateLabel(r.redeemed_at)}</td>
                              <td>{audiences[r.audience]}</td>
                              <td>
                                <Link
                                  className="admin-link"
                                  to={`/admin/subscriptions?professional=${r.professional_id}`}
                                >
                                  Ver suscripción
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </section>
              <details className="admin-card billing-section">
                <summary>Vinculación con Stripe Test</summary>
                {campaign.mappings?.length
                  ? (
                    <ul className="mt-4 space-y-3">
                      {campaign.mappings.map((m, i) => (
                        <li key={i}>
                          Versión {m.version} · {m.provider_coupon_id ??
                            "Beneficio administrado en Nuthrick"}
                          <br />
                          <small>
                            Precio: {m.price_mapping_id} · Fin:{" "}
                            {dateLabel(m.end_at)}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )
                  : (
                    <p className="admin-note mt-4">
                      La vinculación se crea al usar la promoción en un checkout
                      elegible.
                    </p>
                  )}
              </details>
            </>
          )}
        </>
      )}
    </>
  );
}
export function SubscriptionsPage() {
  const [rows, setRows] = useState<Subscription[] | null>(null);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState<Subscription | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const operation = useRef(crypto.randomUUID());
  const load = useCallback(
    () =>
      billingAdmin<Subscription[]>("subscriptions").then(setRows).catch((e) =>
        setError(e.message)
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const cancel = async () => {
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      await billingAction("cancel_now", {
        professional_id: chosen.professional_id,
        confirmation,
        reason,
        operation_key: operation.current,
      });
      setChosen(null);
      setNotice(
        "Cancelación inmediata solicitada. El estado se actualizará cuando Stripe la confirme.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        title="Suscripciones"
        description="Estado local de cada suscripción de prueba y su próximo período."
      >
        <button className="admin-button secondary" onClick={() => void load()}>
          Actualizar
        </button>
      </Heading>
      <ErrorMessage error={error} />
      {notice && <p role="status" className="billing-benefits">{notice}</p>}
      <section className="admin-card">
        {rows === null
          ? <p>Cargando…</p>
          : !rows.length
          ? <p className="admin-note">Aún no hay suscripciones de prueba.</p>
          : (
            <div className="billing-table-wrap">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Profesional</th>
                    <th>Plan / Modalidad</th>
                    <th>Estado</th>
                    <th>Renovación</th>
                    <th>Último pago</th>
                    <th>Proveedor</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link
                          className="admin-link"
                          to={`/admin/professionals/${s.professional_id}`}
                        >
                          {s.professional_name || "Profesional"}
                        </Link>
                      </td>
                      <td>
                        {s.plan_name}
                        <br />
                        {s.interval === "monthly" ? "Mensual" : "Anual"}
                      </td>
                      <td>
                        {stateLabel(s.state)}
                        {s.cancel_at_period_end && (
                          <p>Cancelación al vencimiento</p>
                        )}
                        {s.manual_hold && <p>Acceso manual protegido</p>}
                      </td>
                      <td>{dateLabel(s.period_end)}</td>
                      <td>{dateLabel(s.last_payment)}</td>
                      <td>{s.provider} · {(s.mode ?? "test").toUpperCase()}</td>
                      <td>
                        {s.state !== "cancelled" && (
                          <button
                            className="admin-link"
                            onClick={() => {
                              setChosen(s);
                              setConfirmation("");
                              setReason("");
                              operation.current = crypto.randomUUID();
                            }}
                          >
                            Cancelar ahora
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
      {chosen && (
        <section className="billing-confirm">
          <h2 className="font-semibold">
            Cancelar inmediatamente: {chosen.professional_name}
          </h2>
          <p className="my-3">
            Termina la suscripción de prueba de {chosen.plan_name}{" "}
            ahora, sin reembolso ni cargos adicionales. Conserva todos los datos
            clínicos. El motivo queda registrado en auditoría.
          </p>
          <div className="billing-form-grid">
            <label className="admin-field">
              Escribe CANCELAR AHORA<input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <label className="admin-field">
              Motivo administrativo<textarea
                minLength={8}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </div>
          <div className="billing-controls">
            <button
              className="admin-button"
              disabled={busy || confirmation !== "CANCELAR AHORA" ||
                reason.trim().length < 8}
              onClick={() => void cancel()}
            >
              Confirmar cancelación inmediata
            </button>
            <button
              className="admin-button secondary"
              onClick={() => setChosen(null)}
            >
              Volver
            </button>
          </div>
        </section>
      )}
    </>
  );
}
export function PaymentsPage() {
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void billingAdmin<Payment[]>("payments").then(setRows).catch((e) =>
      setError(e.message)
    );
  }, []);
  return (
    <>
      <Heading
        title="Pagos"
        description="Historial de pagos de prueba y comprobantes alojados en Stripe."
      />
      <ErrorMessage error={error} />
      <section className="admin-card">
        {rows === null
          ? <p>Cargando…</p>
          : !rows.length
          ? <p className="admin-note">Aún no hay pagos registrados.</p>
          : (
            <div className="billing-table-wrap">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Profesional</th>
                    <th>Importe</th>
                    <th>Estado</th>
                    <th>Plan</th>
                    <th>Proveedor</th>
                    <th>Comprobante</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.provider_invoice_id}>
                      <td>{dateLabel(p.issued_at)}</td>
                      <td>
                        <Link
                          className="admin-link"
                          to={`/admin/professionals/${p.professional_id}`}
                        >
                          {p.professional_name || "Profesional"}
                        </Link>
                      </td>
                      <td>
                        {money(
                          p.status === "paid" ? p.amount_paid : p.amount_due,
                          p.currency,
                        )} {p.currency}
                      </td>
                      <td>
                        {p.status === "paid"
                          ? "Pagado"
                          : p.status === "open"
                          ? "Pendiente"
                          : p.status}
                      </td>
                      <td>{p.plan_name}</td>
                      <td>{p.provider} · {(p.mode ?? "test").toUpperCase()}</td>
                      <td>
                        {hostedUrl(p.hosted_url, "invoice")
                          ? (
                            <a
                              className="admin-link"
                              href={hostedUrl(p.hosted_url, "invoice")!}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Ver factura ↗
                            </a>
                          )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
    </>
  );
}
type Overview = {
  settings: { enabled: boolean; grace_days: number };
  test_accounts: { id: string; name: string }[];
  professionals?: { id: string; name: string; email: string }[];
  plans: Plan[];
  mappings: {
    id: string;
    plan_id: string;
    plan_name: string;
    interval: Interval;
    amount: number;
    currency: string;
    provider_price_id: string | null;
  }[];
};
export function BillingSettingsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      billingAdmin<Overview>("overview").then(setData).catch((e) =>
        setError(e.message)
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (action: string, input: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      await billingAdmin(action, input);
      setNotice("Configuración guardada.");
      setOwner("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        title="Configuración de cobros"
        description="Stripe Test, período de gracia y cuentas habilitadas para pruebas."
      />
      <ErrorMessage error={error} />
      {notice && <p role="status" className="billing-benefits">{notice}</p>}
      {data
        ? (
          <>
            <form
              className="admin-card"
              onSubmit={(e) => {
                e.preventDefault();
                void run("settings", data.settings);
              }}
            >
              <p className="billing-test">
                Modo de prueba. Solo las cuentas de esta lista pueden iniciar un
                checkout.
              </p>
              <div className="billing-inline">
                <label className="admin-field">
                  Días de gracia<input
                    type="number"
                    required
                    min={0}
                    max={30}
                    value={data.settings.grace_days}
                    onChange={(e) =>
                      setData({
                        ...data,
                        settings: {
                          ...data.settings,
                          grace_days: Number(e.target.value),
                        },
                      })}
                  />
                </label>
                <label className="billing-check">
                  <input
                    type="checkbox"
                    checked={data.settings.enabled}
                    onChange={(e) =>
                      setData({
                        ...data,
                        settings: {
                          ...data.settings,
                          enabled: e.target.checked,
                        },
                      })}
                  />Habilitar checkout de prueba
                </label>
              </div>
              <button className="admin-button" disabled={busy}>
                Guardar configuración
              </button>
            </form>
            <section className="admin-card billing-section">
              <h2>Precios vinculados con Stripe Test</h2>
              <p className="admin-note">
                Los precios se editan en Planes. Sincronizar crea precios para
                nuevas contrataciones; las suscripciones existentes conservan el
                precio contratado.
              </p>
              <button
                className="admin-button secondary mt-4"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await billingAction("sync_prices", {
                      operation_key: crypto.randomUUID(),
                    });
                    setNotice("Precios vinculados con Stripe Test.");
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Sincronizar precios de prueba
              </button>
              <div className="billing-table-wrap">
                <table className="billing-table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Modalidad</th>
                      <th>Precio</th>
                      <th>Stripe Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mappings?.map((m) => (
                      <tr key={m.id}>
                        <td>{m.plan_name}</td>
                        <td>
                          {m.interval === "monthly" ? "Mensual" : "Anual"}
                        </td>
                        <td>{money(m.amount, m.currency)}</td>
                        <td>{m.provider_price_id ?? "Por vincular"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="admin-card billing-section">
              <h2>Cuentas de prueba</h2>
              <form
                className="billing-inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("test_account", {
                    professional_id: owner,
                    enabled: true,
                  });
                }}
              >
                <label className="admin-field">
                  Profesional
                  <select
                    required
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    <option value="">Selecciona una cuenta…</option>
                    {data.professionals?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.email} · {p.email}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="admin-button secondary" disabled={busy}>
                  Habilitar cuenta
                </button>
              </form>
              <ul>
                {data.test_accounts.map((a) => (
                  <li className="billing-inline" key={a.id}>
                    <Link
                      className="admin-link"
                      to={`/admin/professionals/${a.id}`}
                    >
                      {a.name || a.id}
                    </Link>
                    <button
                      className="admin-link"
                      disabled={busy}
                      onClick={() =>
                        void run("test_account", {
                          professional_id: a.id,
                          enabled: false,
                        })}
                    >
                      Quitar de pruebas
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )
        : <p>Cargando…</p>}
    </>
  );
}
