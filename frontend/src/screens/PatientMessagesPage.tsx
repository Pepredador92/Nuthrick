import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, ArrowRight } from "lucide-react";
import { portalApi } from "@/src/services/patientPortal";
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
    <section className="mx-auto max-w-3xl">
      <p className="nuth-eyebrow">Acompañamiento</p>
      <h1 className="mt-2 text-3xl font-semibold">Mensajes</h1>
      <p className="mt-3 text-sm text-[#74817d]">
        Conversaciones privadas con tus pacientes. Los mensajes sin leer
        aparecen primero.
      </p>
      <label className="sr-only" htmlFor="conversation-search">
        Buscar paciente
      </label>
      <input
        id="conversation-search"
        className="nuth-input my-6"
        placeholder="Buscar paciente…"
        value={search}
        maxLength={100}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
          setLoading(true);
        }}
      />
      {error && (
        <p role="alert" className="mb-4 text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando conversaciones…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#dfe7df] bg-white">
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
              className="flex items-center gap-4 border-b border-[#edf1ed] p-5 last:border-0 hover:bg-[#f6f9f2]"
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
      )}
      <div className="mt-5 flex justify-between">
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
