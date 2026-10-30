"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  clearSimulation,
  simulationLaunch,
  simulationSnapshot,
  subscribeSimulation,
} from "./state";
import { leaveSimulation } from "./api";
import "./simulator.css";

export function SimulationBanner() {
  const active = Boolean(
    useSyncExternalStore(subscribeSimulation, simulationSnapshot, () => null),
  );
  const ref = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!active || !ref.current) return;
    document.documentElement.dataset.simulation = "true";
    const observer = new ResizeObserver(([entry]) =>
      document.documentElement.style.setProperty(
        "--simulation-bar-height",
        `${entry.borderBoxSize[0]?.blockSize ?? ref.current?.offsetHeight ?? 80}px`,
      ),
    );
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      delete document.documentElement.dataset.simulation;
      document.documentElement.style.removeProperty("--simulation-bar-height");
    };
  }, [active]);
  if (!active) return null;
  const launch = simulationLaunch()!;
  return (
    <aside ref={ref} className="simulation-banner" aria-label="Modo simulación">
      <div>
        <strong>SIMULACIÓN · {launch.run.plan_name}</strong>
        <span>
          Datos ficticios · Pagos simulados · IA de ejemplo sin tokens
        </span>
        {error && <p role="alert">{error}</p>}
      </div>
      <nav aria-label="Controles del simulador">
        <button onClick={() => window.location.assign("/")}>Landing</button>
        <button onClick={() => window.location.assign("/planes")}>
          Planes
        </button>
        <button onClick={() => window.location.assign("/app")}>
          Entrar al sistema
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void leaveSimulation().catch((e) => {
              setError(e.message);
              setBusy(false);
            });
          }}
        >
          {busy ? "Finalizando…" : "Salir / reiniciar"}
        </button>
        {error && (
          <button
            onClick={() => {
              clearSimulation();
              window.location.assign("/admin/simulator");
            }}
          >
            Volver a administración
          </button>
        )}
      </nav>
    </aside>
  );
}
