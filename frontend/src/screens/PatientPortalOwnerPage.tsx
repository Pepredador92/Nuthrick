import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Eye,
  History,
  Link2,
  MessageCircle,
  QrCode,
  ShieldCheck,
  ListChecks,
} from "lucide-react";
import { getPatient } from "@/src/services/patients";
import { loadLongitudinalHistory } from "@/src/services/longitudinalHistory";
import type { LongitudinalHistory } from "@/src/features/evolution/longitudinal";
import { numericPoints } from "@/src/features/evolution/exportEvolution";
import { classificationSummary } from "@/src/features/evolution/clinicalSummary";
import { emptyProgressReferences, weightReference } from "@/src/features/evolution/progressReferences";
import { consultationLabel } from "@/src/features/patients/patientUtils";
import { isPortalSomatochart, sharedSomatoValue } from "@/src/features/patients/portalSomatochart";
import {
  portalAction,
  portalLink,
  type PortalContent,
  type PortalView,
  type SharedResult,
} from "@/src/services/patientPortal";
import {
  PortalContentView,
  portalDate,
} from "@/src/components/patients/PortalContentView";
import { PortalChat } from "@/src/components/patients/PortalChat";
import { PortalAccessCode } from "@/src/components/patients/PortalAccessCode";
import { PortalPlanSharing } from "@/src/components/patients/PortalPlanSharing";
import { PortalGoal } from "@/src/components/patients/PortalGoal";
import { PortalQrDialog } from "@/src/components/patients/PortalQrDialog";
import { appendComposedText, composePatientInstructions } from "@/src/features/consultations/composeClinicalText";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import "./PatientPortal.css";

const empty: PortalContent = {
  goal: "",
  instructions: "",
  results: [],
  consultations: [],
};

function portalProgressPresentation(series: LongitudinalHistory["series"][number], history: LongitudinalHistory) {
  if (series.conceptCode !== "weight" && series.conceptCode !== "bmi") return undefined;
  const summary = classificationSummary(series, history.series, emptyProgressReferences);
  const displayed = summary.displayed?.classification;
  const displayedPoint = summary.displayed?.point;
  const classification = displayed && displayedPoint ? {
    label: displayed.label,
    origin: displayed.origin,
    source: displayed.source,
    consultationId: displayedPoint.consultation_id,
    marker: displayed.marker,
    low: displayed.low,
    high: displayed.high,
    rules: displayed.rules.map((rule) => ({ id: rule.id, label: rule.label, lower: rule.lower, upper: rule.upper })),
  } : undefined;
  const latest = numericPoints(series).at(-1);
  const reference = series.conceptCode === "weight" && latest ? weightReference(latest, history.series, emptyProgressReferences) : null;
  const weightReferenceData = reference && (reference.recorded || reference.interval || reference.target) ? {
    ...(reference.recorded ? { recorded: reference.recorded } : {}),
    ...(reference.interval ? { interval: reference.interval } : {}),
    ...(reference.target ? { target: reference.target } : {}),
  } : undefined;
  if (!classification && !summary.current?.reason && !weightReferenceData) return undefined;
  return {
    ...(classification ? { classification } : {}),
    ...(summary.current?.reason ? { currentReason: summary.current.reason } : {}),
    ...(weightReferenceData ? { weightReference: weightReferenceData } : {}),
  };
}

export function PatientPortalOwnerPage() {
  const { patientId = "" } = useParams();
  return <OwnerPortal key={patientId} patientId={patientId} />;
}
function OwnerPortal({ patientId }: { patientId: string }) {
  const [searchParams] = useSearchParams();
  const access = useMemo(() => ({ patientId }), [patientId]);
  const [view, setView] = useState<PortalView | null>(null);
  const [history, setHistory] = useState<LongitudinalHistory | null>(null);
  const [draft, setDraft] = useState<PortalContent>(empty);
  const [selected, setSelected] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [instructionParts, setInstructionParts] = useState({
    action: "",
    timing: "",
    alternative: "",
    review: "",
  });
  const [tab, setTab] = useState(
    searchParams.get("tab") === "chat" ? "chat" : "share",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<"link" | "revoke" | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void Promise.all([
      portalAction<PortalView>(access, "view"),
      getPatient(patientId),
      loadLongitudinalHistory(patientId),
    ])
      .then(([data, patient, history]) => {
        if (!active) return;
        setView(data);
        setDraft(data.shared);
        setSelected(data.shared.results.map((r) => r.id));
        setEmail(patient?.email || "");
        setHistory(history);
        setError("");
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [access, patientId, retry]);
  // Only finalized records are offered, never draft/private interview answers.
  const consultations = useMemo(
    () =>
      (history?.consultations || [])
        .filter((c) => c.status === "completed" && !c.deleted_at)
        .sort((a, b) => b.consultation_date.localeCompare(a.consultation_date))
        .slice(0, 100),
    [history],
  );
  const pendingConsultations = (history?.consultations || []).filter((c) => c.status === "draft" && !c.deleted_at).length;
  const resultOptions = useMemo(() => {
    const valid = new Set(consultations.map((c) => c.id));
    const options = (history?.series || [])
      .map((s) => {
        const presentation = history ? portalProgressPresentation(s, history) : undefined;
        const classifications = history ? new Map(classificationSummary(s, history.series, emptyProgressReferences).history.map(({ point, classification }) => [point.consultation_id, classification?.label])) : new Map<string, string | undefined>();
        return {
          id: s.id,
          label: s.label,
          unit: s.unit || "",
          conceptCode: s.conceptCode,
          visualization: s.visualization,
          presentation,
          method: [s.method, s.provenance]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 300),
          category:
            s.catalogCategory ||
            {
              measurements: "Mediciones",
              calculations: "Datos calculados",
              bioimpedance: "Bioimpedancia",
              laboratories: "Laboratorios",
            }[s.category],
          points: s.points
            .filter((p) => valid.has(p.consultation_id))
            .map((p) => ({
              consultationId: p.consultation_id,
              date: p.consultation_date,
              value: s.visualization === "somatochart" ? sharedSomatoValue(p.coordinates, p.display_value) : p.display_value,
              ...(classifications.get(p.consultation_id) ? { classificationLabel: classifications.get(p.consultation_id) } : {}),
            })),
        };
      })
      .filter((s) => s.points.length);
    const current = new Set(options.map((s) => s.id));
    return [
      ...options,
      ...draft.results
        .filter((r) => !current.has(r.id))
        .map((r) => ({ ...r, category: "Compartidos anteriormente" })),
    ];
  }, [history, consultations, draft.results]);
  const content = useMemo<PortalContent>(
    () => ({
      ...draft,
      results: resultOptions
        .filter((s) => selected.includes(s.id))
        .map(({ id, label, unit, method, conceptCode, visualization, presentation, points }): SharedResult => ({
          id,
          label,
          unit,
          method,
          ...(conceptCode ? { conceptCode } : {}),
          ...(visualization ? { visualization } : {}),
          ...(presentation ? { presentation } : {}),
          points,
        })),
    }),
    [draft, resultOptions, selected],
  );
  const groups = [...new Set(resultOptions.map((r) => r.category))];
  const dirty = view && JSON.stringify(content) !== JSON.stringify(view.shared);
  async function refresh() {
    const next = await portalAction<PortalView>(access, "view");
    setView(next);
    return next;
  }
  async function manage(action: "link" | "revoke") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await portalAction(access, action);
      await refresh();
      setConfirm(null);
      setNotice(
        action === "link"
          ? "Enlace listo. Puedes copiarlo y compartirlo con este paciente."
          : "Acceso revocado. Las sesiones anteriores ya no funcionan.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!view) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await portalAction(access, "publish", {
        shared: content,
        revision: view.revision,
      });
      const next = await refresh();
      setDraft(next.shared);
      setNotice(
        "Información publicada. El paciente verá únicamente esta selección.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    if (!view?.link) return;
    try {
      await navigator.clipboard.writeText(portalLink(view.link));
      setNotice(
        "Enlace copiado. Envíalo únicamente al paciente correspondiente.",
      );
    } catch {
      setError(
        "No se pudo copiar. Selecciona y copia el enlace que aparece abajo.",
      );
    }
  }
  if (loading)
    return <LoadingState label="Preparando el espacio del paciente…" />;
  if (!view)
    return (
      <ErrorState
        message={error || "No pudimos cargar el portal."}
        onRetry={() => {
          setLoading(true);
          setRetry((x) => x + 1);
        }}
      />
    );
  return (
    <div className="w-full min-w-0 py-3">
      <Link
        to={`/app/patients/${patientId}`}
        className="mb-5 inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft size={16} />
        Volver a la ficha
      </Link>
      <header className="portal-hero">
        <p className="text-xs uppercase tracking-[.18em] text-[#e8c58b]">
          Superlink del paciente
        </p>
        <h1 className="mt-3 text-3xl font-semibold">{view.patientName}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#c4d9cc]">
          Decide qué compartir y mantén la conversación en un espacio privado.
        </p>
      </header>
      <section className="portal-card mt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck size={18} />
              {view.enabled ? "Acceso habilitado" : "Acceso no disponible"}
            </h2>
            <p className="mt-2 text-sm text-[#74817d]">
              {email
                ? `Código por correo a ${email} o generado por ti.`
                : "Sin correo registrado. Puedes generar un código tras verificar al paciente."}
            </p>
            {view.enabled && view.expiresAt && (
              <p className="mt-1 text-xs text-[#74817d]">
                Enlace válido hasta {portalDate(view.expiresAt)}.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {view.enabled && (
              <button className="nuth-button" onClick={() => void copy()}>
                <Copy size={16} />
                Copiar superlink
              </button>
            )}
            {view.enabled && view.link && (
              <button className="nuth-button-secondary" onClick={() => setQrOpen(true)}>
                <QrCode size={16} />
                Mostrar QR
              </button>
            )}
            <button
              disabled={busy}
              className="nuth-button-secondary"
              onClick={() => setConfirm("link")}
            >
              <Link2 size={16} />
              {view.enabled ? "Renovar enlace" : "Crear enlace"}
            </button>
            {view.enabled && (
              <button
                disabled={busy}
                className="px-2 text-sm text-[#a4513d]"
                onClick={() => setConfirm("revoke")}
              >
                Revocar acceso
              </button>
            )}
          </div>
        </div>
        {view.enabled && view.link && (
          <input
            className="nuth-input mt-4 !text-xs"
            aria-label="Enlace privado del paciente"
            readOnly
            value={portalLink(view.link)}
            onFocus={(e) => e.target.select()}
          />
        )}
        {qrOpen && view.enabled && view.link && (
          <PortalQrDialog
            url={portalLink(view.link)}
            patientName={view.patientName}
            onClose={() => setQrOpen(false)}
          />
        )}
        {confirm && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[#ead7b4] bg-[#fffaf0] p-4"
          >
            <p className="text-sm">
              {confirm === "link"
                ? `Se habilitará el acceso con código ${email ? "por correo o generado por ti" : "generado por ti tras verificar al paciente"}. Cualquier enlace y sesión anterior dejará de funcionar. Solo verá la información y el plan que decidas compartir.`
                : "Se cerrará el acceso del paciente. No se borran el expediente, los mensajes ni sus notas."}
            </p>
            <div className="mt-3 flex gap-4">
              <button
                className="nuth-button"
                disabled={busy}
                onClick={() => void manage(confirm)}
              >
                {confirm === "link" ? "Crear enlace protegido" : "Revocar"}
              </button>
              <button disabled={busy} onClick={() => setConfirm(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        {view.enabled && (
          <PortalAccessCode key={view.link} patientId={patientId} />
        )}
      </section>
      {tab === "share" && <PortalPlanSharing patientId={patientId} />}
      {notice && (
        <p role="status" className="mt-4 rounded-xl bg-[#edf5e9] p-4 text-sm">
          {notice}
        </p>
      )}
      {error && (
        <div className="mt-4">
          <ErrorState message={error} />
        </div>
      )}
      <nav className="portal-tabs" aria-label="Administrar superlink">
        {[
          { id: "share", text: "Qué compartir", Icon: ShieldCheck },
          { id: "preview", text: "Vista del paciente", Icon: Eye },
          { id: "chat", text: "Chat", Icon: MessageCircle },
        ].map(({ id, text, Icon }) => (
          <button
            key={id}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setNotice("");
            }}
          >
            <Icon size={17} />
            {text}
            {id === "chat" && view.unread > 0 && (
              <span className="portal-count">{view.unread}</span>
            )}
          </button>
        ))}
      </nav>
      {tab === "chat" ? (
        view.enabled ? (
          <PortalChat
            key={patientId}
            access={access}
            counterpart={view.patientName}
          />
        ) : (
          <div className="portal-card">
            Crea un enlace protegido para iniciar la conversación. Cualquiera de
            los dos puede escribir primero.
          </div>
        )
      ) : tab === "preview" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#fff7e5] p-4">
            <p className="text-sm">
              {dirty
                ? "Vista previa de los cambios, todavía sin publicar."
                : "Esta es la información compartida."}
            </p>
            <button
              className="nuth-button"
              disabled={busy || !dirty || content.results.length > 60}
              onClick={() => void publish()}
            >
              {busy ? "Publicando…" : "Publicar para el paciente"}
            </button>
          </div>
          <PortalContentView content={content} />
        </>
      ) : (
        <div className="space-y-5">
          <section className="portal-card">
            <h2 className="font-semibold">Su guía nutricional</h2>
            <PortalGoal patientId={patientId} content={draft} onChange={setDraft}/>
            <label
              htmlFor="share-instructions"
              className="mb-2 mt-5 block text-sm font-semibold"
            >
              Indicaciones nutricionales
            </label>
            <textarea
              id="share-instructions"
              className="nuth-input min-h-44"
              maxLength={12000}
              value={draft.instructions}
              onChange={(e) =>
                setDraft({ ...draft, instructions: e.target.value })
              }
              placeholder="Escribe aquí las indicaciones que deseas que pueda consultar."
            />
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start gap-2">
                <ListChecks size={17} className="mt-0.5 text-amber-800" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-amber-950">Organizar indicaciones acordadas</h3>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    Completa con lo conversado con el paciente. Este apoyo solo ordena tus palabras y no agrega recomendaciones clínicas. Después, pídele que explique con sus palabras cómo pondrá en práctica el acuerdo y aclara cualquier duda.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {([
                  ["action", "Qué hará", "Acción acordada, con palabras sencillas"],
                  ["timing", "Cuándo o con qué frecuencia", "Solo si se acordó"],
                  ["alternative", "Una alternativa si se complica", "Opción conversada"],
                  ["review", "Qué revisarán juntos", "Tema para la próxima revisión"],
                ] as const).map(([key, label, placeholder]) => (
                  <label key={key} className="block text-xs font-medium text-[#52685d]">
                    {label}
                    <input
                      className="nuth-input mt-1.5 !bg-white"
                      maxLength={500}
                      value={instructionParts[key]}
                      placeholder={placeholder}
                      onChange={(event) => setInstructionParts((current) => ({ ...current, [key]: event.target.value }))}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="mt-3 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!instructionParts.action.trim()}
                onClick={() => setDraft((current) => ({
                  ...current,
                  instructions: appendComposedText(current.instructions, composePatientInstructions(instructionParts)),
                }))}
              >
                <ListChecks size={14} className="mr-1.5 inline" aria-hidden="true" />
                Agregar texto ordenado
              </button>
            </div>
          </section>
          <section className="portal-card">
            <h2 className="font-semibold">
              Resultados que puede ver{" "}
              <span className="portal-count">{selected.length}/60</span>
            </h2>
            <p className="mt-2 text-sm text-[#74817d]">
              Solo datos de consultas finalizadas. Cada método se conserva por
              separado.
            </p>
            <div className="mt-4 rounded-xl border border-[#dfe7e1] bg-[#f8faf7] p-4">
              <p className="text-sm leading-6 text-[#52685d]">Para mostrar gráficas en el Superlink: cierra la consulta, selecciona aquí los resultados y pulsa Revisar antes de publicar. En la vista previa, confirma con Publicar para el paciente.</p>
              {pendingConsultations > 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {pendingConsultations === 1 ? "Tienes 1 consulta pendiente de cerrar. Sus mediciones aún no están disponibles para compartir." : `Tienes ${pendingConsultations} consultas pendientes de cerrar. Sus mediciones aún no están disponibles para compartir.`}
              </p>}
              <Link className="nuth-button-secondary mt-3 justify-center !text-sm" to={`/app/patients/${patientId}?view=history`}><History size={16} aria-hidden="true" />Ir al historial de consultas</Link>
            </div>
            {!resultOptions.length && (
              <p className="mt-4 text-sm">
                No hay resultados de consultas finalizadas para compartir.
              </p>
            )}
            {groups.map((group) => (
              <fieldset key={group} className="mt-5">
                <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#74817d]">
                  {group}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {resultOptions
                    .filter((r) => r.category === group)
                    .map((r) => (
                      <label
                        key={r.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${selected.includes(r.id) ? "border-[#96b99c] bg-[#edf5e9]" : "border-[#e3e9e1]"}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          disabled={
                            !selected.includes(r.id) && selected.length >= 60
                          }
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, r.id]
                                : selected.filter((id) => id !== r.id),
                            )
                          }
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">{r.label}</span>
                          {r.method && (
                            <span className="mt-1 block break-words text-xs text-[#74817d]">
                              {r.method}
                            </span>
                          )}
                          <span className="mt-1 block text-xs text-[#74817d]">
                            {r.points.length} consultas · {r.unit}
                          </span>
                          {isPortalSomatochart(r) && <span className="mt-2 block text-xs font-medium text-[#315e4f]">Muestra la somatocarta con los puntos de cada consulta.</span>}
                        </span>
                      </label>
                    ))}
                </div>
              </fieldset>
            ))}
          </section>
          <section className="portal-card">
            <h2 className="font-semibold">Historial visible</h2>
            <p className="mt-2 text-sm leading-6 text-[#74817d]">
              Selecciona consultas finalizadas y redacta un resumen para el
              paciente. Las entrevistas, valoraciones y notas clínicas privadas
              no se incluyen. Se ofrecen las 100 consultas finalizadas más
              recientes.
            </p>
            <div className="mt-5 space-y-4">
              {consultations.map((c) => {
                const shared = draft.consultations.find((s) => s.id === c.id);
                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-[#e3e9e1] p-4"
                  >
                    <label className="flex items-center gap-3 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={!!shared}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            consultations: e.target.checked
                              ? [
                                  ...draft.consultations,
                                  {
                                    id: c.id,
                                    date: c.consultation_date,
                                    title: consultationLabel(c),
                                    summary: "",
                                  },
                                ]
                              : draft.consultations.filter(
                                  (s) => s.id !== c.id,
                                ),
                          })
                        }
                      />
                      {consultationLabel(c)} · {portalDate(c.consultation_date)}
                    </label>
                    {shared && (
                      <textarea
                        className="nuth-input mt-3 min-h-24"
                        aria-label={`Resumen para el paciente del ${portalDate(c.consultation_date)}`}
                        placeholder="Resumen visible para el paciente (opcional)."
                        maxLength={2000}
                        value={shared.summary}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            consultations: draft.consultations.map((s) =>
                              s.id === c.id
                                ? { ...s, summary: e.target.value }
                                : s,
                            ),
                          })
                        }
                      />
                    )}
                  </div>
                );
              })}
              {!consultations.length && (
                <p className="text-sm text-[#74817d]">
                  Todavía no hay consultas finalizadas.
                </p>
              )}
            </div>
          </section>
          <div className="flex justify-end">
            <button className="nuth-button" onClick={() => setTab("preview")}>
              <Eye size={17} />
              Revisar antes de publicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
