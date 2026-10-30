import { simulationPlanStorage } from '@/src/features/simulator/state';

const key = "nuthrick:billing-selection";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function rememberPlan(id: string, interval: "monthly" | "annual") {
  if (!uuid.test(id)) return;
  try {
    simulationPlanStorage()?.setItem(key, JSON.stringify({ id, interval, at: Date.now() }));
  } catch { /* Login still works if storage is disabled. */ }
}
export function billingReturn() {
  try {
    const v = JSON.parse(simulationPlanStorage()?.getItem(key) ?? "null");
    if (
      v && uuid.test(v.id) && ["monthly", "annual"].includes(v.interval) &&
      Date.now() - v.at < 86400000
    ) return `/planes?plan=${v.id}&interval=${v.interval}`;
  } catch { /* Ignore invalid saved selection. */ }
  return null;
}
export function clearPlanReturn() {
  try {
    simulationPlanStorage()?.removeItem(key);
  } catch { /* Optional preference only. */ }
}
// A signup confirmation may open in a different browser. This metadata carries
// navigation intent only; the public catalog and billing server authorize plans.
export function registrationPlanReturn(metadata:unknown):string|null {
  const intent=(metadata as {registration_plan?:{id?:unknown;interval?:unknown}}|null)?.registration_plan;
  if(!intent||typeof intent.id!=='string'||!uuid.test(intent.id)||(intent.interval!=='monthly'&&intent.interval!=='annual'))return null;
  return `/planes?plan=${intent.id}&interval=${intent.interval}`;
}
