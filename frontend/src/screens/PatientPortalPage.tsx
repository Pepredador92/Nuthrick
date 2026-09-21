import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  LockKeyhole,
  LogOut,
  MessageCircle,
  NotebookPen,
} from "lucide-react";
import {
  portalApi,
  portalAction,
  PortalError,
  type PortalView,
} from "@/src/services/patientPortal";
import { PortalContentView } from "@/src/components/patients/PortalContentView";
import { PortalChat } from "@/src/components/patients/PortalChat";
import { PortalNotes } from "@/src/components/patients/PortalNotes";
import "./PatientPortal.css";

export function PatientPortalPage() {
  const location = useLocation();
  return <PatientPortalContent key={location.hash} />;
}
function PatientPortalContent() {
  const location = useLocation();
  const link = location.hash.slice(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [session, setSession] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [view, setView] = useState<PortalView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("today");
  const access = useMemo(() => ({ session }), [session]);
  function expire() {
    setSession("");
    setView(null);
    setChallenge("");
    setCode("");
    setError("Tu sesión terminó. Verifica tu correo para volver a entrar.");
  }
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
    const ttl = window.setTimeout(
      expire,
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearTimeout(ttl);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session, expiresAt]);
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
      const result = await portalApi<{ session: string; expiresAt: string }>(
        "portal_verify",
        { link, id: challenge, code },
      );
      setExpiresAt(result.expiresAt);
      setSession(result.session);
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
    } catch {
      /* Local erasure always completes. Server session expires after two hours. */
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
      <div className="portal-shell">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm font-semibold tracking-[.18em]">
            NUTHRICK{" "}
            <span className="ml-2 text-xs font-normal tracking-normal text-[#74817d]">
              Mi espacio
            </span>
          </p>
          {session && (
            <button
              className="flex min-h-11 items-center gap-2 text-sm"
              onClick={() => void logout()}
            >
              <LogOut size={16} />
              Salir
            </button>
          )}
        </div>
        {!session ? (
          <div className="portal-card mx-auto mt-12 max-w-md !p-8">
            <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-[#edf3e7]">
              <LockKeyhole size={25} />
            </div>
            <h1 className="text-2xl font-semibold">
              Tu seguimiento, en un solo lugar.
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#74817d]">
              Resultados, indicaciones y una conversación directa con tu
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
                  void (challenge ? verify() : sendCode());
                }}
              >
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
                {challenge && (
                  <div>
                    <p className="mb-3 text-sm text-[#53685e]">
                      Te enviamos un código. Revisa también la carpeta de correo
                      no deseado.
                    </p>
                    <label
                      htmlFor="portal-code"
                      className="text-sm font-semibold"
                    >
                      Código de 6 dígitos
                    </label>
                    <input
                      id="portal-code"
                      className="nuth-input mt-2 text-center text-xl tracking-[.3em]"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
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
                    : challenge
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
                  <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#e8c58b]">
                    Tu bienestar, paso a paso
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold">
                    Hola, {view.patientName}
                  </h1>
                  <p className="mt-3 text-sm text-[#c4d9cc]">
                    Te acompaña {view.professional.name}
                  </p>
                  {view.professional.title && (
                    <p className="mt-1 text-xs text-[#a7c1b2]">
                      {view.professional.title}
                    </p>
                  )}
                </header>
                <div
                  role="tablist"
                  aria-label="Mi espacio"
                  className="portal-tabs"
                >
                  {[
                    { id: "today", label: "Mi guía", Icon: ClipboardList },
                    { id: "results", label: "Resultados", Icon: Activity },
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
                      <Icon size={17} />
                      {label}
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
                  {tab === "chat" ? (
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
        <footer className="mt-10 text-center text-xs text-[#74817d]">
          Tu espacio privado de acompañamiento nutricional.
        </footer>
      </div>
    </main>
  );
}
