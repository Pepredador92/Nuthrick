import { UpcomingAppointments } from "@/src/components/agenda/UpcomingAppointments";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  Leaf,
  LockKeyhole,
  LogOut,
  MessageCircle,
  NotebookPen,
  Utensils,
} from "lucide-react";
import {
  portalApi,
  portalAction,
  PortalError,
  subscribePortalNotifications,
  getStoredPortalSession,
  storePortalSession,
  clearStoredPortalSession,
  type PortalView,
} from "@/src/services/patientPortal";
import { playNotificationSound } from "@/src/features/notifications/sound";
import { ThemeSwitcher } from "@/src/features/theme/ThemeSwitcher";
import { ShowcaseBackdrop } from "@/src/components/ui/ShowcaseBackdrop";
import { PortalCardHeading } from "@/src/components/patients/PortalCardHeading";
import { PortalContentView } from "@/src/components/patients/PortalContentView";
import { PortalChat } from "@/src/components/patients/PortalChat";
import { PortalNotes } from "@/src/components/patients/PortalNotes";
import { PortalPatientPlan } from "@/src/components/patients/PortalPlan";
import { PortalHomeSummary } from "@/src/components/patients/PortalHomeSummary";
import "./PatientPortal.css";

export function PatientPortalPage() {
  const location = useLocation();
  return <PatientPortalContent key={location.hash} />;
}
function PatientPortalContent() {
  const location = useLocation();
  const link = location.hash.slice(1);
  const hasValidLink = /^[A-Za-z0-9_-]{40,100}$/.test(link);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [method, setMethod] = useState<"email" | "professional">("email");
  const [session, setSession] = useState("");
  const [sessionReady, setSessionReady] = useState(!hasValidLink);
  const [view, setView] = useState<PortalView | null>(null);
  const [professionalOnline, setProfessionalOnline] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("today");
  const access = useMemo(() => ({ session }), [session]);
  const expire = useCallback(() => {
    void clearStoredPortalSession(link).catch(() => {});
    setSession("");
    setView(null);
    setChallenge("");
    setCode("");
    setError(
      "Tu sesión terminó. Solicita un nuevo código para volver a entrar.",
    );
  }, [link]);
  useEffect(() => {
    let active = true;
    if (!hasValidLink) return;
    void getStoredPortalSession(link)
      .then((stored) => {
        if (!active) return;
        if (stored) setSession(stored);
        setSessionReady(true);
      })
      .catch(() => {
        if (active) setSessionReady(true);
      });
    return () => { active = false; };
  }, [hasValidLink, link]);
  useEffect(() => {
    if (!session) return;
    let active = true,
      loading = false;
    const refresh = async () => {
      if (loading || document.visibilityState !== "visible") return;
      loading = true;
      try {
        const result = await portalAction<PortalView>({ session }, "view");
        if (active) {
          setView(result);
          setError("");
        }
      } catch (e) {
        if (active) {
          if (e instanceof PortalError && e.code === "portal_unavailable")
            expire();
          else setError((e as Error).message);
        }
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [expire, session]);
  useEffect(() => {
    if (!session || !link) return;
    let active = true;
    let stop: (() => void) | undefined;
    void subscribePortalNotifications(link, (event) => {
      if (!active) return;
      if (event.sender === "professional") playNotificationSound();
      void portalAction<PortalView>({ session }, "view")
        .then((next) => { if (active) setView(next); })
        .catch(() => { /* The regular refresh remains the fallback. */ });
    }).then((cleanup) => {
      if (active) stop = cleanup;
      else cleanup();
    }).catch(() => { /* Realtime is optional; polling remains authoritative. */ });
    return () => {
      active = false;
      stop?.();
    };
  }, [link, session]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void portalAction<{ online: boolean }>({ session }, "presence")
        .then(({ online }) => { if (active) setProfessionalOnline(online === true); })
        .catch(() => { if (active) setProfessionalOnline(false); });
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session]);
  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const result = await portalApi<{ id: string }>("portal_code", {
        link,
        email,
      });
      setChallenge(result.id);
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const result = await portalApi<{ session: string }>(
        method === "professional"
          ? "portal_verify_professional"
          : "portal_verify",
        { link, id: challenge, code },
      );
      setSession(result.session);
      try {
        await storePortalSession(link, result.session);
      } catch {
        setError(
          "Tu navegador no permitió guardar el acceso. Podrás continuar, pero tendrás que volver a identificarte si cierras esta página.",
        );
      }
      setCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await portalAction(access, "logout");
      await clearStoredPortalSession(link);
    } catch {
      setError("No pudimos cerrar tu sesión. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    setSession("");
    setView(null);
    setChallenge("");
    setCode("");
    setEmail("");
    setError("");
  }
  return (
    <main className="patient-portal">
      <ShowcaseBackdrop />
      <div className="portal-shell">
        <div className="portal-topbar">
          <div className="portal-brand"><span><Leaf size={21} aria-hidden="true" /></span><strong>Nuthrick</strong><span className="portal-brand-caption">Mi espacio</span></div>
          <div className="portal-topbar-actions"><ThemeSwitcher compact />{session && (
            <button
              className="portal-logout"
              onClick={() => void logout()}
            >
              <LogOut size={16} />
              Salir
            </button>
          )}</div>
        </div>
        {!sessionReady ? (
          <p role="status" className="portal-card mx-auto mt-12 max-w-md !p-8">
            Abriendo tu espacio…
          </p>
        ) : !session ? (
          <div className="portal-card mx-auto mt-12 max-w-md !p-8">
            <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-[#edf3e7]">
              <LockKeyhole size={25} />
            </div>
            <h1 className="text-2xl font-semibold">
              Tu seguimiento, en un solo lugar.
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#74817d]">
              Tu plan alimenticio, resultados y una conversación directa con tu
              nutriólogo.
            </p>
            {!/^[A-Za-z0-9_-]{40,100}$/.test(link) ? (
              <p className="mt-6 text-sm">
                Abre el enlace privado que te compartió tu nutriólogo para
                entrar.
              </p>
            ) : (
              <form
                className="mt-6 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void (challenge || method === "professional"
                    ? verify()
                    : sendCode());
                }}
              >
                <div
                  className="flex flex-col gap-2"
                  aria-label="Método de acceso"
                >
                  <button
                    type="button"
                    className="nuth-button-secondary justify-center"
                    aria-pressed={method === "email"}
                    disabled={busy}
                    onClick={() => {
                      setMethod("email");
                      setCode("");
                      setChallenge("");
                      setError("");
                    }}
                  >
                    Recibir código por correo
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary justify-center"
                    aria-pressed={method === "professional"}
                    disabled={busy}
                    onClick={() => {
                      setMethod("professional");
                      setCode("");
                      setChallenge("");
                      setError("");
                    }}
                  >
                    Tengo un código de mi nutriólogo
                  </button>
                </div>
                {method === "email" && (
                  <div>
                    <label
                      htmlFor="portal-email"
                      className="text-sm font-semibold"
                    >
                      Correo registrado con tu nutriólogo
                    </label>
                    <input
                      id="portal-email"
                      type="email"
                      className="nuth-input mt-2"
                      required
                      maxLength={320}
                      autoComplete="email"
                      value={email}
                      disabled={!!challenge || busy}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                )}
                {(challenge || method === "professional") && (
                  <div>
                    <p className="mb-3 text-sm text-[#53685e]">
                      {method === "professional"
                        ? "Escribe el código de un solo uso que te entregó tu nutriólogo. No necesitas correo."
                        : "Te enviamos un código. Revisa también la carpeta de correo no deseado."}
                    </p>
                    <label
                      htmlFor="portal-code"
                      className="text-sm font-semibold"
                    >
                      Código de {method === "professional" ? 8 : 6} dígitos
                    </label>
                    <input
                      id="portal-code"
                      className="nuth-input mt-2 text-center text-xl tracking-[.3em]"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern={
                        method === "professional" ? "[0-9]{8}" : "[0-9]{6}"
                      }
                      maxLength={method === "professional" ? 8 : 6}
                      required
                      value={code}
                      onChange={(e) =>
                        setCode(e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </div>
                )}
                <button
                  disabled={busy}
                  className="nuth-button w-full justify-center"
                >
                  {busy
                    ? "Un momento…"
                    : challenge || method === "professional"
                      ? "Entrar a mi espacio"
                      : "Recibir código de acceso"}
                </button>
                {challenge && (
                  <button
                    type="button"
                    className="w-full min-h-11 text-sm underline"
                    disabled={busy}
                    onClick={() => {
                      setChallenge("");
                      setCode("");
                    }}
                  >
                    Solicitar otro código o cambiar correo
                  </button>
                )}
              </form>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm text-red-700">
                {error}
              </p>
            )}
            <p className="mt-6 text-xs leading-5 text-[#74817d]">
              El enlace por sí solo no permite ver tu información. No compartas
              tus códigos de acceso.
            </p>
          </div>
        ) : (
          <>
            {!view ? (
              <p role="status">Abriendo tu espacio…</p>
            ) : (
              <>
                <header className="portal-hero">
                  <div className="portal-hero-identity">
                    <span className="portal-patient-avatar" aria-hidden="true">{view.patientName.trim().split(/\s+/).slice(0, 2).map((name) => name[0]).join("")}</span>
                    <div>
                      <p className="portal-hero-eyebrow">Tu bienestar, paso a paso</p>
                      <h1>Hola, {view.patientName}</h1>
                      <p className="portal-hero-description">Tu plan, tus avances y tu nutriólogo, en un mismo lugar.</p>
                    </div>
                  </div>
                  <div className="portal-professional">
                    <p>Te acompaña {view.professional.name}</p>
                    {view.professional.title && <p className="portal-professional-title">{view.professional.title}</p>}
                    <span className={`portal-presence${professionalOnline ? " is-online" : ""}`} aria-label={professionalOnline ? "Tu nutriólogo está en línea" : "Tu nutriólogo no está en línea"}>
                      <span aria-hidden="true">{professionalOnline ? "●" : "○"}</span>
                      {professionalOnline ? "Nutriólogo en línea" : "Nutriólogo desconectado"}
                    </span>
                  </div>
                </header>
                <div
                  role="tablist"
                  aria-label="Mi espacio"
                  className="portal-tabs"
                >
                  {[
                    { id: "plan", label: "Mi plan", Icon: Utensils },
                    { id: "today", label: "Mi guía", Icon: ClipboardList },
                    { id: "results", label: "Resultados", Icon: Activity },
                    { id: "appointments", label: "Mis citas", Icon: CalendarDays },
                    { id: "history", label: "Consultas", Icon: CalendarDays },
                    { id: "chat", label: "Chat", Icon: MessageCircle },
                    { id: "notes", label: "Mis notas", Icon: NotebookPen },
                  ].map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      id={`tab-${id}`}
                      role="tab"
                      aria-selected={tab === id}
                      aria-controls="portal-panel"
                      onClick={() => setTab(id)}
                    >
                      <span className={`portal-tab-icon is-${id}`}><Icon size={18} aria-hidden="true" /></span>
                      <span>{label}</span>
                      {id === "chat" && view.unread > 0 && (
                        <span className="portal-count">{view.unread}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div
                  id="portal-panel"
                  role="tabpanel"
                  aria-labelledby={`tab-${tab}`}
                >
                  {tab === "appointments" ? (
                    <section className="portal-card portal-panel-card">
                      <PortalCardHeading icon={CalendarDays} title="Mis citas" subtitle="Tus próximos encuentros" tone="blue" />
                      <div className="portal-card-body"><UpcomingAppointments key={session} session={session}/></div>
                    </section>
                  ) : tab === "plan" ? (
                    <PortalPatientPlan access={access} />
                  ) : tab === "today" ? (
                    <PortalHomeSummary access={access} view={view} onOpenTab={(nextTab) => {
                      setTab(nextTab);
                      document.getElementById("portal-panel")?.scrollIntoView?.({ block: "start" });
                    }} />
                  ) : tab === "chat" ? (
                    <PortalChat
                      key={session}
                      access={access}
                      counterpart={view.professional.name}
                      onExpired={expire}
                    />
                  ) : tab === "notes" ? (
                    <PortalNotes key={session} session={session} />
                  ) : (
                    <PortalContentView
                      content={view.shared}
                      section={tab as "today" | "results" | "history"}
                      showMethod={false}
                    />
                  )}
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm text-red-700">
                {error}
              </p>
            )}
          </>
        )}
        <footer className="portal-footer">
          <LockKeyhole size={13} aria-hidden="true" /> Tu espacio privado de acompañamiento nutricional.
        </footer>
      </div>
    </main>
  );
}
