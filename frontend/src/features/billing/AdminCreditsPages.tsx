import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { dateLabel, money } from "./api";
import {
  creditAdmin,
  creditNumber as n,
  type CreditPackage,
  type CreditPurchase,
  purchaseState,
} from "./credits-api";
import "./billing.css";
function CreditHeading({ title }: { title: string }) {
  return (
    <>
      <header className="admin-heading">
        <div>
          <p className="admin-eyebrow">IA Y CRÉDITOS · TEST</p>
          <h1>{title}</h1>
        </div>
      </header>
      <nav className="billing-controls" aria-label="Administrar créditos">
        <Link className="admin-link" to="/admin/credits">Saldos y ajustes</Link>
        <Link className="admin-link" to="/admin/credits/packages">
          Paquetes
        </Link>
        <Link className="admin-link" to="/admin/credits/purchases">
          Compras
        </Link>
      </nav>
      <p className="billing-test">
        Catálogo TEST. Los importes son provisionales y no constituyen una
        oferta comercial definitiva.
      </p>
    </>
  );
}
export function CreditPackagesPage() {
  const [rows, setRows] = useState<CreditPackage[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      creditAdmin<CreditPackage[]>("packages").then(setRows).catch((e) =>
        setError(e.message)
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const disable = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await creditAdmin("disable_package", { id });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <CreditHeading title="Paquetes de créditos" />
      <div className="billing-controls">
        <Link className="admin-button" to="/admin/credits/packages/new">
          Crear paquete
        </Link>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <section className="admin-card billing-section">
        {!rows ? <p>Cargando paquetes…</p> : !rows.length
          ? (
            <p>
              Aún no hay paquetes. Define cantidad y precio de prueba para
              comenzar.
            </p>
          )
          : (
            <div className="billing-table-wrap">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Créditos</th>
                    <th>Precio TEST</th>
                    <th>Estado</th>
                    <th>Orden</th>
                    <th>Compras</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link
                          className="admin-link"
                          to={`/admin/credits/packages/${p.id}`}
                        >
                          {p.name}
                        </Link>
                        <small className="block">{p.code}</small>
                      </td>
                      <td>
                        {n(p.credits)}
                        {p.bonus_credits > 0 && (
                          <small className="block">
                            +{n(p.bonus_credits)} bonus
                          </small>
                        )}
                      </td>
                      <td>{money(p.price_amount * 100, p.currency)}</td>
                      <td>
                        {!p.active
                          ? "Desactivado"
                          : p.internal_only
                          ? "Solo interno"
                          : "Activo"}
                      </td>
                      <td>{p.display_order}</td>
                      <td>{p.purchases ?? 0}</td>
                      <td>
                        {p.active && (
                          <button
                            className="admin-link"
                            disabled={busy}
                            onClick={() => void disable(p.id)}
                          >
                            Desactivar
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
    </>
  );
}
const emptyPackage = (): CreditPackage => ({
  id: crypto.randomUUID(),
  version: 1,
  code: "",
  name: "",
  description: "",
  credits: 100,
  bonus_credits: 0,
  price_amount: 0,
  currency: "MXN",
  active: false,
  internal_only: false,
  test_only: true,
  display_order: 0,
});
export function CreditPackageEditorPage() {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const [pkg, setPkg] = useState<CreditPackage>(emptyPackage),
    [loading, setLoading] = useState(!!packageId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!packageId) return;
    let live = true;
    void creditAdmin<CreditPackage>("package", { id: packageId }).then((p) => {
      if (live) {
        setPkg(p);
        setLoading(false);
      }
    }).catch((e) => {
      if (live) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [packageId]);
  const update = (v: Partial<CreditPackage>) => {
    setPkg((p) => ({ ...p, ...v }));
    setSaved(false);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const row = await creditAdmin<CreditPackage>("save_package", pkg);
      setPkg(row);
      setSaved(true);
      navigate(`/admin/credits/packages/${row.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <CreditHeading title={packageId ? "Editar paquete" : "Crear paquete"} />
      {error && <p className="admin-error" role="alert">{error}</p>}
      {saved && (
        <p role="status" className="billing-benefits">Paquete guardado.</p>
      )}
      {loading
        ? <p>Cargando…</p>
        : (
          <form className="admin-card billing-section" onSubmit={save}>
            <div className="billing-form-grid">
              <label className="admin-field">
                Nombre<input
                  required
                  maxLength={120}
                  value={pkg.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label className="admin-field">
                Código interno<input
                  required
                  pattern="[A-Z0-9_-]{3,40}"
                  maxLength={40}
                  disabled={!!packageId}
                  value={pkg.code}
                  onChange={(e) =>
                    update({
                      code: e.target.value.toUpperCase().replace(/\s/g, ""),
                    })}
                />
              </label>
              <label className="admin-field">
                Créditos<input
                  required
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  value={pkg.credits}
                  onChange={(e) => update({ credits: Number(e.target.value) })}
                />
              </label>
              <label className="admin-field">
                Precio TEST<input
                  required
                  type="number"
                  min={10}
                  max={1000000}
                  step={0.01}
                  value={pkg.price_amount || ""}
                  onChange={(e) =>
                    update({ price_amount: Number(e.target.value) })}
                />
              </label>
              <label className="admin-field">
                Moneda<select
                  value={pkg.currency}
                  onChange={(e) => update({ currency: e.target.value })}
                >
                  <option value="MXN">MXN · Peso mexicano</option>
                </select>
              </label>
              <label className="billing-check">
                <input
                  type="checkbox"
                  checked={pkg.active}
                  onChange={(e) => update({ active: e.target.checked })}
                />Activo
              </label>
            </div>
            <details className="billing-details">
              <summary>Descripción y opciones</summary>
              <div className="billing-form-grid">
                <label className="admin-field">
                  Descripción<textarea
                    maxLength={500}
                    value={pkg.description}
                    onChange={(e) => update({ description: e.target.value })}
                  />
                </label>
                <label className="admin-field">
                  Créditos bonus<input
                    type="number"
                    min={0}
                    max={1000000 - pkg.credits}
                    step={1}
                    value={pkg.bonus_credits}
                    onChange={(e) =>
                      update({ bonus_credits: Number(e.target.value) })}
                  />
                </label>
                <label className="admin-field">
                  Orden de presentación<input
                    type="number"
                    min={0}
                    max={10000}
                    step={1}
                    value={pkg.display_order}
                    onChange={(e) =>
                      update({ display_order: Number(e.target.value) })}
                  />
                </label>
                <label className="billing-check">
                  <input
                    type="checkbox"
                    checked={pkg.internal_only}
                    onChange={(e) =>
                      update({ internal_only: e.target.checked })}
                  />Solo interno · oculto para compra
                </label>
              </div>
            </details>
            <p className="admin-note">
              Los cambios se aplican a nuevas recargas. Las compras y sesiones
              de pago ya creadas conservan la cantidad, el precio y los
              beneficios originales.
            </p>
            <div className="billing-controls">
              <button className="admin-button" disabled={busy}>
                {busy ? "Guardando…" : "Guardar paquete"}
              </button>
              <Link className="admin-link" to="/admin/credits/packages">
                Volver
              </Link>
            </div>
          </form>
        )}
    </>
  );
}
export function CreditPurchasesPage() {
  const [rows, setRows] = useState<CreditPurchase[] | null>(null),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      creditAdmin<CreditPurchase[]>("purchases").then(setRows).catch((e) =>
        setError(e.message)
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <CreditHeading title="Compras de créditos" />
      <button className="admin-button secondary" onClick={() => void load()}>
        Actualizar
      </button>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <section className="admin-card billing-section">
        {!rows
          ? <p>Cargando compras…</p>
          : !rows.length
          ? <p>Todavía no hay compras.</p>
          : (
            <div className="billing-table-wrap">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Profesional</th>
                    <th>Paquete</th>
                    <th>Créditos</th>
                    <th>Importe TEST</th>
                    <th>Estado</th>
                    <th>Promoción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td>{dateLabel(p.created_at)}</td>
                      <td>
                        <Link
                          className="admin-link"
                          to={`/admin/professionals/${p.professional_id}`}
                        >
                          {p.professional_name}
                        </Link>
                      </td>
                      <td>{p.package_name}</td>
                      <td>
                        {n(p.credits_purchased)}
                        {p.bonus_credits > 0 && (
                          <small className="block">
                            +{n(p.bonus_credits)} bonus
                          </small>
                        )}
                        {p.reversed_credits > 0 && (
                          <small className="block">
                            {n(p.reversed_credits)} revertidos
                          </small>
                        )}
                      </td>
                      <td>
                        {money(p.amount_paid ?? p.expected_amount, p.currency)}
                        {p.refunded_amount > 0 && (
                          <small className="block">
                            {money(p.refunded_amount, p.currency)} reembolsados
                          </small>
                        )}
                      </td>
                      <td>{purchaseState(p.status)}</td>
                      <td>{p.promotion_code ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <p className="admin-note mt-4">
          Últimas 200 compras. Los reembolsos y disputas se gestionan en Stripe
          TEST y se reflejan aquí al confirmarse.
        </p>
      </section>
    </>
  );
}
