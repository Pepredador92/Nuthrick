import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, ArrowRight } from "lucide-react";
import { portalApi } from "@/src/services/patientPortal";
import "./PatientMessagesPage.css";
type Conversation = {
  id: string;
  full_name: string;
  unread: number;
  last_message_at: string | null;
};
export function PatientMessagesPage() {
  const [patients, setPatients] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const unreadConversations = patients.filter((patient) => patient.unread > 0).length;
  useEffect(() => {
    let active = true,
      inFlight = false;
    async function load() {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const data = await portalApi<{ patients: Conversation[] }>(
          "portal_owner",
          { action: "inbox", search, offset: page * 50 },
          true,
        );
        if (active) {
          setPatients(data.patients);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }
    const debounce = window.setTimeout(() => void load(), 250);
    const poll = window.setInterval(() => void load(), 15000);
    return () => {
      active = false;
      window.clearTimeout(debounce);
      window.clearInterval(poll);
    };
  }, [page, search]);
  return (
    <section className="messages-workspace w-full min-w-0">
      <header className="messages-hero">
        <div>
          <p className="nuth-eyebrow">Acompañamiento</p>
          <h1 className="mt-2 text-3xl font-semibold">Mensajes</h1>
          <p className="mt-3 text-sm text-[#59716a]">
            Conversaciones privadas con tus pacientes. Los mensajes sin leer
            aparecen primero.
          </p>
        </div>
        <div className="messages-unread-card" aria-live="polite">
          <span className="text-xs font-semibold uppercase tracking-wide">
            Por atender
          </span>
          <strong>{unreadConversations}</strong>
          <span className="text-xs">
            {unreadConversations === 1
              ? "conversación sin leer"
              : "conversaciones sin leer"} en esta página
          </span>
        </div>
      </header>
      <div className="messages-search-card mt-5">
        <div>
          <p className="nuth-eyebrow">01 · Encuentra una conversación</p>
          <h2 className="mt-1 text-lg font-semibold">Busca por paciente</h2>
        </div>
        <label className="sr-only" htmlFor="conversation-search">
          Buscar paciente
        </label>
        <input
          id="conversation-search"
          className="nuth-input"
          placeholder="Buscar paciente…"
          value={search}
          maxLength={100}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
            setLoading(true);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mb-4 text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando conversaciones…</p>
      ) : (
        <div className="mt-5">
          <div className="messages-list-title mb-3">
            <p className="nuth-eyebrow">02 · Lee y responde</p>
            <h2 className="mt-1 text-lg font-semibold">
              Tus conversaciones <span>{patients.length}</span>
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {!patients.length && (
              <div className="p-10 text-center">
                <MessageCircle className="mx-auto mb-3 text-[#74817d]" />
                <p>Todavía no hay conversaciones aquí.</p>
                <p className="mt-2 text-sm text-[#74817d]">
                  Abre “Superlink y chat” en la ficha de un paciente para
                  comenzar.
                </p>
              </div>
            )}
            {patients.map((p) => (
              <Link
                key={p.id}
                to={`/app/patients/${p.id}/portal?tab=chat`}
                className={`messages-conversation-card flex min-w-0 items-center gap-3 rounded-2xl border p-4 ${p.unread > 0 ? "has-unread" : ""}`}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#eaf1e6]">
                  <MessageCircle size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.full_name}</span>
                  <span className="mt-1 block text-xs text-[#74817d]">
                    {p.last_message_at
                      ? `Último mensaje: ${new Date(p.last_message_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}`
                      : "Puedes iniciar la conversación"}
                  </span>
                </span>
                {p.unread > 0 && (
                  <span className="rounded-full bg-[#285d4b] px-3 py-1 text-xs text-white">
                    {p.unread} sin leer
                  </span>
                )}
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className="messages-pagination mt-5 flex justify-between">
        <button
          disabled={page === 0 || loading}
          onClick={() => {
            setPage((p) => p - 1);
            setLoading(true);
          }}
        >
          Anterior
        </button>
        <span className="text-sm text-[#74817d]">Página {page + 1}</span>
        <button
          disabled={patients.length < 50 || loading}
          onClick={() => {
            setPage((p) => p + 1);
            setLoading(true);
          }}
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
