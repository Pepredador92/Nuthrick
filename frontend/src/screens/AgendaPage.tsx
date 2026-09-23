import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Check, RefreshCw } from "lucide-react";
import { useAuth } from "@/src/features/auth/AuthProvider";
import { supabase } from "@/src/lib/supabase";
import { PatientModal } from "./PatientsPage";
import {
  agendaApi,
  agendaDate,
  loadAgenda,
  type AgendaEntry,
  type AgendaRequest,
} from "@/src/services/agenda";

type Connection = {
  calendarConnected: boolean;
  calendarActive: boolean;
  mailConnected: boolean;
  canConnectMail: boolean;
  busyCalendars: string[];
  writeCalendar: string;
};
type GoogleCalendar = { id: string; name: string; writable: boolean };
function AgendaDialog({
  children,
  close,
  busy,
}: {
  children: ReactNode;
  close: () => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label="Gestionar cita"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      className="m-auto max-h-[90dvh] w-[min(512px,calc(100vw-32px))] overflow-y-auto rounded-3xl border-0 bg-white p-6 text-[#173d36] backdrop:bg-[#102d27]/50"
    >
      <button className="float-right text-sm" disabled={busy} onClick={close}>
        Cerrar
      </button>
      {children}
    </dialog>
  );
}
export function AgendaPage() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<AgendaEntry[]>([]);
  const [requests, setRequests] = useState<AgendaRequest[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [busyCalendars, setBusyCalendars] = useState<string[]>([]);
  const [writeCalendar, setWriteCalendar] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [section, setSection] = useState<
    "appointments" | "requests" | "settings"
  >("appointments");
  const [activeRequest, setActiveRequest] = useState<AgendaRequest | null>(
    null,
  );
  const [proposalTime, setProposalTime] = useState("");
  const [linkEntry, setLinkEntry] = useState<AgendaEntry | null>(null);
  const [patients, setPatients] = useState<{ id: string; full_name: string }[]>(
    [],
  );
  const [patient, setPatient] = useState("");
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [cancelEntry, setCancelEntry] = useState<AgendaEntry | null>(null);
  const [confirmEntry, setConfirmEntry] = useState<AgendaEntry | null>(null);
  const [minimumNotice, setMinimumNotice] = useState(120);
  const [publicEnabled, setPublicEnabled] = useState(true);
  const [requestsEnabled, setRequestsEnabled] = useState(true);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [exception, setException] = useState(false);
  const pendingOperation = useRef({ fingerprint: "", key: "" });
  const refresh = async () => {
    const loaded = await loadAgenda();
    setEntries(loaded.entries);
    setRequests(loaded.requests);
  };
  const run = async (fn: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Intenta de nuevo.");
    } finally {
      setWorking(false);
    }
  };
  useEffect(() => {
    let active = true;
    void Promise.all([
      loadAgenda(),
      agendaApi<Connection>("connection", {}, true),
      supabase.from("availability_settings").select("*").maybeSingle(),
    ])
      .then(([loaded, c, settings]) => {
        if (!active) return;
        setEntries(loaded.entries);
        setRequests(loaded.requests);
        setConnection(c);
        setBusyCalendars(c.busyCalendars);
        setWriteCalendar(c.writeCalendar);
        if (settings.data) {
          setMinimumNotice(settings.data.minimum_notice_minutes);
          setPublicEnabled(settings.data.public_booking_enabled);
          setRequestsEnabled(settings.data.alternative_requests_enabled);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const manage = async (payload: Record<string, unknown>) => {
    const fingerprint = JSON.stringify(payload);
    if (pendingOperation.current.fingerprint !== fingerprint)
      pendingOperation.current = { fingerprint, key: crypto.randomUUID() };
    await agendaApi(
      "manage",
      { payload, operationKey: pendingOperation.current.key },
      true,
    );
    await refresh();
    pendingOperation.current = { fingerprint: "", key: "" };
  };
  const resolve = async (localTime: string) => {
    const result = await agendaApi<{ instants: string[] }>(
      "resolve_time_private",
      {
        localTime,
      },
      true,
    );
    if (result.instants.length !== 1)
      throw new Error(
        "Esta hora no existe o es ambigua en la zona horaria. Elige otra.",
      );
    return result.instants[0];
  };
  const input =
    "mt-2 w-full min-w-0 rounded-xl border border-[#dce4df] bg-white p-3 text-sm";
  const activeEntries = entries.filter((e) => e.status === "confirmed");

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="nuth-eyebrow">Tu tiempo, organizado</p>
          <h1 className="mt-2 text-3xl font-semibold">Agenda</h1>
          <p className="mt-2 text-sm text-[#64786e]">
            Citas y solicitudes de tu perfil público.
          </p>
        </div>
        <button
          className="nuth-button-secondary"
          disabled={working}
          onClick={() => run(refresh)}
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </header>
      <nav
        className="mt-7 flex flex-wrap gap-2"
        aria-label="Secciones de agenda"
      >
        {(
          [
            ["appointments", "Citas"],
            [
              "requests",
              `Solicitudes${requests.length ? " · " + requests.length : ""}`,
            ],
            ["settings", "Configuración"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            aria-current={section === id ? "page" : undefined}
            className={`rounded-full px-5 py-3 text-sm font-semibold ${section === id ? "bg-[#173d36] text-white" : "bg-white text-[#64786e]"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl bg-[#fff0e9] p-4 text-sm text-[#963f34]"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-5 rounded-xl bg-[#edf4ef] p-4 text-sm">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="mt-8">Cargando agenda…</p>
      ) : section === "appointments" ? (
        <section className="mt-6 space-y-3">
          {!activeEntries.length && (
            <div className="rounded-3xl border border-[#dce4df] bg-white p-8">
              <CalendarDays size={28} />
              <h2 className="mt-4 text-lg font-semibold">
                Tu próxima cita aparecerá aquí
              </h2>
              <p className="mt-2 text-sm text-[#64786e]">
                Configura tu disponibilidad para recibir citas desde tu perfil.
              </p>
              <Link className="nuth-button mt-5" to="/app/profile">
                Configurar disponibilidad
              </Link>
            </div>
          )}
          {activeEntries.map((e) => (
            <article
              key={e.id}
              className="rounded-2xl border border-[#dce4df] bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  {e.requires_confirmation && <p className="mb-3 inline-block rounded-full bg-[#fff1d5] px-3 py-1 text-xs font-semibold text-[#795620]">Reserva pendiente de confirmación</p>}
                  <p className="text-xs font-semibold text-[#64786e]">
                    {e.kind === "block"
                      ? "Tiempo bloqueado"
                      : e.patient_id
                        ? "Paciente vinculado"
                        : "Contacto · sin expediente vinculado"}
                  </p>
                  <h2 className="mt-1 break-words text-lg font-semibold">
                    {e.contact_name || "No disponible"}
                  </h2>
                  <p className="mt-2 text-sm capitalize">
                    {agendaDate(e.starts_at, e.timezone)}
                  </p>
                  <p className="mt-1 text-xs text-[#64786e]">
                    {e.timezone} ·{" "}
                    {(Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000}{" "}
                    min ·{" "}
                    {e.modality === "online"
                      ? "En línea"
                      : e.location_snapshot?.name}
                  </p>
                  {e.contact_email && (
                    <p className="mt-2 break-all text-sm text-[#64786e]">
                      {e.contact_email}
                    </p>
                  )}
                  {e.contact_phone && <a className="mt-2 inline-block text-sm font-medium underline underline-offset-4" href={`https://wa.me/${e.contact_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp · {e.contact_phone}</a>}
                  {e.registration_status === 'review' && !e.patient_id && <p className="mt-2 text-xs text-[#795620]">Revisa si ya tiene expediente antes de vincular o dar de alta.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {e.requires_confirmation && <button disabled={working} className="nuth-button" onClick={() => setConfirmEntry(e)}>Confirmar reserva</button>}
                  {e.kind === "appointment" && !e.patient_id && (
                    <button
                      className="nuth-button-secondary"
                      onClick={() =>
                        run(async () => {
                          const { data, error } = await supabase
                            .from("patients")
                            .select("id,full_name")
                            .is("deleted_at", null)
                            .order("full_name");
                          if (error) throw error;
                          setPatients(data || []);
                          setPatient("");
                          setLinkEntry(e);
                        })
                      }
                    >
                      Vincular paciente
                    </button>
                  )}
                  {e.patient_id && (
                    <Link
                      className="nuth-button-secondary"
                      to={`/app/patients/${e.patient_id}`}
                    >
                      Ver paciente
                    </Link>
                  )}
                  <button
                    className="rounded-xl px-3 py-2 text-sm text-[#963f34]"
                    onClick={() => setCancelEntry(e)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
              {e.kind === "appointment" && (
                <div className="mt-4 flex flex-wrap gap-3 border-t border-[#edf1ed] pt-3 text-xs text-[#64786e]">
                  <span>
                    Correo:{" "}
                    {{
                      pending: "pendiente",
                      sent: "enviado",
                      failed: "no enviado",
                      unknown: "envío sin confirmar",
                      not_required: "no requerido",
                    }[e.notification_status] || e.notification_status}
                  </span>
                  <span>
                    Google Calendar:{" "}
                    {e.requires_confirmation ? 'se sincroniza al confirmar' : {
                      not_connected: "sin conexión",
                      pending: "pendiente",
                      synced: "sincronizado",
                      failed: "no sincronizado",
                      conflict: "conflicto externo",
                    }[e.calendar_status] || e.calendar_status}
                  </span>
                  {e.calendar_status === "conflict" && (
                    <p className="w-full text-[#963f34]" role="status">
                      Hay un cambio o un cruce de horarios en Google. La cita de
                      Nuthrick se conserva; revisa tu calendario antes de
                      atender. No modificamos eventos externos.
                    </p>
                  )}
                  {e.calendar_check_error &&
                    ["synced", "conflict"].includes(e.calendar_status) && (
                    <p className="w-full text-[#963f34]" role="status">
                      No pudimos verificar si hubo cambios recientes en tu
                      calendario. La cita está sincronizada, pero la
                      disponibilidad mostrada podría no estar actualizada.
                    </p>
                  )}
                  {e.calendar_status === "failed" && (
                    <button
                      className="font-semibold underline"
                      disabled={working}
                      onClick={() =>
                        run(async () => {
                          await agendaApi("retry_sync", { id: e.id }, true);
                          await refresh();
                        })
                      }
                    >
                      Reintentar sincronización
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
          {entries.length >= 500 && (
            <p className="text-sm">
              Se muestran las primeras 500 citas del periodo.
            </p>
          )}
        </section>
      ) : section === "requests" ? (
        <section className="mt-6 space-y-3">
          {!requests.length && (
            <div className="rounded-3xl bg-white p-8">
              <Check size={26} />
              <h2 className="mt-3 font-semibold">
                No tienes solicitudes pendientes
              </h2>
            </div>
          )}
          {requests.map((r) => (
            <article
              key={r.id}
              className="rounded-2xl border border-[#dce4df] bg-white p-5"
            >
              <p className="text-xs text-[#64786e]">
                {r.status === "pending_requester"
                  ? "Esperando respuesta del solicitante"
                  : "Necesita tu confirmación"}
              </p>
              <h2 className="mt-2 text-lg font-semibold">{r.contact_name}</h2>
              <p className="mt-2 text-sm">
                {agendaDate(r.starts_at, r.timezone)}
              </p>
              <p className="mt-1 text-xs text-[#64786e]">
                {r.timezone} · Vence: {agendaDate(r.expires_at, r.timezone)}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="nuth-button"
                  onClick={() => {
                    setActiveRequest(r);
                    setProposalTime("");
                    setException(false);
                  }}
                >
                  Revisar solicitud
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="mt-6 grid min-w-0 gap-5 xl:grid-cols-2">
          <div className="rounded-3xl border border-[#dce4df] bg-white p-6">
            <h2 className="text-lg font-semibold">Reservas públicas</h2>
            <Link
              className="mt-3 inline-block text-sm underline"
              to="/app/profile"
            >
              Editar duración, horarios semanales y horizonte de reserva
            </Link>
            <label className="mt-5 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={publicEnabled}
                onChange={(e) => setPublicEnabled(e.target.checked)}
              />
              Admitir reservas desde mi perfil público
            </label>
            <label className="mt-4 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={requestsEnabled}
                onChange={(e) => setRequestsEnabled(e.target.checked)}
              />
              Permitir solicitar otro horario
            </label>
            <label className="mt-5 block text-sm">
              Anticipación mínima (minutos)
              <input
                className={input}
                type="number"
                min={0}
                max={43200}
                value={minimumNotice}
                onChange={(e) => setMinimumNotice(Number(e.target.value))}
              />
            </label>
            <button
              className="nuth-button mt-4"
              disabled={working}
              onClick={() =>
                run(async () => {
                  const { error } = await supabase
                    .from("availability_settings")
                    .update({
                      public_booking_enabled: publicEnabled,
                      alternative_requests_enabled: requestsEnabled,
                      minimum_notice_minutes: minimumNotice,
                    })
                    .eq("professional_id", profile!.id)
                    .select()
                    .single();
                  if (error)
                    throw new Error(
                      "Primero configura tu disponibilidad en Perfil.",
                    );
                  setNotice("Preferencias guardadas.");
                })
              }
            >
              Guardar preferencias
            </button>
            <h3 className="mt-8 font-semibold">Bloquear tiempo</h3>
            <p className="mt-2 text-xs text-[#64786e]">
              Zona horaria de tu disponibilidad. No puede superponerse con una
              cita confirmada.
            </p>
            <label className="mt-3 block text-sm">
              Desde
              <input
                type="datetime-local"
                className={input}
                value={blockStart}
                onChange={(e) => setBlockStart(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm">
              Hasta
              <input
                type="datetime-local"
                className={input}
                value={blockEnd}
                onChange={(e) => setBlockEnd(e.target.value)}
              />
            </label>
            <button
              className="nuth-button-secondary mt-4"
              disabled={working || !blockStart || !blockEnd}
              onClick={() =>
                run(async () => {
                  await manage({
                    action: "block",
                    start: await resolve(blockStart),
                    end: await resolve(blockEnd),
                  });
                  setNotice("Tiempo bloqueado.");
                })
              }
            >
              Bloquear horario
            </button>
          </div>
          <div className="rounded-3xl border border-[#dce4df] bg-white p-6">
            <h2 className="text-lg font-semibold">Google Calendar</h2>
            <p className="mt-2 text-sm text-[#64786e]">
              Consulta la ocupación de tus calendarios y crea las citas en el
              que elijas. Sin conectar Google, puedes usar la agenda de
              Nuthrick.
            </p>
            <button
              className="nuth-button mt-5"
              disabled={working}
              onClick={() =>
                run(async () => {
                  const result = await agendaApi<{ url: string }>(
                    "oauth_start",
                    { purpose: "calendar" },
                    true,
                  );
                  window.location.assign(result.url);
                })
              }
            >
              {connection?.calendarConnected
                ? "Renovar autorización"
                : "Conectar Google Calendar"}
            </button>
            {connection?.calendarConnected && (
              <button
                className="nuth-button-secondary mt-3"
                onClick={() =>
                  run(async () => {
                    const data = await agendaApi<{
                      calendars: GoogleCalendar[];
                    }>("calendar_list", {}, true);
                    setCalendars(data.calendars);
                  })
                }
              >
                Elegir calendarios
              </button>
            )}
            {calendars.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-semibold">
                  Consultar disponibilidad en:
                </p>
                {calendars.map((c) => (
                  <label key={c.id} className="mt-3 flex gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={busyCalendars.includes(c.id)}
                      onChange={(e) =>
                        setBusyCalendars((old) =>
                          e.target.checked
                            ? [...old, c.id]
                            : old.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.name}
                  </label>
                ))}
                <label className="mt-5 block text-sm">
                  Crear citas en
                  <select
                    className={input}
                    value={writeCalendar}
                    onChange={(e) => setWriteCalendar(e.target.value)}
                  >
                    <option value="">Elige un calendario</option>
                    {calendars
                      .filter((c) => c.writable)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className="nuth-button mt-4"
                  disabled={!writeCalendar || working}
                  onClick={() =>
                    run(async () => {
                      await agendaApi(
                        "calendar_save",
                        {
                          busy: [...new Set([...busyCalendars, writeCalendar])],
                          write: writeCalendar,
                        },
                        true,
                      );
                      setNotice("Calendarios conectados.");
                    })
                  }
                >
                  Guardar calendarios
                </button>
              </div>
            )}
            {connection?.canConnectMail && (
              <div className="mt-8 border-t border-[#e5ebe7] pt-6">
                <h3 className="font-semibold">Correo de Nuthrick</h3>
                <p className="mt-2 text-sm text-[#64786e]">
                  {connection.mailConnected
                    ? "Remitente conectado."
                    : "Falta autorizar el envío de códigos y confirmaciones."}{" "}
                  La autorización solo permite enviar correo.
                </p>
                <button
                  className="nuth-button-secondary mt-4"
                  disabled={working}
                  onClick={() =>
                    run(async () => {
                      const data = await agendaApi<{ url: string }>(
                        "oauth_start",
                        { purpose: "gmail" },
                        true,
                      );
                      window.location.assign(data.url);
                    })
                  }
                >
                  Autorizar remitente
                </button>
              </div>
            )}
          </div>
        </section>
      )}
      {creatingPatient && linkEntry && (
        <PatientModal
          initialContact={{
            name: linkEntry.contact_name || "",
            email: linkEntry.contact_email || "",
            timezone: linkEntry.timezone,
          }}
          onClose={() => setCreatingPatient(false)}
          onSaved={(created) => {
            setPatients((old) => [...old, created]);
            setPatient(created.id);
            setCreatingPatient(false);
            setNotice(
              "Paciente creado. Revisa y pulsa Vincular para asociarlo a esta cita.",
            );
          }}
        />
      )}
      {!creatingPatient && (activeRequest || linkEntry || cancelEntry || confirmEntry) && (
        <AgendaDialog
          busy={working}
          close={() => {
            setActiveRequest(null);
            setLinkEntry(null);
            setCancelEntry(null);
            setConfirmEntry(null);
          }}
        >
          {confirmEntry ? <>
            <h2 className="pr-16 text-xl font-semibold">Confirmar la reserva</h2>
            <p className="mt-4 font-medium">{confirmEntry.contact_name}</p>
            <p className="mt-2 text-sm">{agendaDate(confirmEntry.starts_at, confirmEntry.timezone)}</p>
            <p className="mt-4 text-sm text-[#64786e]">Se enviará la confirmación al paciente y se sincronizará la cita con Google si está conectado.</p>
            <button disabled={working} className="nuth-button mt-5" onClick={() => run(async () => { await manage({ action: 'confirm_reservation', id: confirmEntry.id }); setConfirmEntry(null); setNotice('Reserva confirmada.'); })}>Confirmar y notificar</button>
          </> : activeRequest ? (
            <>
              <h2 className="pr-16 text-xl font-semibold">
                {activeRequest.contact_name}
              </h2>
              <p className="mt-4 text-sm">
                {agendaDate(activeRequest.starts_at, activeRequest.timezone)}
              </p>
              {activeRequest.status === "pending_professional" && (
                <>
                  <label className="mt-5 flex gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={exception}
                      onChange={(e) => setException(e.target.checked)}
                    />
                    Autorizar este horario aunque esté fuera de mi horario
                    habitual. No permite superposiciones.
                  </label>
                  <button
                    className="nuth-button mt-4"
                    disabled={working}
                    onClick={() =>
                      run(async () => {
                        await manage({
                          action: "accept",
                          id: activeRequest.id,
                          allowOutsideSchedule: exception,
                        });
                        setActiveRequest(null);
                      })
                    }
                  >
                    Aceptar solicitud
                  </button>
                </>
              )}
              <label className="mt-6 block text-sm">
                Proponer otra fecha y hora · {activeRequest.timezone}
                <input
                  className={input}
                  type="datetime-local"
                  value={proposalTime}
                  onChange={(e) => setProposalTime(e.target.value)}
                />
              </label>
              <button
                className="nuth-button-secondary mt-3"
                disabled={!proposalTime || working}
                onClick={() =>
                  run(async () => {
                    await manage({
                      action: "propose",
                      id: activeRequest.id,
                      start: await resolve(proposalTime),
                    });
                    setActiveRequest(null);
                  })
                }
              >
                Enviar contrapropuesta
              </button>
              <button
                className="mt-5 block text-sm text-[#963f34]"
                disabled={working}
                onClick={() =>
                  run(async () => {
                    await manage({ action: "reject", id: activeRequest.id });
                    setActiveRequest(null);
                  })
                }
              >
                Rechazar solicitud
              </button>
            </>
          ) : linkEntry ? (
            <>
              <h2 className="pr-16 text-xl font-semibold">Vincular paciente</h2>
              <p className="mt-3 text-sm">
                Selecciona explícitamente el expediente correspondiente a{" "}
                {linkEntry.contact_name}.
              </p>
              <select
                className={input}
                value={patient}
                onChange={(e) => setPatient(e.target.value)}
              >
                <option value="">Selecciona un paciente</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
              <button
                className="nuth-button mt-4"
                disabled={!patient || working}
                onClick={() =>
                  run(async () => {
                    await manage({
                      action: "link",
                      id: linkEntry.id,
                      patientId: patient,
                    });
                    setLinkEntry(null);
                  })
                }
              >
                Vincular
              </button>
              <button
                className="mt-5 block text-sm underline"
                disabled={working}
                onClick={() => setCreatingPatient(true)}
              >
                Dar de alta un paciente nuevo
              </button>
            </>
          ) : (
            cancelEntry && (
              <>
                <h2 className="pr-16 text-xl font-semibold">
                  ¿Cancelar{" "}
                  {cancelEntry.kind === "block" ? "este bloqueo" : "esta cita"}?
                </h2>
                <p className="mt-4 text-sm">
                  {agendaDate(cancelEntry.starts_at, cancelEntry.timezone)}
                </p>
                <p className="mt-3 text-sm text-[#64786e]">
                  Se conservará el registro y el horario quedará libre.
                </p>
                <button
                  className="nuth-button mt-5"
                  disabled={working}
                  onClick={() =>
                    run(async () => {
                      await manage({ action: "cancel", id: cancelEntry.id });
                      setCancelEntry(null);
                    })
                  }
                >
                  Confirmar cancelación
                </button>
              </>
            )
          )}
          {error && (
            <p className="mt-4 text-sm text-[#963f34]" role="alert">
              {error}
            </p>
          )}
        </AgendaDialog>
      )}
    </div>
  );
}
