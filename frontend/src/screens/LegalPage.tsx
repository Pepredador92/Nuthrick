import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/src/components/ui/Logo";
import { supabase } from "@/src/lib/supabase";
import { LegalText } from "../features/legal/LegalText";
import "../features/legal/legal.css";
type PublicDocument = {title: string; body: string; version: number; effective_at: string; review_status: string};
type LegalType = "privacy" | "terms" | "refunds";
export function LegalPage({type}: {type: LegalType}) { return <PublicLegalDocument key={type} type={type} />; }
function PublicLegalDocument({ type }: { type: LegalType }) {
  const [document, setDocument] = useState<PublicDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.rpc("legal_document", {p_document_key: type}).then(({data, error: problem}) => {if (active) {setDocument(data as PublicDocument | null); setError(Boolean(problem)); setLoading(false);}});
    return () => {active = false;};
  }, [type]);
  const title = {privacy: "Aviso de privacidad", terms: "Términos de uso", refunds: "Política de reembolsos"}[type];
  return <main className="min-h-screen bg-[#f7f8f4] px-5 py-6 sm:px-8"><div className="mx-auto max-w-4xl"><div className="flex items-center justify-between"><Logo /><Link to="/" className="text-sm font-semibold">Volver</Link></div><article className="mt-16 rounded-[30px] border border-[#dfe5e1] bg-white p-8 sm:p-12"><h1 className="text-4xl font-semibold">{title}</h1>{loading ? <p className="mt-8">Cargando documento…</p> : error ? <p role="alert" className="mt-8">No pudimos consultar el documento. Intenta de nuevo.</p> : document?.review_status === "approved" ? <><p className="mt-6">Versión {document.version} · Vigente desde {new Date(document.effective_at).toLocaleDateString("es-MX")}</p><LegalText body={document.body} /></> : <p className="mt-8 leading-8">El documento está en revisión y todavía no hay una versión aprobada y vigente publicada.</p>}</article></div></main>;
}
