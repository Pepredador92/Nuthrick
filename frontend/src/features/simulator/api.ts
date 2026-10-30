import { supabase } from "@/src/lib/supabase";
import {
  clearSimulation,
  simulationLaunch,
  storeSimulation,
  updateSimulationRun,
  type SimulationLaunch,
  type SimulationRun,
} from "./state";

const messages: Record<string, string> = {
  admin_required: "Solo administración puede iniciar el simulador.",
  simulation_expired:
    "Este recorrido terminó o venció. Regresa a administración e inicia uno nuevo.",
  simulation_unavailable: "No pudimos preparar el recorrido de prueba.",
  simulation_promotion_unavailable:
    "Los códigos promocionales reales no se canjean en el simulador. Continúa sin código.",
  invalid_request: "Revisa el plan y las opciones del recorrido.",
};
export async function simulatorRequest<T>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const result = await supabase.functions.invoke("simulator", {
    body: { action, ...data },
  });
  if (result.error) {
    let code = "simulation_unavailable";
    try {
      const body = await result.error.context?.json();
      if (typeof body?.error === "string") code = body.error;
    } catch {
      /* Safe message only. */
    }
    throw new Error(
      messages[code] ??
        "No pudimos completar esta acción del simulador. Intenta nuevamente.",
    );
  }
  if (result.data?.error)
    throw new Error(
      messages[result.data.error] ?? "No pudimos continuar el recorrido.",
    );
  if (
    ["checkout", "change", "cancel", "resume"].includes(action) &&
    result.data?.id
  )
    updateSimulationRun(result.data as SimulationRun);
  return result.data as T;
}
export async function startSimulation(
  planId: string,
  scenario: "empty" | "examples",
) {
  const launch = await simulatorRequest<SimulationLaunch>("create", {
    plan_id: planId,
    scenario,
  });
  storeSimulation(launch);
  window.location.assign("/");
}
export async function signIntoSimulation() {
  const launch = simulationLaunch();
  if (!launch || Date.parse(launch.run.expires_at) <= Date.now())
    throw new Error(messages.simulation_expired);
  const { error } = await supabase.auth.setSession(launch.session);
  if (error) throw new Error(messages.simulation_expired);
}
export async function leaveSimulation() {
  const launch = simulationLaunch();
  if (launch) {
    // Before simulated registration the prepared session is not installed yet.
    const current = await supabase.auth.getSession();
    if (!current.data.session) await supabase.auth.setSession(launch.session);
    await simulatorRequest("end");
    await supabase.auth.signOut({ scope: "local" });
  }
  clearSimulation();
  window.location.assign("/admin/simulator");
}
export const listSimulations = () => simulatorRequest<SimulationRun[]>("list");
