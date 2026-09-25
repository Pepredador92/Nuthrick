import { Bell, Check, ExternalLink, LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "@/src/features/notifications/useNotifications";
import { notificationPath, relativeNotificationDate } from "@/src/features/notifications/model";

export function NotificationCenter() {
  const navigate = useNavigate();
  const { items, unreadCount, loading, error, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#dce3de] bg-white text-[#52675e] shadow-sm hover:bg-[#f3f7f3]"
        aria-label={unreadCount ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#b54e3c] px-1.5 py-0.5 text-[10px] font-bold leading-4 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && (
        <section className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[#dfe7e1] bg-white shadow-2xl" aria-label="Centro de notificaciones">
          <header className="flex items-center justify-between gap-3 border-b border-[#e7ede8] px-4 py-3">
            <div><h2 className="text-sm font-semibold text-[#24463b]">Notificaciones</h2><p className="mt-0.5 text-[11px] text-[#7b8982]">Actividad de mensajes y agenda</p></div>
            <button type="button" className="rounded-lg p-1.5 text-[#7b8982] hover:bg-[#f3f7f3]" aria-label="Cerrar notificaciones" onClick={() => setOpen(false)}><X size={16} /></button>
          </header>
          {error && <p role="alert" className="px-4 py-3 text-xs text-[#984a39]">No pudimos actualizar las notificaciones.</p>}
          {loading ? <div className="grid place-items-center px-4 py-10"><LoaderCircle className="animate-spin text-[#477363]" size={20} /></div> : !items.length ? <p className="px-4 py-10 text-center text-sm text-[#718078]">No tienes actividad nueva.</p> : <ul className="max-h-[min(420px,calc(100dvh-180px))] overflow-y-auto">{items.map((item) => <li key={item.id} className="border-b border-[#eef2ef] last:border-0"><button type="button" className={`w-full px-4 py-3 text-left transition hover:bg-[#f7faf7] ${item.read_at ? "" : "bg-[#f1f7f2]"}`} onClick={() => { void markRead(item.id); setOpen(false); navigate(notificationPath(item)); }}><span className="flex items-start gap-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read_at ? "bg-transparent" : "bg-[#c56c42]"}`} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#315e4f]">{item.title}</span><span className="mt-1 block text-xs text-[#7b8982]">{relativeNotificationDate(item.created_at)}</span></span><ExternalLink className="mt-1 shrink-0 text-[#8b9992]" size={14} /></span></button></li>)}</ul>}
          {!!items.length && <footer className="border-t border-[#e7ede8] px-4 py-2.5 text-[11px] text-[#7b8982]"><Check size={13} className="mr-1 inline" />Al abrir una notificación queda marcada como leída.</footer>}
        </section>
      )}
    </div>
  );
}
