import { useEffect, useState } from "react";
import { Plus, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/src/components/ui/FormField";
import {
  loadMedicationCatalog,
  medicationNutritionAlert,
  searchMedicationCatalog,
  type MedicationCatalog,
  type MedicationProduct,
} from "@/src/features/consultations/medicationCatalog";

export function useMedicationCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<MedicationCatalog>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadMedicationCatalog().then(
      (data) => { if (active) setCatalog(data); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [enabled]);

  return { catalog, failed };
}

export function MedicationCatalogPicker({
  id,
  describedBy,
  catalog,
  failed,
  onSelect,
  onManual,
}: {
  id: string;
  describedBy?: string;
  catalog?: MedicationCatalog;
  failed: boolean;
  onSelect: (product: MedicationProduct) => void;
  onManual: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(6);
  const [selectionMessage, setSelectionMessage] = useState("");
  const results = catalog && query.trim() ? searchMedicationCatalog(catalog, query) : null;
  const clearSearch = (name: string) => {
    setQuery("");
    setVisibleCount(6);
    setSelectionMessage(`${name} agregado.`);
    document.getElementById(id)?.focus();
  };

  return (
    <div className="rounded-xl border border-[var(--nuth-line)] bg-[var(--nuth-surface-soft)] p-3 sm:p-4">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-[var(--nuth-ink)]">
        Buscar medicamento
      </label>
      <div className="relative">
        <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
        <Input
          id={id}
          className="!min-w-0 !pl-10"
          type="search"
          autoComplete="off"
          maxLength={160}
          aria-describedby={describedBy}
          placeholder="Marca, activo o enfermedad"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisibleCount(6);
            setSelectionMessage("");
          }}
        />
      </div>
      <p role="status" className="sr-only">{selectionMessage}</p>
      {failed && (
        <p role="status" className="mt-2 text-sm text-[var(--nuth-ink)]">
          El catálogo no está disponible. Puedes usar la captura manual.
        </p>
      )}
      {query.trim() && !catalog && !failed && (
        <p role="status" className="mt-2 text-sm text-[var(--nuth-muted)]">Cargando catálogo…</p>
      )}
      {results && (
        <div className="mt-2 space-y-2">
          {!results.products.length && !results.references.length && (
            <p role="status" className="text-sm text-[var(--nuth-muted)]">Sin coincidencias en el catálogo.</p>
          )}
          {!!results.products.length && (
            <ul aria-label="Presentaciones encontradas" className="space-y-1.5">
              {results.products.slice(0, visibleCount).map((product) => {
                const { name, ingredient, concentration, presentation } = product.entries[0];
                return (
                  <li key={product.sku}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--nuth-line)] bg-[var(--nuth-surface)] px-3 py-2.5 text-start text-[var(--nuth-ink)] hover:border-[var(--nuth-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nuth-accent)]"
                      onClick={() => {
                        onSelect(product);
                        clearSearch(name);
                      }}
                    >
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        <span className="block text-sm font-semibold">{name} · {concentration}</span>
                        <span className="block text-xs text-[var(--nuth-muted)]">{ingredient} · {presentation}</span>
                      </span>
                      <Plus aria-hidden="true" size={17} className="shrink-0 text-[var(--nuth-accent)]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {results.products.length > visibleCount && (
            <button type="button" className="text-sm font-semibold text-[var(--nuth-ink)] underline underline-offset-4" onClick={() => setVisibleCount(visibleCount + 6)}>
              Mostrar más presentaciones
            </button>
          )}
          {!!results.references.length && (
            <details className="text-sm text-[var(--nuth-muted)]">
              <summary className="cursor-pointer font-medium">Referencias con presentación por verificar</summary>
              <ul className="mt-2 space-y-2">
                {results.references.map(({ sku, name, concentration, presentation }) => (
                  <li key={sku} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--nuth-line)] px-3 py-2">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{name} · {concentration} · {presentation}</span>
                    <button
                      type="button"
                      aria-label={`Registrar ${name} manualmente`}
                      className="text-sm font-semibold text-[var(--nuth-ink)] underline underline-offset-4"
                      onClick={() => {
                        onManual(name);
                        clearSearch(name);
                      }}
                    >
                      Usar nombre
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ReferenceLink({ value, label }: { value: string; label: string }) {
  return /^https:\/\/[^\s]+$/i.test(value) ? (
    <a href={value} target="_blank" rel="noreferrer" className="underline underline-offset-4">{label}</a>
  ) : value;
}

export function MedicationCatalogDetails({ product }: { product: MedicationProduct }) {
  const entry = product.entries[0];
  const alert = medicationNutritionAlert(product);
  const details = [
    ["Indicación principal", entry.indication],
    ["Clase farmacológica", entry.drugClass],
    ["Vía habitual", entry.route],
    ["Indicaciones clínicas del catálogo", entry.clinicalIndications],
    ["Mecanismo de acción", entry.mechanism],
    ["Efectos adversos y alertas", entry.adverseEffects],
    ["Seguimiento clínico", entry.followUp],
  ];
  const insulin = product.insulin;

  return (
    <div className="mb-3 space-y-2">
      {alert && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <TriangleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="font-semibold">Interacción nutricional · {alert.title}</p>
            <p>{alert.message}</p>
            <ReferenceLink value={alert.source} label="Consultar fuente de la alerta" />
          </div>
        </div>
      )}
      <details className="text-sm text-[var(--nuth-muted)]">
        <summary className="cursor-pointer font-semibold text-[var(--nuth-ink)]">Ficha del catálogo</summary>
        <div className="my-2 space-y-3 rounded-lg border border-[var(--nuth-line)] bg-[var(--nuth-surface)] p-3 [overflow-wrap:anywhere]">
          <div>
            <p className="font-semibold text-[var(--nuth-ink)]">Consideraciones nutricionales del catálogo</p>
            <p>{entry.nutrition}</p>
            <p className="mt-1 text-xs">{entry.verification}</p>
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="font-medium text-[var(--nuth-ink)]">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {insulin && (
            <div>
              <p className="font-medium text-[var(--nuth-ink)]">Perfil de acción de referencia</p>
              <p>{insulin.classification} · {insulin.device}</p>
              <p>Inicio {insulin.onset} · Pico {insulin.peak} · Duración {insulin.duration}</p>
              <ReferenceLink value={insulin.actionReference} label="Consultar referencia de acción" />
            </div>
          )}
          <div className="space-y-1 text-xs">
            <p className="font-medium text-[var(--nuth-ink)]">Fuentes · {product.sku}</p>
            <ul className="space-y-1">
              {product.entries.map((source) => (
                <li key={source.row} className="flex flex-wrap gap-x-2">
                  <span>{source.sourceSku ? `SKU original ${source.sourceSku}` : "Sin SKU de origen"}</span>
                  <ReferenceLink value={source.commercialSource} label="Fuente comercial" />
                  <ReferenceLink value={source.clinicalSource} label="Referencia clínica del catálogo" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}
