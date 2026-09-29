import { useEffect } from "react";
import { supabase } from "@/src/lib/supabase";

const idleAfterMs = 5 * 60 * 1000;

/** Each visible, active tab owns a short lease tied to the authenticated session. */
export function useProfessionalPresence(professionalId: string | undefined) {
  useEffect(() => {
    if (!professionalId) return;
    const client = crypto.randomUUID();
    let lastActivity = Date.now();
    let online = false;
    let pending = Promise.resolve();
    const publish = (value: boolean) => {
      online = value;
      // Serialize renewals and the final offline event from this tab.
      pending = pending.then(async () => {
        await supabase.rpc("professional_presence_ping", { p_client: client, p_online: value });
      }).catch(() => { /* A failed renewal expires on the server after 90 seconds. */ });
    };
    const refresh = () => {
      const active = document.visibilityState === "visible" && navigator.onLine && Date.now() - lastActivity < idleAfterMs;
      if (active || online) publish(active);
    };
    const activity = () => { lastActivity = Date.now(); if (!online) refresh(); };
    const visibility = () => {
      if (document.visibilityState === "visible") lastActivity = Date.now();
      refresh();
    };
    const leave = () => publish(false);
    refresh();
    const interval = window.setInterval(refresh, 30000);
    document.addEventListener("pointerdown", activity);
    document.addEventListener("keydown", activity);
    document.addEventListener("scroll", activity, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("pagehide", leave);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("pointerdown", activity);
      document.removeEventListener("keydown", activity);
      document.removeEventListener("scroll", activity, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("pagehide", leave);
      publish(false);
    };
  }, [professionalId]);
}
