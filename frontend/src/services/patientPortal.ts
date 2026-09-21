import { supabase } from "@/src/lib/supabase";
import type {
  PortalContent,
  SharedResult,
} from "../../../supabase/functions/agenda/portal-content";
export type { PortalContent, SharedResult };
export type { PortalPlan } from "../../../supabase/functions/agenda/portal-plan";
export type PortalAccess = { patientId: string } | { session: string };
export type PortalView = {
  patientName: string;
  professional: { name: string; title: string | null };
  shared: PortalContent;
  revision: number;
  publishedAt: string | null;
  unread: number;
  enabled?: boolean;
  link?: string | null;
  expiresAt?: string | null;
};
export type PortalMessage = {
  id: string;
  sender: "patient" | "professional";
  body: string;
  created_at: string;
};
export type PortalNote = {
  id: string;
  body: string;
  done: boolean;
  updated_at: string;
};
export type MessagePage = {
  messages: PortalMessage[];
  before: { id: string; at: string } | null;
};
const errors: Record<string, string> = {
  invalid_goal: "El objetivo de la consulta cambió o ya no está disponible. Actualiza la selección antes de publicar.",
  document_too_large: "El plan es demasiado extenso para exportarlo. Revisa su contenido con tu nutriólogo.",
  invalid_plan:
    "Este plan no está publicado, fue archivado o no puede mostrarse. Revísalo en el Taller de dietas.",
  identity_confirmation_required:
    "Confirma que identificaste al paciente antes de generar su código.",
  portal_unavailable:
    "Este acceso no está disponible o tu sesión terminó. Abre tu enlace y solicita un nuevo código.",
  invalid_code:
    "El código no es válido o ya venció. Revisa el correo o solicita otro.",
  email_required:
    "Agrega el correo del paciente a su ficha antes de crear su enlace.",
  stale_revision:
    "Otra ventana actualizó lo compartido. Recarga antes de volver a publicar.",
  invalid_consultation:
    "Solo puedes compartir consultas finalizadas y resultados de este paciente. Actualiza la selección.",
  invalid_input: "Revisa los campos y sus límites antes de continuar.",
  rate_limited: "Espera unos minutos antes de volver a intentar.",
  note_limit:
    "Puedes conservar hasta 100 notas. Elimina alguna que ya no necesites.",
  unauthorized: "Vuelve a iniciar sesión como nutriólogo.",
  mail_delivery_unknown:
    "No pudimos confirmar el envío. Revisa tu correo antes de solicitar otro código.",
  mail_not_connected:
    "El envío de correo necesita que el nutriólogo reconecte su cuenta.",
};
export class PortalError extends Error {
  constructor(public code: string) {
    super(
      errors[code] || "No pudimos completar la operación. Intenta de nuevo.",
    );
  }
}
export async function portalApi<T>(
  op: string,
  data: Record<string, unknown>,
  owner = false,
): Promise<T> {
  const session = owner
    ? (await supabase.auth.getSession()).data.session
    : null;
  if (owner && !session) throw new PortalError("unauthorized");
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agenda`,
    {
      method: "POST",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ ...data, op }),
    },
  );
  const result = (await response.json()) as { error?: string };
  if (!response.ok || result.error)
    throw new PortalError(result.error || "unavailable");
  return result as T;
}
export function portalAction<T>(
  access: PortalAccess,
  action: string,
  data: Record<string, unknown> = {},
) {
  const owner = "patientId" in access;
  return portalApi<T>(
    owner ? "portal_owner" : "portal_patient",
    { ...data, ...access, action },
    owner,
  );
}
export function portalLink(token: string) {
  return `${window.location.origin}/mi-espacio#${token}`;
}
