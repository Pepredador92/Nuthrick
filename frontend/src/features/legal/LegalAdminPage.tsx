import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Heading } from "../admin/AdminPages";
import { adminRpc, type LegalDocument } from "./api";
import { LegalText } from "./LegalText";
import "./legal.css";
const labels: Record<string, string> = {draft: "Borrador", pending_review: "Pendiente de revisión", approved: "Aprobado"};
export function LegalAdminPage() {
  const { key = "terms" } = useParams();
  return <LegalAdminDocument key={key} documentKey={key} />;
}
function LegalAdminDocument({documentKey: key}: {documentKey: string}) {
  const [doc, setDoc] = useState<LegalDocument | null>(null);
  const [body, setBody] = useState("");
  const [acceptance, setAcceptance] = useState(false);
  const [editing, setEditing] = useState(false);
  const [effective, setEffective] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const install = useCallback((next: LegalDocument) => { setDoc(next); setBody(next.body); setAcceptance(next.requires_acceptance); setConfirmation(""); setEffective(""); setEditing(false); }, []);
  useEffect(() => {
    let active = true;
    void adminRpc<LegalDocument>("legal_admin_api", "get", {key}).then(next => { if (active) install(next); }).catch(e => {if (active) setError(e.message);});
    return () => {active = false;};
  }, [key, install]);
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!doc) return;
    setBusy(true); setError(""); setNotice("");
    try { install(await adminRpc<LegalDocument>("legal_admin_api", action, {key, version: doc.version, revision: doc.revision, ...extra})); setNotice(action === "approve" ? "Versión aprobada. Será pública desde su fecha efectiva." : "Documento guardado."); }
    catch (e) {setError(e instanceof Error ? e.message : "No pudimos guardar.");}
    finally {setBusy(false);}
  };
  const immutable = doc?.review_status === "approved" || doc?.version !== doc?.current_version;
  const unresolved = doc?.preview_body.includes("[PENDIENTE:") || doc?.preview_body.includes("{{");
  return <>
    <Heading eyebrow="Preparación legal" title="Documentos legales" text="Revisa cada versión y resuelve las decisiones pendientes antes de aprobar." />
    <nav className="legal-tabs" aria-label="Documentos legales">{[["terms", "Términos"], ["privacy", "Privacidad"], ["refunds", "Reembolsos"]].map(([id, title]) => <Link aria-current={key === id ? "page" : undefined} key={id} to={`/admin/legal/${id}`}>{title}</Link>)}</nav>
    {error && <p role="alert" className="admin-error">{error}</p>}{notice && <p role="status" className="admin-success">{notice}</p>}
    {!doc && !error && <p>Cargando documento…</p>}
    {doc && <>
      <section className="admin-card legal-toolbar"><div><h2>{doc.title} · v{doc.version}</h2><p>{labels[doc.review_status]} · {doc.effective_at ? `Fecha efectiva: ${new Date(doc.effective_at).toLocaleString("es-MX")}` : "Sin fecha efectiva"}</p><small>{doc.acceptances} aceptaciones de esta versión</small></div>
        <label className="admin-field">Historial<select aria-label="Versión" value={doc.version} disabled={busy} onChange={e => void act("get", {version: Number(e.target.value)})}>{doc.history.map(v => <option value={v.version} key={v.version}>v{v.version} · {labels[v.status]}</option>)}</select></label>
        {!immutable && <button className="admin-button secondary" onClick={() => setEditing(!editing)}>{editing ? "Cerrar editor" : "Editar borrador"}</button>}
        {doc.review_status === "approved" && doc.version === doc.current_version && <button className="admin-button secondary" disabled={busy} onClick={() => void act("new_version")}>Crear v{doc.version + 1}</button>}
      </section>
      {editing && <section className="admin-card legal-editor"><label className="admin-field">Texto del documento<textarea rows={22} value={body} onChange={e => setBody(e.target.value)} /></label><label><input type="checkbox" checked={acceptance} onChange={e => setAcceptance(e.target.checked)} /> Esta versión requerirá una nueva aceptación cuando el flujo correspondiente la solicite.</label><div className="legal-actions"><button className="admin-button secondary" disabled={busy} onClick={() => void act("save", {body, status: "draft", requires_acceptance: acceptance})}>Guardar borrador</button><button className="admin-button" disabled={busy} onClick={() => void act("save", {body, status: "pending_review", requires_acceptance: acceptance})}>Guardar para revisión</button></div></section>}
      <article className="admin-card legal-preview"><p className="admin-note">Vista previa {doc.review_status === "approved" ? "de la versión aprobada" : "privada · texto pendiente de aprobación"}</p><LegalText body={doc.preview_body} /></article>
      {doc.approved_at && <p className="admin-note">Aprobado el {new Date(doc.approved_at).toLocaleString("es-MX")} · administrador {doc.approved_by}</p>}
      {!immutable && <section className="admin-card legal-approval"><h2>Aprobar esta versión</h2><p>La aprobación conserva el texto en el historial. Para cambiarlo después deberás crear otra versión.</p>{unresolved && <p className="legal-decision">Quedan decisiones o contactos pendientes. Resuélvelos y guarda el texto para habilitar la aprobación.</p>}<label className="admin-field">Fecha efectiva<input type="datetime-local" value={effective} onChange={e => setEffective(e.target.value)} /></label><label className="admin-field">Escribe: Confirmo que este documento fue revisado y aprobado.<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label><button className="admin-button" disabled={busy || editing || unresolved || doc.review_status !== "pending_review" || !effective || confirmation !== "Confirmo que este documento fue revisado y aprobado."} onClick={() => void act("approve", {confirmation, effective_at: new Date(effective).toISOString(), preview_hash: doc.preview_hash})}>Aprobar v{doc.version}</button></section>}
      <p className="admin-note"><Link to="/admin/readiness">Volver a readiness</Link> · <Link to="/admin/operations">Configurar contactos reales</Link></p>
    </>}
  </>;
}
