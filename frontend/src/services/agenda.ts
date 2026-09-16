import { supabase } from "@/src/lib/supabase";

export type AgendaSlot = {
  start: string;
  end: string;
  modality: "online" | "in_person";
  locationId: string | null;
};
export type AgendaAvailability = {
  name: string;
  slug: string;
  timezone: string;
  duration: number;
  horizonDays: number;
  minimumNoticeMinutes: number;
  hasSchedule: boolean;
  requestsEnabled: boolean;
  connectionError: boolean;
  locations: { id: string; name: string; address: string }[];
  options: { modality: "online" | "in_person"; location_id: string | null }[];
  slots: AgendaSlot[];
};
export type AgendaResult = {
  id: string;
  status: string;
  start?: string;
  end?: string;
  timezone?: string;
};
export type AgendaEntry = {
  id: string;
  kind: "appointment" | "block";
  status: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  modality: string | null;
  location_snapshot: { name: string; address: string } | null;
  contact_name: string | null;
  contact_email: string | null;
  patient_id: string | null;
  requires_confirmation?: boolean;
  contact_phone?: string | null;
  registration_status?: 'none' | 'created' | 'review';
  calendar_status: string;
  calendar_checked_at?: string | null;
  calendar_check_error?: string | null;
  notification_status: string;
};
export type AgendaRequest = {
  id: string;
  status: string;
  contact_name: string;
  contact_email: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  modality: string;
  expires_at: string;
  revision: number;
};
const messages: Record<string, string> = {
  registration_required: 'Completa tus datos básicos y autoriza su registro para continuar.',
  invalid_birth_date: 'Revisa tu fecha de nacimiento. No puede estar en el futuro.',
  invalid_phone: 'Revisa tu número de WhatsApp y la lada internacional.',
  slot_taken: "Este horario acaba de ocuparse. Elige otro para continuar.",
  profile_unavailable: "Este perfil no está disponible para nuevas reservas.",
  booking_unavailable: "Por el momento no hay horarios disponibles.",
  invalid_code:
    "El código no es válido o venció. Revisa el correo o solicita otro.",
  verification_required: "Verifica de nuevo tu correo para continuar.",
  rate_limited:
    "Has realizado varios intentos. Espera unos minutos antes de volver a intentar.",
  google_unavailable:
    "No pudimos comprobar el calendario. Reintenta o envía una solicitud pendiente.",
  configuration_required:
    "La conexión de Agenda todavía necesita configuración.",
  mail_not_connected:
    "El envío de correo aún no está conectado. No se creó ninguna reserva.",
  email_test_mode:
    "Agenda está en pruebas; por ahora solo puede enviar al correo de prueba autorizado.",
  request_expired: "Esta propuesta venció o fue sustituida por otra.",
  token_used: "Esta propuesta ya recibió una respuesta.",
  invalid_token: "El enlace no es válido.",
  idempotency_mismatch:
    "Los datos cambiaron. Vuelve a seleccionar el horario antes de confirmar.",
  outside_schedule:
    "El horario está fuera de la disponibilidad habitual. Requiere autorizar una excepción.",
  invalid_option: "Elige una modalidad y un consultorio habilitados.",
  invalid_time: "El horario está fuera del periodo permitido.",
  unauthorized: "Vuelve a iniciar sesión para continuar.",
};
export class AgendaError extends Error {
  constructor(public code: string) {
    super(
      messages[code] || "No pudimos completar la operación. Intenta de nuevo.",
    );
  }
}
export async function agendaApi<T>(
  op: string,
  data: Record<string, unknown> = {},
  authenticated = false,
): Promise<T> {
  const session = authenticated
    ? (await supabase.auth.getSession()).data.session
    : null;
  if (authenticated && !session) throw new AgendaError("unauthorized");
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agenda`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ op, ...data }),
    },
  );
  const result = (await response.json()) as { error?: string } & T;
  if (!response.ok || result.error)
    throw new AgendaError(result.error || "temporarily_unavailable");
  return result as T;
}
export async function loadAgenda() {
  const [entries, requests] = await Promise.all([
    supabase
      .from("agenda_entries")
      .select("*")
      .gte("starts_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("starts_at")
      .limit(500),
    supabase
      .from("agenda_requests")
      .select("*")
      .in("status", ["pending_professional", "pending_requester"])
      .order("starts_at")
      .limit(500),
  ]);
  if (entries.error || requests.error)
    throw new Error("No pudimos cargar la agenda. Intenta de nuevo.");
  return {
    entries: entries.data as AgendaEntry[],
    requests: (requests.data as AgendaRequest[]).filter(
      (r) => Date.parse(r.expires_at) > Date.now(),
    ),
  };
}
export function dateInZone(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
export function agendaDate(instant: string, timezone: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(instant));
}
