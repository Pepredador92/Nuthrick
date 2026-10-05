import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Calculator, Check, CircleAlert, Info, Leaf, ListPlus, LoaderCircle, Minus, Pin, Plus, RotateCcw, Save, SlidersHorizontal, Target } from "lucide-react";
import { exchangeCatalog, exchangeCatalogCategories, type ExchangeCatalogGroup } from "@/src/features/exchanges/catalog";
import {
  applyExchangeSuggestion,
  confirmExchangePrescription,
  createExchangePrescription,
  objectivesChangedSinceConfirmation,
  reconcileExchangePrescription,
  resetExchangePrescription,
  setExchangePortions,
  totalExchangePortions,
} from "@/src/features/exchanges/model";
import { type ExchangeGroupPreference, type ExchangeSuggestion } from "@/src/features/exchanges/suggestion";
import { exchangeAlternatives, exchangeKey, describeExchanges, preparationLimitations, type PreparationCatalog } from "@/src/features/diet-workshop/proposals";
import { ProposalNavigation, useProposalExplorer, useProposalSetting } from "./useProposalExplorer";
import { usePreparationCatalog } from "./usePreparationCatalog";
import type { ExchangeDerivedTotals, ExchangeGroupCode, ExchangePrescription, ExchangeTargetSnapshot, NutritionPlan } from "@/src/types/domain";
import { useChangeAutosave } from "./useChangeAutosave";
import "./DietEnergyStep.css";
import "./DietEquivalentsStep.css";

type Props = {
  catalog?: PreparationCatalog;
  headerActions?: React.ReactNode;
  plan: NutritionPlan;
  targets: ExchangeTargetSnapshot | null;
  onSave: (prescription: ExchangePrescription, immediate?: boolean) => Promise<void>;
  onDraftChange: (prescription: ExchangePrescription) => void;
  onGoToMacros: () => void;
  onContinue?: () => void;
  onSaveAndExit?: () => void;
};

const ENERGY_MARGIN_KCAL = 100;

const number = (value: string) => {
  if (value.trim() === "") return 0;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
};
const format = (value: number, maximumFractionDigits = 1) => value.toLocaleString("es-MX", { maximumFractionDigits });
const signed = (value: number, maximumFractionDigits = 1) => `${value > 0 ? "+" : ""}${format(value, maximumFractionDigits)}`;
const portionsByCode = (prescription: ExchangePrescription) => new Map(prescription.groups.map((group) => [group.group_code, group.portions]));

function GroupContribution({ group, portions }: { group: ExchangeCatalogGroup; portions: number }) {
  return <details className="equivalents-contribution">
    <summary><span>{group.shortName}</span><Info size={13} aria-label={`Consultar aporte de ${group.groupName}`} /></summary>
    <div>
      <p><span className="equivalents-contribution-label">1 equivalente:</span> {group.energyKcal} kcal · {group.carbohydrateG} g CHO · {group.proteinG} g proteína · {group.fatG} g grasa</p>
      {portions > 0 && <p><strong>Total:</strong> {format(portions * group.energyKcal)} kcal · {format(portions * group.carbohydrateG)} g CHO · {format(portions * group.proteinG)} g proteína · {format(portions * group.fatG)} g grasa</p>}
    </div>
  </details>;
}

function PortionInput({ group, portions, onChange, disabled = false }: { group: ExchangeCatalogGroup; portions: number; onChange: (value: number) => void; disabled?: boolean }) {
  const adjust = (amount: number) => onChange(Math.max(0, portions + amount));
  return <div className="equivalents-portion-input">
    <button type="button" disabled={disabled} aria-label={`Restar media porción de ${group.groupName}`} onClick={() => adjust(-0.5)}><Minus size={15} /></button>
    <label className="sr-only" htmlFor={`exchange-${group.groupCode}`}>Porciones de {group.groupName}</label>
    <input id={`exchange-${group.groupCode}`} disabled={disabled} aria-label={`Porciones de ${group.groupName}`} inputMode="decimal" type="number" min="0" step="0.5" value={portions || ""} placeholder="0" onChange={(event) => { const value = number(event.target.value); if (value !== null) onChange(value); }} />
    <button type="button" disabled={disabled} aria-label={`Sumar media porción de ${group.groupName}`} onClick={() => adjust(0.5)}><Plus size={15} /></button>
  </div>;
}

function DifferenceMetric({ label, target, actual, difference, unit, precision = 1, closeWithin, tone }: { label: string; target: number; actual: number; difference: number; unit: string; precision?: number; closeWithin?: number; tone: string }) {
  const relativeDifference = Math.abs(difference) / Math.max(target, 1);
  const proximity = (closeWithin === undefined ? relativeDifference <= 0.03 : Math.abs(difference) <= closeWithin) ? "Cerca" : difference < 0 ? "Por debajo" : "Por encima";
  const progress = Math.min(100, Math.max(0, (actual / Math.max(target, 1)) * 100));
  return <div className={`equivalents-metric equivalents-metric-${tone}`}>
    <p className="equivalents-metric-label"><span aria-hidden="true" />{label}</p>
    <p className="equivalents-metric-value"><strong>{format(actual, precision)}</strong><span> / {format(target, precision)} {unit}</span></p>
    <div className="equivalents-progress" role="progressbar" aria-label={`Proximidad de ${label} al objetivo`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div style={{ width: `${progress}%` }} /></div>
    <p className="equivalents-metric-difference">{proximity} · {signed(difference, precision)} {unit}</p>
  </div>;
}

const preferenceLabels: Record<ExchangeGroupPreference, string> = {
  auto: "Auto",
  include: "Incluir",
  avoid: "Evitar",
  exclude: "Excluir",
};

function PreferencesPanel({ preferences, onChange }: { preferences: Partial<Record<ExchangeGroupCode, ExchangeGroupPreference>>; onChange: (code: ExchangeGroupCode, value: ExchangeGroupPreference) => void }) {
  const configured = Object.values(preferences).filter((value) => value && value !== "auto").length;
  return <details className="equivalents-preferences">
    <summary><SlidersHorizontal size={15} /><span>Preferencias</span>{configured > 0 && <span className="equivalents-count">{configured}</span>}</summary>
    <p className="equivalents-note">Tu criterio tiene prioridad sobre el perfil automático.</p>
    <div className="equivalents-preference-list">
      {exchangeCatalogCategories.map((category) => <section key={category.category}>
        <h3>{category.label}</h3>
        {exchangeCatalog.filter((group) => group.category === category.category).map((group) => <label key={group.groupCode}>
          <span>{group.shortName}</span>
          <select aria-label={`Preferencia de ${group.groupName}`} value={preferences[group.groupCode] ?? "auto"} onChange={(event) => onChange(group.groupCode, event.target.value as ExchangeGroupPreference)}>
            {(Object.keys(preferenceLabels) as ExchangeGroupPreference[]).map((value) => <option key={value} value={value}>{preferenceLabels[value]}</option>)}
          </select>
        </label>)}
      </section>)}
    </div>
  </details>;
}

function GroupPicker({ activeCodes, onAdd }: { activeCodes: ReadonlySet<ExchangeGroupCode>; onAdd: (code: ExchangeGroupCode) => void }) {
  return <details className="equivalents-picker">
    <summary><ListPlus size={17} /> Agregar grupo <Plus size={15} /></summary>
    <div className="equivalents-picker-list">
      {exchangeCatalogCategories.map((category) => <section key={category.category}>
        <h3>{category.label}</h3>
        <div>{exchangeCatalog.filter((group) => group.category === category.category).map((group) => {
          const active = activeCodes.has(group.groupCode);
          return <button key={group.groupCode} type="button" disabled={active} onClick={() => onAdd(group.groupCode)}><span>{group.shortName}</span><span>{active ? "En uso" : "Agregar"}</span></button>;
        })}</div>
      </section>)}
    </div>
  </details>;
}

function EquivalentEditor({ headerActions, plan, targets, onSave, onDraftChange, onGoToMacros, onContinue, onSaveAndExit, catalog: suppliedCatalog }: Omit<Props, "targets"> & { targets: ExchangeTargetSnapshot }) {
  const initial = useMemo(() => plan.exchange_prescription ? reconcileExchangePrescription(plan.exchange_prescription, targets) : createExchangePrescription(targets), [plan.exchange_prescription, targets]);
  const [draft, setDraft] = useState(initial);
  const [startFromCurrent, setStartFromCurrent] = useProposalSetting(`${plan.id}:exchange-start`, false);
  const [preferences, setPreferences] = useProposalSetting<Partial<Record<ExchangeGroupCode, ExchangeGroupPreference>>>(`${plan.id}:preferences`, {});
  const [locked, setLocked] = useProposalSetting<Partial<Record<ExchangeGroupCode, number>>>(`${plan.id}:exchange-locks`, {});
  const preparation = usePreparationCatalog(suppliedCatalog);
  const explorer = useProposalExplorer<ExchangeSuggestion, ExchangePrescription>(`${plan.id}:exchange-history`, JSON.stringify({ targets, preferences, locked, startFromCurrent, times: plan.meal_distribution?.meal_times, catalog: preparation.catalog }), exchangeKey);
  const proposal = explorer.proposal;
  const [manualGroups, setManualGroups] = useState<Set<ExchangeGroupCode>>(() => new Set(initial.groups.filter((group) => group.portions > 0).map((group) => group.group_code)));
  const autosave = useChangeAutosave({ initialValue: initial, onSave: (value) => onSave(value, true), onDraftChange });
  const saveState = autosave.status;

  const update = (next: ExchangePrescription, immediate = false, exploring = false) => {
    setDraft(next);
    if (!exploring) explorer.invalidate();
    autosave.change(next, { immediate });
  };

  const byCode = portionsByCode(draft);
  const proposedByCode = proposal ? new Map(proposal.groups.map((group) => [group.groupCode, group.portions])) : null;
  const hasPortions = draft.groups.some((group) => group.portions > 0);
  const confirmed = draft.status === "ready" && Boolean(draft.confirmed_at) &&
    (saveState === "clean" || saveState === "saved");
  const withinEnergyMargin = Math.abs(draft.differences.energy_kcal) <= ENERGY_MARGIN_KCAL;
  const statusLabel = confirmed ? "Cuadro confirmado" : saveState === "error" ? "No guardado" : draft.status === "ready" ? "Guardando cuadro…" : draft.status === "editing" ? "En edición" : "Sin iniciar";
  const statusTone = confirmed ? "is-ready" : saveState === "error" ? "is-error" : "";
  const change = (code: ExchangeCatalogGroup["groupCode"], value: number) => {
    if (locked[code] !== undefined) setLocked({ ...locked, [code]: value });
    update(setExchangePortions(draft, targets, code, value));
  };
  const confirm = async () => {
    const next = confirmExchangePrescription(draft, targets);
    setDraft(next);
    await autosave.saveNow(next);
  };
  const reset = () => {
    if (hasPortions && !window.confirm("¿Restablecer todos los equivalentes? Esta acción deja las porciones del día en cero.")) return;
    setManualGroups(new Set());
    update(resetExchangePrescription(targets), true);
  };
  const propose = () => explorer.generate(() => exchangeAlternatives({
    targets,
    currentPortions: draft.groups,
    options: { startFromCurrent: hasPortions && startFromCurrent, groupPreferences: preferences, lockedGroups: locked },
  }, preparation.catalog, plan.meal_distribution));
  const applyProposal = () => {
    if (!proposal) return;
    explorer.apply(draft, p => update(applyExchangeSuggestion(draft, targets, p), true, true));
  };
  const displayedTotals: ExchangeDerivedTotals = proposal?.totals ?? draft.derived_totals;
  const displayedDifferences: ExchangeDerivedTotals = proposal?.differences ?? draft.differences;
  const displayedPortions = proposal ? proposedByCode! : byCode;
  const activeCodes = new Set<ExchangeGroupCode>([
    ...exchangeCatalog.filter((group) => (displayedPortions.get(group.groupCode) ?? 0) > 0).map((group) => group.groupCode),
    ...(!proposal ? manualGroups : []),
  ]);
  const activeSections = exchangeCatalogCategories.map((category) => ({
    ...category,
    groups: exchangeCatalog.filter((group) => group.category === category.category && activeCodes.has(group.groupCode)),
  })).filter((category) => category.groups.length > 0);
  const setPreference = (code: ExchangeGroupCode, value: ExchangeGroupPreference) => {
    setPreferences({ ...preferences, [code]: value });
    explorer.discard();
  };

  return <section className="diet-equivalents-step">
    <header className="energy-intro">
      <div><p className="energy-eyebrow">PASO 03 / 06</p><h1>Equivalentes</h1><p>Convierte la meta de alimentos en porciones para el día.</p></div>
      <span className={`energy-status ${statusTone}`}>{confirmed ? <Check size={14} /> : <CircleAlert size={14} />}{statusLabel}</span>
    </header>
    {objectivesChangedSinceConfirmation(draft) && <p role="status" className="energy-warning equivalents-context-warning">Los objetivos nutricionales cambiaron desde la última confirmación. Las porciones se conservaron; revisa el cuadro y confírmalo de nuevo cuando esté listo.</p>}

    <div className="equivalents-grid">
      <section className="energy-card equivalents-portions" aria-labelledby="equivalents-portions-heading">
        <header className="energy-card-heading">
          <span className="energy-icon energy-icon-activity"><Leaf size={21} /></span>
          <div><p className="equivalents-card-step">01 · DISTRIBUYE</p><h2 id="equivalents-portions-heading">Equivalentes del día</h2></div>
          <span className="equivalents-count">{activeCodes.size} grupos</span>
        </header>
        <div className="energy-card-body">
          <div className="equivalents-list-intro"><p>Elige los grupos y ajusta sus porciones.</p>{proposal && <span className="equivalents-preview-badge">Propuesta</span>}</div>
          {activeSections.length ? <div className="equivalents-groups">
            {activeSections.map((category) => <section key={category.category} className={`equivalents-category equivalents-category-${category.category}`}>
              <h3><span aria-hidden="true" />{category.label}</h3>
              <div>{category.groups.map((group) => {
                const portions = displayedPortions.get(group.groupCode) ?? 0;
                return <div key={group.groupCode} className="equivalents-row">
                  <GroupContribution group={group} portions={portions} />
                  <PortionInput group={group} portions={portions} disabled={Boolean(proposal)} onChange={(value) => change(group.groupCode, value)} />
                  {!proposal && <button type="button" aria-label={`Fijar ${group.groupName}`} aria-pressed={locked[group.groupCode] !== undefined} className="equivalents-lock" title="Conservar estas porciones al proponer" onClick={() => { const next = { ...locked }; if (next[group.groupCode] !== undefined) delete next[group.groupCode]; else next[group.groupCode] = byCode.get(group.groupCode) ?? 0; setLocked(next); }}><Pin size={13} /><span>{locked[group.groupCode] !== undefined ? "Fijado" : "Fijar"}</span></button>}
                </div>;
              })}</div>
            </section>)}
          </div> : <div className="equivalents-empty">
            <span className="energy-icon energy-icon-activity"><Leaf size={24} /></span>
            <p>Aún no has definido equivalentes.</p>
            <p>Puedes proponer una distribución o agregar grupos manualmente.</p>
          </div>}
          {!proposal && <GroupPicker activeCodes={activeCodes} onAdd={(code) => setManualGroups((current) => new Set([...current, code]))} />}
          {(hasPortions || manualGroups.size > 0) && !proposal && <div className="equivalents-list-footer"><p>Total: <strong>{format(totalExchangePortions(draft), 2)} equivalentes</strong></p><button type="button" onClick={reset}><RotateCcw size={14} /> Restablecer</button></div>}
          <p className="equivalents-note equivalents-list-help"><Info size={13} /> Abre el nombre de un grupo para consultar su aporte. Fijar conserva sus porciones al proponer.</p>
        </div>
      </section>

      <div className="equivalents-side">
        <section className="energy-card equivalents-summary" aria-labelledby="equivalents-summary-heading">
          <header className="energy-card-heading">
            <span className="energy-icon energy-icon-target"><Target size={21} /></span>
            <div><p className="equivalents-card-step">02 · COMPARA</p><h2 id="equivalents-summary-heading">Cuadro dietosintético</h2></div>
          </header>
          <div className="energy-card-body">
            <div className="equivalents-summary-intro"><p>{proposal ? "Propuesta lista · aún sin aplicar." : "Actual frente al objetivo de alimentos."}</p>{proposal && <span className="equivalents-preview-badge">Sin aplicar</span>}</div>
            <div className="equivalents-metrics">
              <DifferenceMetric label="Energía" tone="energy" target={targets.energy_kcal} actual={displayedTotals.energy_kcal} difference={displayedDifferences.energy_kcal} unit="kcal" precision={0} closeWithin={ENERGY_MARGIN_KCAL} />
              <DifferenceMetric label="Carbohidratos" tone="carbohydrate" target={targets.carbohydrate_g} actual={displayedTotals.carbohydrate_g} difference={displayedDifferences.carbohydrate_g} unit="g" />
              <DifferenceMetric label="Proteína" tone="protein" target={targets.protein_g} actual={displayedTotals.protein_g} difference={displayedDifferences.protein_g} unit="g" />
              <DifferenceMetric label="Grasas" tone="fat" target={targets.fat_g} actual={displayedTotals.fat_g} difference={displayedDifferences.fat_g} unit="g" />
            </div>
            <p className="equivalents-note">Los suplementos ya se descontaron en Macros. Aquí distribuyes únicamente alimentos.</p>
            {!proposal && hasPortions && <p className={`equivalents-margin ${withinEnergyMargin ? "is-close" : ""}`}>
              {withinEnergyMargin
                ? `La diferencia de energía está dentro de ±${ENERGY_MARGIN_KCAL} kcal. No necesitas un ajuste exacto para confirmar.`
                : `La diferencia de energía supera ±${ENERGY_MARGIN_KCAL} kcal. Revísala antes de confirmar; puedes continuar según tu criterio clínico.`}
            </p>}
            {confirmed && !proposal && <p role="status" className="equivalents-confirmed"><Check size={14} />Equivalentes confirmados.</p>}
          </div>
        </section>

        <section className="energy-card equivalents-assistant" aria-labelledby="equivalents-assistant-heading">
          <header className="energy-card-heading">
            <span className="energy-icon energy-icon-method"><Calculator size={20} /></span>
            <div><h2 id="equivalents-assistant-heading">Un punto de partida</h2><p>Propón, revisa y ajusta a tu criterio.</p></div>
          </header>
          <div className="energy-card-body">
            <button type="button" disabled={preparation.loading} aria-label={proposal ? "Volver a proponer porciones" : "Proponer porciones"} className="equivalents-propose" onClick={propose}><Calculator size={16} />{preparation.loading ? "Preparando propuesta…" : explorer.count ? "Otra propuesta" : "Proponer porciones"}</button>
            <p className="equivalents-note equivalents-auto-note">Cálculo automático · sin créditos de IA.</p>
            {hasPortions && !proposal && <label className="equivalents-start-current"><input type="checkbox" checked={startFromCurrent} onChange={(event) => setStartFromCurrent(event.target.checked)} />Partir de mis porciones actuales</label>}
            <div className="equivalents-proposal-navigation"><ProposalNavigation count={explorer.count} index={explorer.index} onNavigate={explorer.navigate} /></div>
            {proposal && <p className="equivalents-note">{describeExchanges(proposal)}</p>}
            {proposal && <p className="equivalents-note equivalents-caution">{preparationLimitations(proposal.groups.filter(g => g.portions > 0).map(g => g.groupCode), preparation.catalog)}</p>}
            {(explorer.message || preparation.error) && <p role="status" className="equivalents-note equivalents-caution">{explorer.message || preparation.error}</p>}
            {explorer.canUndo && <button type="button" className="equivalents-undo" onClick={() => explorer.undo(previous => update(reconcileExchangePrescription(previous, targets), true, true))}><RotateCcw size={13} />Deshacer aplicación</button>}
            {preparation.loading && <p className="equivalents-note">La propuesta automática se prepara por separado; puedes confirmar tus porciones actuales.</p>}
            <PreferencesPanel preferences={preferences} onChange={setPreference} />
          </div>
        </section>
      </div>
    </div>

    {saveState === "error" && <p role="alert" className="energy-alert equivalents-save-alert">No se pudo guardar el cuadro. Pulsa Confirmar para intentarlo de nuevo.</p>}
    <footer className="energy-actions equivalents-actions">
      <button type="button" className="equivalents-back" onClick={onGoToMacros}><ArrowLeft size={15} /> Macros</button>
      <div className="energy-save-status" role="status">
        {saveState === "saving" ? <LoaderCircle size={14} className="animate-spin" /> : saveState === "error" ? <CircleAlert size={14} /> : <Check size={14} />}
        <span>{proposal ? "Vista previa · sin aplicar" : saveState === "saving" ? "Guardando cuadro…" : saveState === "dirty" ? "Cambios pendientes" : saveState === "error" ? "No se pudo guardar" : saveState === "saved" ? "Guardado" : "Guardado automático"}</span>
      </div>
      {headerActions && <div className="equivalents-ai">{headerActions}</div>}
      {proposal ? <>
        <button type="button" aria-label="Conservar mis porciones" className="energy-save-exit" onClick={explorer.discard}>Descartar</button>
        <button type="button" aria-label="Aplicar propuesta" className="energy-continue" onClick={applyProposal}>Aplicar propuesta <Check size={16} /></button>
      </> : <>
        {onSaveAndExit && <button type="button" className="energy-save-exit equivalents-save-exit" onClick={onSaveAndExit}><Save size={15} />Guardar y salir</button>}
        {!confirmed && <button type="button" aria-label="Confirmar equivalentes" disabled={saveState === "saving"} className="energy-continue equivalents-confirm" onClick={() => void confirm()}><Check size={16} />Confirmar</button>}
        {onContinue && <button type="button" className={confirmed ? "energy-continue" : "energy-save-exit"} onClick={onContinue}>Continuar a Tiempos <ArrowRight size={16} /></button>}
      </>}
    </footer>
  </section>;
}

export function DietEquivalentsStep({ headerActions, plan, targets, onSave, onDraftChange, onGoToMacros, onContinue, onSaveAndExit, catalog }: Props) {
  if (!targets) return <section className="diet-equivalents-step">
    <header className="energy-intro"><div><p className="energy-eyebrow">PASO 03 / 06</p><h1>Equivalentes</h1><p>Convierte la meta de alimentos en porciones para el día.</p></div></header>
    <div className="energy-card equivalents-missing"><span className="energy-icon energy-icon-method"><Calculator size={22} /></span><h2>Completa primero la distribución de macronutrientes.</h2><p>El cuadro dietosintético compara los equivalentes con el objetivo energético y los gramos derivados en el paso anterior.</p><button type="button" className="energy-continue" onClick={onGoToMacros}><ArrowLeft size={15} />Ir a macronutrientes</button></div>
  </section>;
  return <EquivalentEditor headerActions={headerActions} key={`${plan.id}:${targets.energy_kcal}:${targets.carbohydrate_g}:${targets.protein_g}:${targets.fat_g}`} catalog={catalog} plan={plan} targets={targets} onSave={onSave} onDraftChange={onDraftChange} onGoToMacros={onGoToMacros} onContinue={onContinue} onSaveAndExit={onSaveAndExit} />;
}
