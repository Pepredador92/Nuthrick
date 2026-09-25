import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/src/components/ui/Logo";
import { supabase } from "@/src/lib/supabase";

type LegalType = "privacy" | "terms" | "refunds";
type LegalDocument = { version: number; effective_at: string | null; review_status: "draft" | "pending_review" | "approved" };

export function LegalPage({ type }: { type: LegalType }) {
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const privacy = type === "privacy";
  const refunds = type === "refunds";
  const title = privacy ? "Aviso de privacidad" : refunds ? "Política de reembolsos" : "Términos de uso";
  useEffect(() => {
    let active = true;
    void supabase.rpc("legal_document", { p_document_key: type }).then(({ data }) => { if (active && data) setDocument(data as LegalDocument); });
    return () => { active = false; };
  }, [type]);
  const approved = document?.review_status === "approved";
  return <main className="min-h-screen bg-[#f7f8f4] px-5 py-6 sm:px-8"><div className="mx-auto max-w-4xl"><div className="flex items-center justify-between"><Logo /><Link to="/" className="text-sm font-semibold">Volver</Link></div><article className="mt-16 rounded-[30px] border border-[#dfe5e1] bg-white p-8 sm:p-12"><p className="nuth-eyebrow">{approved ? "Documento vigente" : "Documento preliminar"}</p><h1 className="mt-4 text-4xl font-semibold tracking-[-.04em]">{title}</h1><p className="mt-6 leading-8 text-[#687672]">{approved ? "Consulta aquí la versión vigente de este documento." : "Este texto es un marcador de estructura para PRE-LIVE y deberá revisarse y aprobarse legalmente antes de un lanzamiento público comercial."}</p><div className="mt-8 rounded-2xl bg-[#f3f6f2] p-4 text-sm text-[#687672]">Versión {document?.version ?? 1} · {approved && document?.effective_at ? `Vigente desde ${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(document.effective_at))}` : "Pendiente de aprobación humana"}</div>{!approved && <><h2 className="mt-10 text-xl font-semibold">Estado</h2><p className="mt-4 leading-8 text-[#687672]">El contenido definitivo está pendiente de aprobación. Nuthrick no presenta esta página como una política legal vigente.</p></>}{!refunds && <><h2 className="mt-10 text-xl font-semibold">Principios de esta versión</h2><ul className="mt-4 list-disc space-y-3 pl-6 text-[#687672]"><li>Las cuentas se autentican mediante Supabase Auth.</li><li>La información privada se separa por profesional mediante RLS.</li><li>La página pública sólo consume una proyección de datos aprobados.</li><li>La publicación comercial requiere textos definitivos.</li></ul></>}</article></div></main>;
}
