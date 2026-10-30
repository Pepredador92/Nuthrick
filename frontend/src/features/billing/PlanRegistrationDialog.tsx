import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  MailCheck,
  X,
} from "lucide-react";
import { useAuth } from "@/src/features/auth/AuthProvider";
import { supabase } from "@/src/lib/supabase";
import { authRedirectUrl } from "@/src/lib/site";
import { Field, Input } from "@/src/components/ui/FormField";
import { OnboardingPage } from "@/src/screens/OnboardingPage";
import { type Plan } from "@/src/features/admin/api";
import { isSimulation } from "@/src/features/simulator/state";
import { signIntoSimulation } from "@/src/features/simulator/api";
import { CheckoutChoice } from "./CheckoutChoice";
import { rememberPlan } from "./returnToPlan";
import { money, type Interval } from "./api";
import "./PlanRegistrationDialog.css";

function authMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    invalid_credentials: "Revisa tu correo y contraseña e intenta de nuevo.",
    email_not_confirmed: "Confirma tu correo antes de iniciar sesión.",
    weak_password:
      "Elige una contraseña más segura, con al menos 8 caracteres.",
    over_request_rate_limit: "Espera un momento antes de volver a intentarlo.",
    over_email_send_rate_limit:
      "Espera unos minutos antes de solicitar otro correo.",
    user_already_exists:
      "Esta cuenta ya existe. Elige «Iniciar sesión» para continuar.",
    signup_disabled:
      "El registro no está disponible temporalmente. Intenta más tarde.",
  };
  return code && messages[code]
    ? messages[code]
    : "No pudimos completar el acceso. Revisa los datos y vuelve a intentarlo.";
}

export function PlanRegistrationDialog({
  plan,
  interval,
  close,
}: {
  plan: Plan;
  interval: Interval;
  close: () => void;
}) {
  const { user, profile, loading, configurationReady } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [error, setError] = useState("");
  const stage = !user ? 0 : !profile?.onboarding_completed ? 1 : 2;
  const amount = interval === "annual" ? plan.annual_price : plan.monthly_price;
  function changeBusy(value: boolean) {
    busyRef.current = value;
    setBusy(value);
  }

  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const previousGutter = document.documentElement.style.scrollbarGutter;
    document.documentElement.style.scrollbarGutter = "stable";
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.scrollbarGutter = previousGutter;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (plan.id) rememberPlan(plan.id, interval);
  }, [plan.id, interval]);
  useEffect(() => {
    panel.current?.scrollTo({ top: 0, behavior: "instant" });
    const field = panel.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]),button:not(:disabled),select',
    );
    field?.focus({ preventScroll: true });
  }, [stage, confirmation, mode, loading]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || !plan.id) return;
    setError("");
    if (!configurationReady) {
      setError(
        "El acceso no está disponible temporalmente. Intenta más tarde.",
      );
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    rememberPlan(plan.id, interval);
    changeBusy(true);
    try {
      if (isSimulation()) {
        if (mode === "login") await signIntoSimulation();
        else setConfirmation(true);
      } else if (mode === "login") {
        const result = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (result.error) throw result.error;
      } else {
        const result = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: authRedirectUrl("/auth/callback"),
            data: { registration_plan: { id: plan.id, interval } },
          },
        });
        if (result.error) throw result.error;
        if (!result.data.session) setConfirmation(true);
      }
    } catch (cause) {
      setError(authMessage(cause));
    } finally {
      changeBusy(false);
    }
  }
  async function google() {
    if (busyRef.current || !plan.id) return;
    setError("");
    changeBusy(true);
    rememberPlan(plan.id, interval);
    try {
      if (isSimulation()) await signIntoSimulation();
      else {
        const result = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: authRedirectUrl("/auth/callback") },
        });
        if (result.error) throw result.error;
      }
    } catch (cause) {
      setError(authMessage(cause));
    } finally {
      changeBusy(false);
    }
  }
  async function confirmSimulation() {
    if (busyRef.current) return;
    changeBusy(true);
    setError("");
    try {
      await signIntoSimulation();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos confirmar la cuenta de prueba.",
      );
    } finally {
      changeBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="plan-registration-dialog"
      aria-labelledby="plan-registration-title"
      aria-describedby="plan-registration-selection"
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) close();
      }}
    >
      <header className="plan-registration-header">
        <div>
          <p className="plan-registration-eyebrow">
            TU NUEVO ESPACIO PROFESIONAL
          </p>
          <h2 id="plan-registration-title">
            {stage === 0
              ? "Comienza con tu cuenta"
              : stage === 1
                ? "Dale forma a tu espacio"
                : "Confirma tu plan"}
          </h2>
          <p id="plan-registration-selection">
            <strong>{plan.name}</strong>
            <span>·</span>
            {interval === "monthly" ? "Mensual" : "Anual"}
            {amount !== null && (
              <>
                <span>·</span>
                {money((amount ?? 0) * 100, plan.currency)}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="plan-registration-close"
          disabled={busy}
          onClick={close}
          aria-label="Cerrar registro"
        >
          <X size={21} />
        </button>
      </header>
      <ol className="plan-registration-steps" aria-label="Avance del registro">
        {["Cuenta", "Perfil", "Plan"].map((label, index) => (
          <li
            key={label}
            className={
              index === stage
                ? "is-current"
                : index < stage
                  ? "is-complete"
                  : ""
            }
            aria-current={index === stage ? "step" : undefined}
          >
            <span>{index < stage ? <Check size={13} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div
        ref={panel}
        className="plan-registration-body"
        aria-busy={loading || busy}
      >
        {loading ? (
          <p className="plan-registration-loading" role="status">
            <LoaderCircle size={20} className="animate-spin" />
            Preparando tu cuenta…
          </p>
        ) : stage === 0 ? (
          confirmation ? (
            <section className="plan-registration-confirmation">
              <span className="plan-registration-mail">
                <MailCheck size={30} />
              </span>
              <h3>Confirma tu correo</h3>
              <p>
                {isSimulation()
                  ? "La confirmación se simula dentro de este recorrido."
                  : `Te enviamos un enlace a ${email.trim()}. Ábrelo para confirmar tu cuenta y continuar con el plan ${plan.name}.`}
              </p>
              <p className="plan-registration-muted">
                Tu plan y la modalidad seleccionada se conservarán.
              </p>
              {isSimulation() && (
                <button
                  className="nuth-button"
                  disabled={busy}
                  onClick={() => void confirmSimulation()}
                >
                  Simular confirmación del correo <ArrowRight size={17} />
                </button>
              )}
              <button
                type="button"
                className="plan-registration-link"
                disabled={busy}
                onClick={() => {
                  setConfirmation(false);
                  setMode("login");
                  setError("");
                }}
              >
                Ya confirmé mi correo · iniciar sesión
              </button>
            </section>
          ) : (
            <section className="plan-registration-account">
              <p className="plan-registration-intro">
                {mode === "register"
                  ? "Crea tu cuenta para continuar con el plan que elegiste."
                  : "Inicia sesión para continuar con tu plan seleccionado."}
              </p>
              <button
                type="button"
                className="plan-registration-google"
                disabled={busy || !configurationReady}
                onClick={() => void google()}
              >
                <span aria-hidden="true">G</span>Continuar con Google
              </button>
              <div className="plan-registration-divider">
                <span />o continúa con email
                <span />
              </div>
              <form
                onSubmit={(event) => void authenticate(event)}
                className="plan-registration-form"
              >
                <Field label="Email" name="plan-registration-email">
                  <Input
                    id="plan-registration-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    disabled={busy}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="tu@email.com"
                  />
                </Field>
                <Field label="Contraseña" name="plan-registration-password">
                  <div className="plan-registration-password">
                    <Input
                      id="plan-registration-password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      autoComplete={
                        mode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                      value={password}
                      disabled={busy}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Mínimo 8 caracteres"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña"
                      }
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </Field>
                <button
                  className="nuth-button plan-registration-submit"
                  disabled={busy || !configurationReady}
                >
                  {busy ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : (
                    <ArrowRight size={18} />
                  )}{" "}
                  {mode === "register"
                    ? "Crear cuenta y continuar"
                    : "Iniciar sesión y continuar"}
                </button>
              </form>
              <p className="plan-registration-switch">
                {mode === "register"
                  ? "¿Ya tienes una cuenta?"
                  : "¿Aún no tienes cuenta?"}{" "}
                <button
                  type="button"
                  className="plan-registration-link"
                  disabled={busy}
                  onClick={() => {
                    setMode((value) =>
                      value === "register" ? "login" : "register",
                    );
                    setError("");
                  }}
                >
                  {mode === "register" ? "Iniciar sesión" : "Crear cuenta"}
                </button>
              </p>
            </section>
          )
        ) : stage === 1 ? (
          <OnboardingPage embedded onBusyChange={changeBusy} />
        ) : (
          <CheckoutChoice
            plan={plan}
            interval={interval}
            close={close}
            embedded
            onBusyChange={changeBusy}
          />
        )}
        {error && (
          <p className="plan-registration-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="plan-registration-footer">
        <button
          type="button"
          className="plan-registration-link"
          disabled={busy}
          onClick={close}
        >
          Volver a comparar planes
        </button>
        <span>Tu selección se mantiene durante el registro.</span>
      </footer>
    </dialog>
  );
}
