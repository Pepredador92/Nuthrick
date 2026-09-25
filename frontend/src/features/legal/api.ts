import { supabase } from "@/src/lib/supabase";
export type LegalDocument = {
  key: string; title: string; body: string; preview_body: string; preview_hash: string;
  version: number; current_version: number; revision: number;
  review_status: "draft" | "pending_review" | "approved";
  effective_at: string | null; published_at: string | null; approved_at: string | null;
  approved_by: string | null; requires_acceptance: boolean; acceptances: number;
  history: {version: number; status: string; effective_at: string | null}[];
};
const errors: Record<string, string> = {
  admin_required: "Esta cuenta no tiene permisos de administración.",
  confirmation_required: "Escribe la confirmación completa antes de continuar.",
  legal_version_changed: "El documento o sus contactos cambiaron. Recarga y revisa la vista previa.",
  legal_decisions_required: "Resuelve los campos PENDIENTE antes de aprobar.",
  legal_contact_required: "Confirma los contactos reales en Operaciones.",
  legal_effective_date_required: "Selecciona la fecha efectiva.",
  legal_review_required: "Guarda el documento como pendiente de revisión.",
  legal_version_immutable: "Esta versión está aprobada. Crea una nueva versión.",
  invalid_legal_document: "Revisa el texto: debe tener entre 100 y 60 000 caracteres.",
  email_configuration_required: "Faltan el proveedor, DNS o secretos del servicio de correo.",
  email_not_retryable: "Este mensaje no admite reenvío automático.",
  email_delivery_requires_reconciliation: "La ventana de envío seguro terminó. Revisa el mensaje en el proveedor antes de actuar.",
  test_recipient_limit: "Se permiten como máximo dos bandejas controladas.",
  test_recipient_required: "Autoriza primero la bandeja de pruebas.",
  invalid_email: "Revisa la dirección de correo.",
  invalid_sender: "El remitente debe pertenecer al dominio configurado.",
};
export function operationError(code: string) { return errors[code] ?? "No pudimos completar la operación. Revisa la configuración e intenta de nuevo."; }
export async function adminRpc<T>(name: "legal_admin_api" | "email_admin_api", action: string, input: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, {p_action: action, p_data: input});
  if (error) throw new Error(operationError(error.message));
  return data as T;
}
export async function emailWorker(action: "verify" | "worker") {
  const { data, error } = await supabase.functions.invoke("transactional-email", {body: {action}});
  if (error) {
    let code = "email_configuration_required";
    try { code = (await error.context?.json())?.error ?? code; } catch { /* No response body on network errors. */ }
    throw new Error(operationError(code));
  }
  if (data?.error) throw new Error(operationError(data.error));
  return data;
}
