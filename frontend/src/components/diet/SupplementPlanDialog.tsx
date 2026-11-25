import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, ClipboardList, Clock3, Leaf, Plus, Search, Trash2, X } from "lucide-react";
import { archiveCustomSupplement, listSupplements } from "@/src/services/supplements";
import {
  advertisedStrength, loadSupplementCatalog, matchesSupplement, overlapsWith, sameConcentration, situationSuggestions, supplementName,
  type SituationCriteria, type SupplementSituation, type SupplementSuggestion,
} from "@/src/features/supplements/catalog";
import { isSupplementList, supplementQuantityLabel, type SupplementCatalogItem, type SupplementItem } from "../../../../supabase/functions/_shared/supplements";
import { ManualSupplementForm } from "./ManualSupplementForm";
import { SupplementPlanItem, SupplementSource, type SupplementSelection } from "./SupplementPlanItem";
import "./SupplementPlanDialog.css";

type View = { type: "browse" } | { type: "edit" | "replace"; id: string } | { type: "manual"; product: SupplementCatalogItem | null };
const maxItems = 30;
const pageSize = 6;
const initialCriteria: SituationCriteria = { week: "", reviewedPregnancy: false, anemia: "", reviewedConstipation: false };
type Catalog = Awaited<ReturnType<typeof loadSupplementCatalog>>;
const viewTitles: Record<View["type"], string> = {
  browse: "Suplementación del plan",
  edit: "Preparar indicación",
  replace: "Cambiar presentación",
  manual: "Ficha de suplemento",
};
const selectionProductId = (row: Omit<SupplementSelection, "id">) => row.reference?.id ?? row.label?.id ?? row.item?.product.id;

export function SupplementPlanDialog({ items, appearance, onClose, onSave }: {
  items: SupplementItem[];
  appearance: "default" | "night";
  onClose: () => void;
  onSave: (items: SupplementItem[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [library, setLibrary] = useState<SupplementCatalogItem[]>();
  const [catalog, setCatalog] = useState<Catalog>();
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [visible, setVisible] = useState(pageSize);
  const [view, setView] = useState<View>({ type: "browse" });
  const [criteria, setCriteria] = useState(initialCriteria);
  const [situations, setSituations] = useState<SupplementSituation[]>([]);
  const [showProposal, setShowProposal] = useState(true);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [presentations, setPresentations] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<SupplementSelection[]>(() => items.map(item => ({ id: item.id, item })));
  const [error, setError] = useState("");
  const activeId = view.type === "edit" || view.type === "replace" ? view.id : null;
  const selected = draft.find(selection => selection.id === activeId);
  const byId = useMemo(() => new Map(catalog?.products.map(product => [product.id, product])), [catalog]);
  const referenceFor = (selection: SupplementSelection) => selection.reference ?? byId.get(selection.item?.product.id ?? "");
  const pending = draft.filter(selection => !selection.item);
  const selectedProductIds = new Set(draft.map(selectionProductId));
  const close = () => onClose();
  const navigate = (next: View) => {
    setView(next);
    setError("");
    body.current?.scrollTo?.({ top: 0 });
  };

  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (view.type !== "browse") heading.current?.focus();
  }, [view.type]);
  useEffect(() => {
    let active = true;
    loadSupplementCatalog().then(data => { if (active) setCatalog(data); }, () => {
      if (active) setLoadError("No pudimos cargar el catálogo de situaciones y productos.");
    });
    listSupplements().then(data => { if (active) setLibrary(data); }, () => {
      if (active) { setLibrary([]); setLoadError("No pudimos cargar la biblioteca guardada."); }
    });
    return () => { active = false; };
  }, [retry]);

  const add = (selection: Omit<SupplementSelection, "id">) => {
    const productId = selectionProductId(selection);
    const existing = draft.find(row => selectionProductId(row) === productId);
    if (existing) {
      navigate({ type: "edit", id: existing.id });
      return;
    }
    if (draft.length >= maxItems) return;
    const id = crypto.randomUUID();
    setDraft([...draft, { ...selection, id }]);
    navigate({ type: "edit", id });
  };

  const suggestions = situationSuggestions(situations, criteria).sort((first, second) =>
    Number(second.recommended) - Number(first.recommended));
  const selectedReferences = draft.flatMap(row => {
    const ref = referenceFor(row);
    return ref ? [ref] : [];
  });
  const proposedProduct = (suggestion: SupplementSuggestion) => {
    const proposed = suggestion.folateMicrograms ? "SUP-073" : suggestion.group === "FIB" && suggestion.recommended ? "SUP-070" : "";
    return byId.get(presentations[suggestion.group] ?? proposed);
  };
  const isChosen = (suggestion: SupplementSuggestion) => chosen[suggestion.group] ?? (
    suggestion.recommended && !selectedReferences.some(ref => ref.group === suggestion.group ||
      (ref.group === "PRE" && ["FE", "FOL", "B12", "D", "O3"].includes(suggestion.group)) ||
      (ref.group === "FEFOL" && ["FE", "FOL", "B12"].includes(suggestion.group)))
  );
  const picked = showProposal ? suggestions.filter(isChosen) : [];
  const addSituationSelection = () => {
    if (picked.some(suggestion => !proposedProduct(suggestion))) {
      setError("Elige una presentación para cada suplemento marcado.");
      return;
    }
    const added = picked.flatMap(suggestion => {
      const reference = proposedProduct(suggestion)!;
      return selectedProductIds.has(reference.id) ? [] : [{ id: crypto.randomUUID(), reference, suggestion }];
    });
    if (draft.length + added.length > maxItems) { setError("El plan admite hasta 30 suplementos."); return; }
    if (!added.length) { setError("Los productos marcados ya están en la selección."); return; }
    setDraft([...draft, ...added]);
    setChosen({});
    setPresentations({});
    setShowProposal(false);
    navigate({ type: "edit", id: added[0].id });
  };

  const catalogResults = !query.trim() || tab === "mine" ? [] : (catalog?.products ?? []).filter(product =>
    matchesSupplement(query, [product.name, product.ingredient, product.presentation, product.strength]));
  const libraryResults = (library ?? []).filter(product => (tab === "all" || product.owner_id !== null) &&
    matchesSupplement(query, [product.name, product.brand, product.presentation]));
  const results = [...libraryResults, ...catalogResults];
  const filters = (query.trim() ? catalog?.situations.filter(situation => matchesSupplement(query, [situation.name]))
    : catalog?.situations.filter(situation => ["Gestación", "Anemia", "Estreñimiento"].includes(situation.name)))
    ?.filter(situation => !situations.some(selected => selected.name === situation.name));

  return <dialog ref={dialog} onCancel={close} onClose={close} aria-labelledby="supplement-plan-title"
    className="supplement-plan-dialog" data-appearance={appearance}>
    <div className="supplement-plan-shell">
      <header className="supplement-plan-header">
        <div className="supplement-plan-heading">
          <span className="supplement-plan-heading-icon"><Leaf size={21} aria-hidden="true"/></span>
          <h2 ref={heading} id="supplement-plan-title" tabIndex={-1}>{viewTitles[view.type]}</h2>
        </div>
        <button type="button" className="supplement-plan-icon" onClick={close} aria-label="Cerrar suplementación"><X size={22}/></button>
      </header>
      <div ref={body} className="supplement-plan-body">
        {view.type === "manual" && <ManualSupplementForm product={view.product} onCancel={() => navigate({ type: "browse" })}
          onSaved={product => {
            setLibrary(current => [product, ...(current ?? []).filter(row => row.id !== product.id)]);
            setTab("mine");
            setQuery("");
            navigate({ type: "browse" });
          }}/>}
        {view.type === "edit" && selected && <SupplementPlanItem key={selected.id + (selected.reference?.id ?? "")}
          selection={{ ...selected, reference: referenceFor(selected) }}
          onBack={() => navigate({ type: "browse" })}
          onApply={item => {
            setDraft(draft.map(row => row.id === item.id ? { id: row.id, item, reference: row.reference } : row));
            navigate({ type: "browse" });
          }}/>}
        {view.type === "replace" && selected && <div className="supplement-plan-form">
          <button type="button" className="supplement-plan-link" onClick={() => navigate({ type: "browse" })}><ArrowLeft size={16}/> Volver a la selección</button>
          <div className="supplement-plan-panel" data-tone="blue">
            <h3>{referenceFor(selected)?.ingredient}</h3>
            <div className="supplement-plan-results">
              {catalog?.products.filter(product => {
                const current = referenceFor(selected);
                return current && product.group === current.group && product.id !== current.id &&
                  !selectedReferences.some(row => row.id === product.id);
              }).map(reference => <button type="button" key={reference.id} className="supplement-plan-result" onClick={() => {
                const current = referenceFor(selected);
                const equivalent = current && sameConcentration(current, reference) ? selected.item : undefined;
                setDraft(draft.map(row => row.id === selected.id ? { id: selected.id, reference, equivalent,
                  suggestion: selected.suggestion } : row));
                navigate({ type: "edit", id: selected.id });
              }}>
                <span><strong>{supplementName(reference)}</strong><small>{reference.presentation}</small></span><ChevronRight size={17}/>
              </button>)}
            </div>
          </div>
        </div>}
        {view.type === "browse" && <div className="supplement-plan-layout">
          <div className="supplement-plan-browser">
            <section className="supplement-plan-panel" data-tone="blue" aria-labelledby="supplement-search-heading">
              <div className="supplement-plan-panel-heading">
                <h3 id="supplement-search-heading">Elegir suplemento</h3>
                <button type="button" className="nuth-button-secondary" onClick={() => navigate({ type: "manual", product: null })}><Plus size={16} aria-hidden="true"/> Crear suplemento</button>
              </div>
              <label className="supplement-plan-search"><Search size={19} aria-hidden="true"/>
                <input autoFocus type="search" aria-label="Buscar suplemento" maxLength={160} placeholder="Producto, ingrediente o situación"
                  value={query} onChange={event => { setQuery(event.target.value); setVisible(pageSize); }}/>
              </label>
              <div className="supplement-plan-tools" role="group" aria-label="Buscar en">
                <button type="button" className="supplement-plan-chip" aria-pressed={tab === "all"} onClick={() => { setTab("all"); setVisible(pageSize); }}>Todo</button>
                <button type="button" className="supplement-plan-chip" aria-pressed={tab === "mine"} onClick={() => { setTab("mine"); setVisible(pageSize); }}>Mi biblioteca</button>
              </div>
            </section>
            {tab === "all" && !!filters?.length && <div className="supplement-plan-panel" data-tone="amber">
              <h3>Situaciones clínicas</h3>
              <div className="flex flex-wrap gap-2">{filters.map(situation => <button type="button" className="supplement-plan-chip" key={situation.name} onClick={() => {
                setSituations([...situations, situation]);
                setShowProposal(true);
                setQuery("");
                setError("");
              }}><Plus size={14}/>{situation.name}</button>)}</div>
            </div>}
            {!!situations.length && <section className="supplement-plan-panel" data-tone="amber" aria-labelledby="supplement-proposal-heading">
              <div className="supplement-plan-panel-heading">
                <h3 id="supplement-proposal-heading">Propuesta por situación clínica</h3>
                <button type="button" className="supplement-plan-link" aria-expanded={showProposal} onClick={() => setShowProposal(!showProposal)}>
                  {showProposal ? "Ocultar propuesta" : "Ver propuesta clínica"}
                </button>
              </div>
              <div className="supplement-plan-tools">{situations.map(situation => <button type="button" key={situation.name} className="supplement-plan-chip" data-selected="true"
                aria-label={`Quitar situación ${situation.name}`} onClick={() => {
                  setSituations(situations.filter(row => row.name !== situation.name));
                  setChosen({});
                  setPresentations({});
                  setError("");
                }}>{situation.name}<X size={14}/></button>)}</div>
              {showProposal && <>
                <div className="supplement-plan-criteria">
                  {situations.some(situation => situation.name === "Gestación") && <>
                    <label>Semana de gestación<input className="nuth-input" inputMode="numeric" value={criteria.week}
                      onChange={event => { setCriteria({ ...criteria, week: event.target.value }); setChosen({}); }}/></label>
                    <label className="supplement-plan-check">
                      <input type="checkbox" checked={criteria.reviewedPregnancy} onChange={event => {
                        setCriteria({ ...criteria, reviewedPregnancy: event.target.checked }); setChosen({});
                      }}/>
                      Confirmé con la pauta obstétrica que falta cubrir la suplementación preventiva.
                    </label>
                  </>}
                  {situations.some(situation => situation.name === "Anemia") && <label>Deficiencia confirmada
                    <select className="nuth-input" value={criteria.anemia} onChange={event => {
                      setCriteria({ ...criteria, anemia: event.target.value }); setChosen({});
                    }}>
                      <option value="">Por confirmar</option><option value="FE">Hierro</option>
                      <option value="FOL">Folato</option><option value="B12">Vitamina B12</option>
                    </select>
                  </label>}
                  {situations.some(situation => situation.name === "Estreñimiento") && <label className="supplement-plan-check">
                    <input type="checkbox" checked={criteria.reviewedConstipation} onChange={event => {
                      setCriteria({ ...criteria, reviewedConstipation: event.target.checked }); setChosen({});
                    }}/>
                    Confirmé estreñimiento crónico idiopático en una persona adulta y que procede valorar fibra.
                  </label>}
                </div>
                <details className="supplement-plan-reference"><summary>Qué revisar antes de agregar</summary>
                  {situations.map(situation => <div key={situation.name}>
                    <strong>{situation.name}</strong><p>{situation.assessment}</p>
                    <SupplementSource url={situation.source}>Ver referencia</SupplementSource>
                  </div>)}
                </details>
                {suggestions.length ? <>
                  {suggestions.map(suggestion => <div className="supplement-plan-candidate" key={suggestion.group}>
                    <label className="supplement-plan-check"><input type="checkbox" checked={isChosen(suggestion)}
                      aria-describedby={`supplement-suggestion-${suggestion.group}`}
                      onChange={event => setChosen({ ...chosen, [suggestion.group]: event.target.checked })}/>
                      <strong>{catalog?.monographs.find(row => row.id === suggestion.group)?.ingredient ?? suggestion.group}</strong>
                    </label>
                    <small id={`supplement-suggestion-${suggestion.group}`}>{suggestion.note}</small>
                    {isChosen(suggestion) && <label className="sr-only" htmlFor={`supplement-presentation-${suggestion.group}`}>Presentación de {suggestion.group}</label>}
                    {isChosen(suggestion) && <select id={`supplement-presentation-${suggestion.group}`} className="nuth-input"
                      value={proposedProduct(suggestion)?.id ?? ""}
                      onChange={event => setPresentations({ ...presentations, [suggestion.group]: event.target.value })}>
                      <option value="">Elegir presentación</option>
                      {catalog?.products.filter(reference => reference.group === suggestion.group).map(reference =>
                        <option key={reference.id} value={reference.id}>{supplementName(reference)} · {reference.presentation}</option>)}
                    </select>}
                  </div>)}
                </> : <p>Revisa el caso y busca el producto indicado individualmente.</p>}
              </>}
            </section>}
            {!library && !catalog && !loadError && <p role="status">Cargando catálogo…</p>}
            {loadError && <p role="alert">{loadError} <button type="button" className="supplement-plan-link" onClick={() => { setLoadError(""); setRetry(retry + 1); }}>Reintentar</button></p>}
            {results.length > 0 && <section className="supplement-plan-panel" aria-labelledby="supplement-results-heading">
              <h3 id="supplement-results-heading">{query.trim() ? "Resultados de búsqueda" : "Productos disponibles"}</h3>
              <div className="supplement-plan-results">
                {results.slice(0, visible).map(product => {
                  const reference = "group" in product ? product : undefined;
                  const label = "owner_id" in product ? product : undefined;
                  const inPlan = selectedProductIds.has(product.id);
                  const productName = reference ? supplementName(reference) : product.name;
                  const accessibleName = reference ? `${productName} ${reference.presentation}` : productName;
                  return <div className="supplement-plan-result-row" key={product.id}>
                    <button type="button" className="supplement-plan-result" disabled={!inPlan && draft.length >= maxItems}
                      aria-label={`${inPlan ? "Abrir indicación de" : "Agregar"} ${accessibleName}`}
                      onClick={() => add({ reference, label })}>
                      <span><strong>{productName}</strong>
                        <small>{[label?.brand ?? reference?.ingredient, product.presentation].filter(Boolean).join(" · ")}</small></span>
                      {inPlan ? <span className="supplement-plan-status" data-ready="true"><Check size={15} aria-hidden="true"/> En el plan</span> : <Plus size={17} aria-hidden="true"/>}
                    </button>
                    {label?.owner_id && <div className="supplement-plan-private-tools">
                      <button type="button" className="supplement-plan-link" onClick={() => navigate({ type: "manual", product: label })}>Editar ficha</button>
                      <button type="button" className="supplement-plan-link" onClick={async () => {
                        try { await archiveCustomSupplement(label.id); setLibrary(rows => rows?.filter(row => row.id !== label.id)); }
                        catch (error) { setError((error as Error).message); }
                      }}>Quitar de mi biblioteca</button>
                    </div>}
                  </div>;
                })}
              </div>
              {results.length > visible && <button type="button" className="supplement-plan-link" onClick={() => setVisible(visible + pageSize)}>Mostrar más productos</button>}
            </section>}
            {query.trim() && catalog && library && !results.length && (tab === "mine" || !filters?.length) && <p className="supplement-plan-empty">Sin coincidencias. Prueba otro nombre o crea una ficha.</p>}
            {!query.trim() && tab === "mine" && library && !results.length && <p className="supplement-plan-empty">Tu biblioteca todavía está vacía. Usa «Crear suplemento» para guardar tu primera ficha.</p>}
          </div>
          <section className="supplement-plan-panel supplement-plan-selection" data-tone="mint" aria-label="Suplementos seleccionados">
            <div className="supplement-plan-panel-heading">
              <h3><ClipboardList size={18} aria-hidden="true"/> En este plan</h3><span className="supplement-plan-count">{draft.length}</span>
            </div>
            {!draft.length && <p className="supplement-plan-empty">Aquí aparecerán las indicaciones de los suplementos que elijas.</p>}
            {draft.map(row => {
              const reference = referenceFor(row);
              const product = row.item?.product ?? row.label;
              const name = reference?.name ?? product?.name;
              const overlap = reference && selectedReferences.some(other => other !== reference && overlapsWith(reference, other));
              const alternatives = reference && catalog?.products.some(other => other.group === reference.group &&
                other.id !== reference.id && !selectedReferences.some(used => used.id === other.id));
              return <article key={row.id} className="supplement-plan-selected">
                <div className="supplement-plan-item-heading"><div>
                  <h4>{name}</h4><p>{reference ? [advertisedStrength(reference), reference.presentation].filter(Boolean).join(" · ") : product?.presentation}</p>
                </div><button type="button" className="supplement-plan-icon" aria-label={`Quitar ${name}`}
                  onClick={() => setDraft(draft.filter(selection => selection.id !== row.id))}><Trash2 size={17} aria-hidden="true"/></button></div>
                <span className="supplement-plan-status" data-ready={!!row.item}>
                  {row.item ? <><Check size={14} aria-hidden="true"/> Indicación lista</> : <><Clock3 size={14} aria-hidden="true"/> Pendiente de indicar</>}
                </span>
                {row.item && <p>{supplementQuantityLabel(row.item)}</p>}
                {overlap && <p className="supplement-plan-overlap">Posible coincidencia de ingredientes. Compara las etiquetas y el aporte total.</p>}
                <div className="supplement-plan-item-actions">
                  <button type="button" className="supplement-plan-link" onClick={() => navigate({ type: "edit", id: row.id })}>
                    {row.item ? "Editar indicación" : "Completar indicación"}
                  </button>
                  {alternatives && <button type="button" className="supplement-plan-link" onClick={() => navigate({ type: "replace", id: row.id })}>Cambiar presentación</button>}
                </div>
              </article>;
            })}
          </section>
        </div>}
      </div>
      {view.type === "browse" && <footer className="supplement-plan-footer">
        {error && <p role="alert" className="supplement-plan-error">{error}</p>}
        <span className="supplement-plan-progress" aria-live="polite">{picked.length ? `${picked.length} ${picked.length === 1 ? "producto por agregar" : "productos por agregar"}`
          : pending.length ? `${pending.length} ${pending.length === 1 ? "indicación por confirmar" : "indicaciones por confirmar"}`
            : draft.length ? `${draft.length} ${draft.length === 1 ? "indicación lista" : "indicaciones listas"}` : ""}</span>
        <div className="supplement-plan-actions">
          <button type="button" className="nuth-button-secondary" onClick={close}>Cancelar</button>
          <button type="button" className="nuth-button" onClick={() => {
            if (picked.length) { addSituationSelection(); return; }
            if (pending.length) { navigate({ type: "edit", id: pending[0].id }); return; }
            const next = draft.flatMap(row => row.item ? [row.item] : []);
            if (isSupplementList(next)) onSave(next);
            else setError("Revisa las cantidades activas en la selección.");
          }}>{picked.length ? "Agregar selección" : pending.length ? "Revisar pendientes" : "Guardar suplementos en el plan"}</button>
        </div>
      </footer>}
    </div>
  </dialog>;
}
