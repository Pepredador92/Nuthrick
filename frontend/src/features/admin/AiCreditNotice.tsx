import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { aiOperations } from "./aiOperations";
export function AiCreditNotice() {
  const [unread, setUnread] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void aiOperations<{ unread: number }>("alerts")
        .then((data) => {
          if (live) setUnread(data.unread);
        })
        .catch(() => {
          if (live) setUnread(null);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("ai-credit-alerts-updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("ai-credit-alerts-updated", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return (
    <Link
      className="admin-link ai-credit-notice"
      to="/admin/credits#avisos"
      aria-label={
        unread === null
          ? "Avisos de recargas, estado no disponible"
          : `Avisos de recargas: ${unread} sin leer`
      }
    >
      <Bell size={16} />
      <span>Recargas{unread !== null && unread > 0 ? ` · ${unread}` : ""}</span>
    </Link>
  );
}
