import { useCallback, useEffect, useRef, useState } from "react";
import { Send, MessageCircle } from "lucide-react";
import {
  portalAction,
  type PortalAccess,
  type PortalMessage,
  type MessagePage,
} from "@/src/services/patientPortal";

export function PortalChat({
  access,
  counterpart,
  onExpired,
}: {
  access: PortalAccess;
  counterpart: string;
  onExpired?: () => void;
}) {
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [before, setBefore] = useState<MessagePage["before"]>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [olderBusy, setOlderBusy] = useState(false);
  const nonce = useRef<{ body: string; id: string } | null>(null);
  const latest = useRef<{ id: string; at: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  const olderHeight = useRef<number | null>(null);
  const accessKey = "patientId" in access ? access.patientId : access.session;
  const professional = "patientId" in access;
  const stableAccess = useRef(access);
  const expiry = useRef(onExpired);
  useEffect(() => {
    stableAccess.current = access;
    expiry.current = onExpired;
  }, [access, onExpired]);
  const merge = (rows: PortalMessage[]) =>
    setMessages((old) =>
      [...new Map([...old, ...rows].map((m) => [m.id, m])).values()].sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      ),
    );
  const refresh = useCallback(async () => {
    const result = await portalAction<MessagePage>(
      stableAccess.current,
      "messages",
      latest.current ? { after: latest.current } : {},
    );
    merge(result.messages);
    // Read only what the open chat actually received, not unseen later rows.
    const last = result.messages.at(-1);
    if (last) latest.current = { id: last.id, at: last.created_at };
    if (last && document.visibilityState === "visible")
      await portalAction(stableAccess.current, "read", { id: last.id });
    return result;
  }, []);
  useEffect(() => {
    let active = true,
      inFlight = false;
    const load = async (first = false) => {
      if (inFlight || (!first && document.visibilityState !== "visible"))
        return;
      inFlight = true;
      try {
        const result = await portalAction<MessagePage>(
          stableAccess.current,
          "messages",
          latest.current ? { after: latest.current } : {},
        );
        if (!active) return;
        merge(result.messages);
        if (first) setBefore(result.before);
        const last = result.messages.at(-1);
        if (last) latest.current = { id: last.id, at: last.created_at };
        if (last && document.visibilityState === "visible")
          await portalAction(stableAccess.current, "read", { id: last.id });
        if (active) setError("");
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : "No pudimos actualizar la conversación.",
          );
          if ((e as { code?: string }).code === "portal_unavailable")
            expiry.current?.();
        }
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    void load(true);
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [accessKey]);
  useEffect(() => {
    const target = list.current;
    if (!target || !messages.length) return;
    if (olderHeight.current !== null) {
      target.scrollTop += target.scrollHeight - olderHeight.current;
      olderHeight.current = null;
      return;
    }
    if (
      firstScroll.current ||
      target.scrollHeight - target.scrollTop - target.clientHeight < 220
    )
      target.scrollTop = target.scrollHeight;
    firstScroll.current = false;
  }, [messages.length]);
  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError("");
    const body = draft.trim();
    if (nonce.current?.body !== body)
      nonce.current = { body, id: crypto.randomUUID() };
    try {
      await portalAction(access, "message", {
        body,
        clientId: nonce.current.id,
      });
      setDraft("");
      nonce.current = null;
      await refresh();
      if (list.current) list.current.scrollTop = list.current.scrollHeight;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo enviar. Tu mensaje sigue aquí.",
      );
    } finally {
      setSending(false);
    }
  }
  async function older() {
    if (!before) return;
    setOlderBusy(true);
    try {
      const result = await portalAction<MessagePage>(access, "messages", {
        before,
      });
      if (result.messages.length && list.current)
        olderHeight.current = list.current.scrollHeight;
      merge(result.messages);
      setBefore(result.before);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOlderBusy(false);
    }
  }
  return (
    <section
      className="portal-chat"
      aria-label={`Conversación con ${counterpart}`}
    >
      <header className="flex items-center gap-3 border-b border-[#e5ece6] p-5">
        <MessageCircle size={22} />
        <div>
          <h2 className="font-semibold">{counterpart}</h2>
          <p className="text-xs text-[#74817d]">
            Mensajes privados · La respuesta puede no ser inmediata.
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="px-5 pt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div
        ref={list}
        role="log"
        aria-label="Mensajes"
        className="portal-chat-log"
      >
        {before && (
          <button
            disabled={olderBusy}
            className="mx-auto block text-sm underline"
            onClick={() => void older()}
          >
            Ver mensajes anteriores
          </button>
        )}
        {loading ? (
          <p role="status">Cargando conversación…</p>
        ) : (
          !messages.length && (
            <div className="py-14 text-center text-[#74817d]">
              <MessageCircle className="mx-auto mb-3" />
              <p>La conversación empieza contigo.</p>
              <p className="mt-1 text-sm">Escribe una pregunta o un saludo.</p>
            </div>
          )
        )}
        {messages.map((m) => (
          <article
            key={m.id}
            className={`portal-message ${m.sender === (professional ? "professional" : "patient") ? "is-mine" : ""}`}
          >
            <p className="mb-1 text-xs opacity-75">
              {m.sender === (professional ? "professional" : "patient")
                ? "Tú"
                : counterpart}
            </p>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            <time
              className="mt-2 block text-right text-[11px] opacity-70"
              dateTime={m.created_at}
            >
              {new Date(m.created_at).toLocaleString("es-MX", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </time>
          </article>
        ))}
      </div>
      <form
        className="border-t border-[#e5ece6] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="portal-message">
          Escribe un mensaje
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="portal-message"
            className="nuth-input min-h-20 flex-1 resize-y"
            placeholder="Escribe un mensaje…"
            maxLength={4000}
            value={draft}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            className="nuth-button !px-4"
            disabled={sending || !draft.trim()}
            aria-label="Enviar mensaje"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="mt-2 text-xs text-[#74817d]">
          Este chat no es un servicio de urgencias.
        </p>
      </form>
    </section>
  );
}
