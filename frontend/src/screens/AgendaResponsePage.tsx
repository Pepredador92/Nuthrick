import { useEffect, useState } from "react";
import { Logo } from "@/src/components/ui/Logo";
import {
  agendaApi,
  agendaDate,
  type AgendaResult,
} from "@/src/services/agenda";

type Proposal = {
  name: string;
  start: string;
  end: string;
  timezone: string;
  modality: string;
  location?: { name: string; address: string };
  expiresAt: string;
  result?: AgendaResult;
};
export function AgendaResponsePage() {
  // The token is in the fragment, never in HTTP logs or Referrer. Clear the
  // address immediately; no third-party resources or analytics on this page.
  const [token] = useState(() => window.location.hash.slice(1));
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [result, setResult] = useState<AgendaResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
    let active = true;
    void agendaApi<Proposal>("response_info", { token })
      .then((p) => {
        if (active) {
          setProposal(p);
          if (p.result) setResult(p.result);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token]);
  const respond = async (decision: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setResult(await agendaApi<AgendaResult>("respond", { token, decision }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-[#f6f7f3] p-5 text-[#173d36]">
      <div className="mx-auto max-w-xl py-10">
        <Logo />
        <section className="mt-8 rounded-3xl border border-[#dce4df] bg-white p-6 sm:p-8">
          <h1 className="text-2xl font-semibold">
            {result
              ? result.status === "confirmed"
                ? "Tu cita quedó agendada."
                : "Respuesta registrada"
              : "Te proponen otro horario"}
          </h1>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-[#fff0e9] p-4 text-sm text-[#963f34]"
            >
              {error}
            </p>
          )}
          {!proposal && !error && <p className="mt-4">Abriendo propuesta…</p>}
          {proposal?.name && (
            <>
              <p className="mt-5 font-semibold">{proposal.name}</p>
              <p className="mt-3">
                {agendaDate(proposal.start, proposal.timezone)}
              </p>
              <p className="mt-2 text-sm">
                {proposal.timezone} ·{" "}
                {(Date.parse(proposal.end) - Date.parse(proposal.start)) /
                  60000}{" "}
                minutos
              </p>
              <p className="mt-3">
                {proposal.modality === "online"
                  ? "En línea"
                  : proposal.location?.name}
              </p>
              {proposal.location && (
                <p className="mt-2 text-sm">{proposal.location.address}</p>
              )}
            </>
          )}
          {proposal && !result && (
            <>
              <p className="mt-6 text-sm text-[#64786e]">
                El horario se comprobará de nuevo al aceptar. La propuesta vence
                el {agendaDate(proposal.expiresAt, proposal.timezone)}.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  className="nuth-button"
                  disabled={busy}
                  onClick={() => respond("accept")}
                >
                  Aceptar horario
                </button>
                <button
                  className="nuth-button-secondary"
                  disabled={busy}
                  onClick={() => respond("reject")}
                >
                  No me funciona
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
