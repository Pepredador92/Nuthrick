import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import {
  configuredCreditCost,
  type CostAssumptions,
  type CostConfig,
  defaultCostAssumptions,
  estimateCommercialCosts,
} from "./commercialCosts";
import "./commercialCosts.css";
const storageKey = "nuthrick:admin-cost-assumptions:v1";
const mxn = (value: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(value);
function initialAssumptions(): CostAssumptions {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (
      saved &&
      Object.keys(defaultCostAssumptions).every((key) =>
        typeof saved[key] === "number" && Number.isFinite(saved[key])
      )
    ) return saved;
  } catch { /* Browser storage can be disabled. */ }
  return defaultCostAssumptions;
}
export function ProviderCreditLink() {
  return (
    <a
      className="admin-button secondary"
      href="https://platform.openai.com/settings/organization/billing/overview"
      target="_blank"
      rel="noopener noreferrer"
    >
      Recargar saldo de OpenAI ↗
    </a>
  );
}
export function CommercialCostPreview({
  monthlyPrice,
  annualPrice,
  credits,
  currency = "MXN",
  packagePrice,
}: {
  monthlyPrice?: number | null;
  annualPrice?: number | null;
  credits: number;
  currency?: string;
  packagePrice?: number | null;
}) {
  const [config, setConfig] = useState<CostConfig | null>(null);
  const [error, setError] = useState("");
  const [assumptions, setAssumptions] = useState(initialAssumptions);
  useEffect(() => {
    let active = true;
    void supabase.rpc("admin_commercial_costs").then(({ data, error }) => {
      if (!active) return;
      if (error || !data || !Array.isArray(data.features)) {
        setError("No pudimos consultar el costo configurado de IA.");
      } else {
        setConfig(data as CostConfig);
        if (!data.features.length) {
          setError(
            "No hay funciones IA activas con una conversión configurada.",
          );
        }
      }
    });
    return () => {
      active = false;
    };
  }, []);
  const unit = configuredCreditCost(config);
  const isPackage = packagePrice !== undefined;
  const columns = isPackage
    ? [{ label: "Por recarga", price: packagePrice ?? null, months: 1 }]
    : [{ label: "Por mensualidad", price: monthlyPrice ?? null, months: 1 }, {
      label: "Por anualidad",
      price: annualPrice ?? null,
      months: 12,
    }];
  const set = (key: keyof CostAssumptions, value: string) => {
    const next = { ...assumptions, [key]: value === "" ? NaN : Number(value) };
    setAssumptions(next);
    if (Object.values(next).every(Number.isFinite)) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch { /* Optional preference only. */ }
    }
  };
  return (
    <section className="commercial-costs" aria-label="Simulador de costos">
      <div className="commercial-costs-heading">
        <div>
          <p className="admin-eyebrow">ANTES DE GUARDAR</p>
          <h3>Costo y margen estimados</h3>
        </div>
        <ProviderCreditLink />
      </div>
      <p className="admin-note">
        Se recalcula al editar precios y créditos. Estima el consumo completo de
        los créditos incluidos{isPackage
          ? " y bonus"
          : "; en anual cuenta 12 asignaciones mensuales"}.
      </p>
      <div className="commercial-costs-inputs">
        {([
          ["mxnPerUsd", "Tipo de cambio simulado (MXN/USD)"],
          ["paymentsPercent", "Stripe Payments (%)"],
          ["fixedMxn", "Comisión fija (MXN)"],
          ...(!isPackage ? [["billingPercent", "Stripe Billing (%)"]] : []),
          ["feeVatPercent", "IVA de comisiones (%)"],
        ] as [keyof CostAssumptions, string][]).map(([key, label]) => (
          <label className="admin-field" key={key}>
            {label}
            <input
              type="number"
              min={key === "mxnPerUsd" ? 0.01 : 0}
              max={key.endsWith("Percent") ? 100 : undefined}
              step="0.01"
              value={Number.isFinite(assumptions[key]) ? assumptions[key] : ""}
              onChange={(e) =>
                set(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      <p className="admin-note">
        El tipo de cambio es un supuesto editable, no una cotización en vivo.
        Comisiones de referencia para tarjeta nacional; ajusta tus tarifas
        contratadas.{" "}
        <a
          className="admin-link"
          href="https://stripe.com/mx/pricing"
          target="_blank"
          rel="noopener noreferrer"
        >
          Tarifas de Stripe ↗
        </a>
      </p>
      <p className="commercial-costs-unit">
        {unit !== null && Number.isFinite(assumptions.mxnPerUsd)
          ? (
            <>
              1 crédito IA ≈{" "}
              <strong>{mxn(unit * assumptions.mxnPerUsd)} MXN</strong> · USD
              {" "}
              {unit.toFixed(4)} según configuración vigente.
            </>
          )
          : error || "Consultando la conversión configurada de IA…"}
      </p>
      {currency !== "MXN"
        ? (
          <p className="admin-note">
            Este simulador estima únicamente precios en MXN.
          </p>
        )
        : (
          <div className="commercial-costs-results" aria-live="polite">
            {columns.map((column) => {
              const estimate = estimateCommercialCosts({
                price: column.price,
                months: column.months,
                credits,
                recurring: !isPackage,
                usdPerCredit: unit,
              }, assumptions);
              return (
                <article key={column.label}>
                  <h4>{column.label}</h4>
                  {!estimate
                    ? (
                      <p>
                        Completa los importes y la configuración para calcular
                        el margen.
                      </p>
                    )
                    : (
                      <>
                        <dl>
                          {[
                            ["Precio", estimate.price],
                            ["Stripe Payments", estimate.payments],
                            ...(!isPackage
                              ? [["Stripe Billing", estimate.billing]]
                              : []),
                            ["IVA de comisiones", estimate.feeVat],
                            ["Total Stripe", estimate.stripe],
                            [`IA · ${estimate.credits} créditos`, estimate.ai],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{mxn(Number(value))}</dd>
                            </div>
                          ))}
                        </dl>
                        <div
                          className={`commercial-costs-margin${
                            estimate.margin < 0 ? " negative" : ""
                          }`}
                        >
                          <span>Margen de contribución</span>
                          <strong>{mxn(estimate.margin)}</strong>
                          <small>
                            {estimate.marginPercent === null
                              ? "Sin porcentaje para precio cero"
                              : `${
                                estimate.marginPercent.toFixed(1)
                              }% del precio`}
                          </small>
                        </div>
                      </>
                    )}
                </article>
              );
            })}
          </div>
        )}
      <p className="admin-note">
        Margen antes de impuestos de Nuthrick, infraestructura, soporte,
        reembolsos y otros gastos. No representa utilidad neta ni cambia
        precios, cobros o conversiones de IA. La recarga de OpenAI se realiza en
        la cuenta del proveedor.
      </p>
    </section>
  );
}
