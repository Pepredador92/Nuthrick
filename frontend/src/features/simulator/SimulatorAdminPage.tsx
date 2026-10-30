import { useEffect, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { adminRequest, type Catalog } from "@/src/features/admin/api";
import { listSimulations, simulatorRequest, startSimulation } from "./api";
import type { SimulationRun } from "./state";

export function SimulatorAdminPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [plan, setPlan] = useState("");
  const [scenario, setScenario] = useState<"empty" | "examples">("empty");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  useEffect(() => {
    let active = true;
    void Promise.all([adminRequest<Catalog>("catalog"), listSimulations()])
      .then(([c, r]) => {
        if (!active) return;
        setCatalog(c);
        setRuns(r);
        setPlan(c.plans.find((p) => p.active && !p.internal_only)?.id ?? "");
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function start() {
    setBusy(true);
    setError("");
    try {
      await startSimulation(plan, scenario);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos iniciar el recorrido.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <header className="admin-heading">
        <div>
          <p className="admin-eyebrow">EXPERIENCIA DEL USUARIO</p>
          <h1>Simulador de usuario</h1>
          <p className="admin-description">
            Recorre Nuthrick desde la landing con una cuenta de prueba y los
            permisos del plan que elijas.
          </p>
        </div>
      </header>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      <section className="admin-card max-w-3xl">
        <h2>Preparar recorrido</h2>
        <label className="admin-field mt-5">
          Plan inicial
          <select
            value={plan}
            disabled={busy || !catalog}
            onChange={(e) => setPlan(e.target.value)}
          >
            {catalog?.plans
              .filter((p) => p.active && !p.internal_only)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <fieldset className="my-6 space-y-3">
          <legend className="mb-3 font-semibold">Cómo empezar</legend>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="simulation-scenario"
              value="empty"
              checked={scenario === "empty"}
              disabled={busy}
              onChange={() => setScenario("empty")}
            />
            <span>
              <strong>Usuario nuevo</strong>
              <span className="block text-sm">
                Cuenta vacía para revisar el registro, la bienvenida y las
                primeras acciones.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="simulation-scenario"
              value="examples"
              checked={scenario === "examples"}
              disabled={busy}
              onChange={() => setScenario("examples")}
            />
            <span>
              <strong>Con datos de ejemplo</strong>
              <span className="block text-sm">
                Al confirmar el plan se agregarán un paciente ficticio y
                ejemplos de los módulos incluidos.
              </span>
            </span>
          </label>
        </fieldset>
        <p className="admin-note mb-5">
          Pagos simulados, mensajes externos suspendidos y respuestas de IA de
          ejemplo sin consumo de tokens. Usa únicamente datos ficticios. Cada
          recorrido tiene su propia cuenta; podrás volver a administración desde
          la barra del simulador.
        </p>
        <button
          className="admin-button"
          disabled={busy || !plan}
          onClick={() => void start()}
        >
          <Play size={17} />
          {busy
            ? "Preparando cuenta de prueba…"
            : "Iniciar recorrido desde la landing"}
        </button>
      </section>
      <section className="admin-card mt-6">
        <h2>Recorridos recientes</h2>
        <p className="admin-note">
          Reiniciar crea una cuenta vacía nueva y termina el recorrido anterior.
          Los expedientes reales se conservan.
        </p>
        {!runs.length ? (
          <p className="mt-4">Aún no has iniciado recorridos.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#dce5df]">
            {runs.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <strong>{r.plan_name}</strong>
                  <p className="text-sm">
                    {r.scenario === "empty" ? "Usuario nuevo" : "Con ejemplos"}{" "}
                    ·{" "}
                    {r.state === "active" && Date.parse(r.expires_at) > now
                      ? "Activo"
                      : "Finalizado"}{" "}
                    · {new Date(r.created_at).toLocaleString("es-MX")}
                  </p>
                </div>
                {r.state === "active" && (
                  <button
                    className="admin-button secondary"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void simulatorRequest("end_admin", { id: r.id })
                        .then(() => listSimulations())
                        .then(setRuns)
                        .catch((e) => setError(e.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Finalizar recorrido
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button
          className="admin-button secondary mt-5"
          disabled={busy || !plan}
          onClick={() => void start()}
        >
          <RotateCcw size={16} />
          Iniciar un recorrido nuevo
        </button>
      </section>
    </>
  );
}
