import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { LegalText } from "./LegalText";

type AcceptanceSource = "onboarding" | "checkout" | "settings" | "admin";
type RequiredReference = { document: string; version: number };
type PublicLegalDocument = {
  key: string;
  title: string;
  body: string;
  version: number;
  effective_at: string;
};

type AcceptanceState = {
  required: PublicLegalDocument[];
  accepted: Array<{ document: string; version: number; accepted_at: string }>;
};

async function loadAcceptanceState(): Promise<AcceptanceState> {
  const { data, error } = await supabase.rpc("my_legal_acceptances");
  if (error) throw error;
  const payload = (data ?? {}) as {
    required?: RequiredReference[];
    accepted?: AcceptanceState["accepted"];
  };
  const references = Array.isArray(payload.required) ? payload.required : [];
  const documents = await Promise.all(references.map(async (reference) => {
    const result = await supabase.rpc("legal_document", {
      p_document_key: reference.document,
    });
    if (result.error) throw result.error;
    const document = result.data as PublicLegalDocument | null;
    if (!document || document.version !== reference.version) {
      throw new Error("legal_version_changed");
    }
    return document;
  }));
  return {
    required: documents,
    accepted: Array.isArray(payload.accepted) ? payload.accepted : [],
  };
}

async function saveAcceptances(
  documents: PublicLegalDocument[],
  source: AcceptanceSource,
) {
  for (const document of documents) {
    const { error } = await supabase.rpc("record_legal_acceptance", {
      p_document_key: document.key,
      p_version: document.version,
      p_source: source,
    });
    if (error) throw error;
  }
}

export function LegalAcceptanceGate({
  source,
  children,
}: {
  source: AcceptanceSource;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<AcceptanceState | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      setState(await loadAcceptanceState());
    } catch {
      setError("No pudimos verificar las aceptaciones legales. Intenta nuevamente.");
    }
  }, []);

  useEffect(() => {
    // The async load updates UI state when the authenticated session is ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!state && !error) {
    return <p className="p-8" role="status">Verificando documentos legales…</p>;
  }
  if (error) {
    return (
      <section className="mx-auto max-w-2xl p-8" role="alert">
        <p>{error}</p>
        <button className="nuth-button-secondary mt-4" onClick={() => void load()}>
          Reintentar
        </button>
      </section>
    );
  }
  if (!state?.required.length) return <>{children}</>;

  const allChecked = state.required.every((document) => checked[document.key]);
  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      await saveAcceptances(state.required, source);
      await load();
    } catch {
      setError("No pudimos registrar tu aceptación. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-[#f7f8f4] px-5 py-8 sm:px-8">
      <section className="mx-auto max-w-3xl rounded-3xl border border-[#dfe5e1] bg-white p-6 sm:p-10" role="dialog" aria-labelledby="legal-acceptance-title">
        <p className="admin-eyebrow">REVISIÓN NECESARIA</p>
        <h1 id="legal-acceptance-title" className="mt-2 text-3xl font-semibold">Acepta los documentos vigentes</h1>
        <p className="mt-3 text-[#687b70]">Para continuar con tu espacio profesional y, cuando corresponda, contratar un plan, revisa y acepta cada versión indicada. Las páginas públicas siguen disponibles.</p>
        <div className="mt-7 space-y-8">
          {state.required.map((document) => (
            <article key={`${document.key}-${document.version}`} className="border-t border-[#e3e9e4] pt-6">
              <h2 className="text-xl font-semibold">{document.title} · v{document.version}</h2>
              <p className="mt-1 text-sm text-[#687b70]">Vigente desde {new Date(document.effective_at).toLocaleDateString("es-MX")}</p>
              <div className="mt-4 max-h-80 overflow-y-auto rounded-2xl bg-[#f7f8f4] p-4">
                <LegalText body={document.body} />
              </div>
              <label className="mt-4 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(checked[document.key])}
                  onChange={(event) => setChecked((current) => ({ ...current, [document.key]: event.target.checked }))}
                />
                <span>He leído y acepto {document.title} v{document.version}.</span>
              </label>
            </article>
          ))}
        </div>
        {error && <p className="mt-5 text-sm text-[#984a39]" role="alert">{error}</p>}
        <button className="nuth-button mt-7" disabled={!allChecked || busy} onClick={() => void accept()}>
          {busy ? "Guardando aceptación…" : "Aceptar y continuar"}
        </button>
      </section>
    </main>
  );
}
