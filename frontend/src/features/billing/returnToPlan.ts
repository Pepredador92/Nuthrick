const key = "nuthrick:billing-selection";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function rememberPlan(id: string, interval: "monthly" | "annual") {
  if (!uuid.test(id)) return;
  try {
    localStorage.setItem(key, JSON.stringify({ id, interval, at: Date.now() }));
  } catch { /* Login still works if storage is disabled. */ }
}
export function billingReturn() {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      v && uuid.test(v.id) && ["monthly", "annual"].includes(v.interval) &&
      Date.now() - v.at < 86400000
    ) return `/planes?plan=${v.id}&interval=${v.interval}`;
  } catch { /* Ignore invalid saved selection. */ }
  return null;
}
export function clearPlanReturn() {
  try {
    localStorage.removeItem(key);
  } catch { /* Optional preference only. */ }
}
