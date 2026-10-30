import type { Session } from "@supabase/supabase-js";

const key = "nuthrick:simulation:v1";
export const simulationAuthKey = "nuthrick-simulation-auth-v1";
export type SimulationRun = {
  id: string;
  professional_id: string;
  plan_id: string;
  plan_name: string;
  scenario: "empty" | "examples";
  state: "active" | "ended";
  purchased: boolean;
  expires_at: string;
  created_at: string;
};
export type SimulationLaunch = {
  run: SimulationRun;
  session: Pick<Session, "access_token" | "refresh_token">;
};
export function simulationLaunch(): SimulationLaunch | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value?.run?.id &&
      value?.run?.professional_id &&
      typeof value.session?.access_token === "string" &&
      typeof value.session?.refresh_token === "string"
      ? (value as SimulationLaunch)
      : null;
  } catch {
    return null;
  }
}
export const isSimulation = () => simulationLaunch() !== null;
export function storeSimulation(value: SimulationLaunch) {
  sessionStorage.removeItem(simulationAuthKey);
  sessionStorage.removeItem(`${simulationAuthKey}:${value.run.id}`);
  sessionStorage.removeItem("nuthrick:billing-selection");
  sessionStorage.setItem(key, JSON.stringify(value));
}
export function updateSimulationRun(run: SimulationRun) {
  const launch = simulationLaunch();
  if (!launch || launch.run.id !== run.id) return;
  sessionStorage.setItem(key, JSON.stringify({ ...launch, run }));
  window.dispatchEvent(new Event("nuthrick:simulation"));
}
export function rememberSimulationSession(session:Session) {
  const launch=simulationLaunch();
  if(!launch||session.user.id!==launch.run.professional_id||session.user.app_metadata.nuthrick_simulation!==true)return;
  sessionStorage.setItem(key,JSON.stringify({...launch,session:{access_token:session.access_token,refresh_token:session.refresh_token}}));
}
export function subscribeSimulation(listener: () => void) {
  window.addEventListener("nuthrick:simulation", listener);
  return () => window.removeEventListener("nuthrick:simulation", listener);
}
export function simulationSnapshot() {
  try {
    return typeof window === "undefined" ? null : sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
export function clearSimulation() {
  const launch=simulationLaunch();
  if(launch)sessionStorage.removeItem(`${simulationAuthKey}:${launch.run.id}`);
  sessionStorage.removeItem(simulationAuthKey);
  sessionStorage.removeItem(key);
  sessionStorage.removeItem("nuthrick:billing-selection");
  // Pending workflow drafts are keyed by the isolated professional UUID.
  // Real account drafts, theme and session are retained.
}
export function simulationPlanStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  return isSimulation() ? sessionStorage : localStorage;
}
