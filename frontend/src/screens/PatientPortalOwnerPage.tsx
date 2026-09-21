import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Eye,
  Link2,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { getPatient } from "@/src/services/patients";
import { loadLongitudinalHistory } from "@/src/services/longitudinalHistory";
import type { LongitudinalHistory } from "@/src/features/evolution/longitudinal";
import { consultationLabel } from "@/src/features/patients/patientUtils";
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
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import "./PatientPortal.css";

const empty: PortalContent = {
  goal: "",
  instructions: "",
  results: [],
  consultations: [],
};
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
  const [tab, setTab] = useState(
    searchParams.get("tab") === "chat" ? "chat" : "share",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<"link" | "revoke" | null>(null);
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
  const resultOptions = useMemo(() => {
    const valid = new Set(consultations.map((c) => c.id));
    const options = (history?.series || [])
      .map((s) => ({
        id: s.id,
        label: s.label,
        unit: s.unit || "",
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
            value: p.display_value,
          })),
      }))
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
        .map(({ id, label, unit, method, points }): SharedResult => ({
          id,
          label,
          unit,
          method,
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
    <div className="mx-auto max-w-5xl py-3">
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
