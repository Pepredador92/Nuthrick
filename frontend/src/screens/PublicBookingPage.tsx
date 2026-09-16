import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Check, Clock, Mail } from "lucide-react";
import { Logo } from "@/src/components/ui/Logo";
import {
  AgendaError,
  agendaApi,
  agendaDate,
  dateInZone,
  type AgendaAvailability,
  type AgendaResult,
  type AgendaSlot,
} from "@/src/services/agenda";

const localClock = (instant: string, timezone: string) => new Intl.DateTimeFormat('es-MX', {hour:'2-digit',minute:'2-digit',hour12:false,timeZone:timezone}).format(new Date(instant));

export function PublicBookingPage() {
  const [openedAt] = useState(() => Date.now());
  const { slug = "" } = useParams();
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<AgendaAvailability | null>(null);
  const [option, setOption] = useState("");
  const [selected, setSelected] = useState<AgendaSlot | null>(null);
  const [requestMode, setRequestMode] = useState(false);
  const [requestTime, setRequestTime] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [proof, setProof] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<AgendaResult | null>(null);
  const [refresh, setRefresh] = useState(0);
  const operation = useRef({ fingerprint: "", key: "" });
  useEffect(() => {
    let active = true;
    void agendaApi<AgendaAvailability>("availability", { slug, from })
      .then((value) => {
        if (!active) return;
        setData(value);
        if (value.options.length === 1)
          setOption(
            `${value.options[0].modality}|${value.options[0].location_id || ""}`,
          );
        setError(current => current.startsWith('Este horario acaba de ocuparse.') ? current : '');
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
  }, [slug, from, refresh]);
  const run = async (fn: () => Promise<void>) => {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Intenta de nuevo.");
    } finally {
      setWorking(false);
    }
  };
  const choose = (slot: AgendaSlot) => {
    setSelected(slot);
    setNotice("");
  };
  const options = data?.options || [];
  const [mode, locationId] = option.split("|");
  const filtered = (data?.slots || []).filter(
    (s) => s.modality === mode && (s.locationId || "") === (locationId || ""),
  );
  const groups = filtered.reduce<Record<string, AgendaSlot[]>>((out, slot) => {
    const day = dateInZone(slot.start, data!.timezone);
    (out[day] ||= []).push(slot);
    return out;
  }, {});
  const location = data?.locations.find((l) => l.id === selected?.locationId);
  const inputClass =
    "mt-2 w-full min-w-0 rounded-xl border border-[#dce4df] bg-white px-4 py-3 text-base";

  return (
    <main className="min-h-screen bg-[#f6f7f3] p-4 text-[#173d36] sm:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <Link to={`/p/${slug}`} className="flex items-center gap-2 text-sm">
            <ArrowLeft size={16} />
            Volver al perfil
          </Link>
        </header>
        {result ? (
          <section
            className="rounded-3xl border border-[#dce4df] bg-white p-6 sm:p-10"
            aria-live="polite"
          >
            <Check className="mb-5 rounded-full bg-[#e7f2e9] p-2" size={44} />
            <h1 className="text-3xl font-semibold">
              {result.status === "confirmed"
                ? "Tu cita quedó agendada."
                : "Tu solicitud fue enviada."}
            </h1>
            <p className="mt-3 text-[#64786e]">
              {result.status === "confirmed"
                ? "Esta es tu confirmación en Nuthrick."
                : "Necesita confirmación del nutriólogo. El horario aún no está reservado."}
            </p>
            <p className="mt-6 font-semibold">{data?.name}</p>
            <p className="mt-2">
              {agendaDate(result.start || selected!.start, data!.timezone)}
            </p>
            <p className="mt-2 text-sm">
              {data?.timezone} · {data?.duration} minutos
            </p>
            <p className="mt-2">
              {selected?.modality === "online" ? "En línea" : location?.name}
            </p>
            {location && <p className="mt-1 text-sm">{location.address}</p>}
            <Link to={`/p/${slug}`} className="nuth-button mt-8">
              Volver al perfil
            </Link>
          </section>
        ) : (
          <>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {data ? `Agenda una cita con ${data.name}` : "Agenda una cita"}
            </h1>
            {data && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#64786e]">
                <Clock size={16} />
                {data.duration} minutos · Horarios en {data.timezone}
              </p>
            )}
            {error && (
              <div
                role="alert"
                className="mt-5 rounded-xl bg-[#fff0e9] p-4 text-sm text-[#963f34]"
              >
                {error}
                <button
                  className="ml-3 underline"
                  onClick={() => {
                    setLoading(true);
                    setRefresh((r) => r + 1);
                  }}
                >
                  Reintentar
                </button>
              </div>
            )}
            {loading ? (
              <p className="mt-8" role="status">
                Buscando horarios…
              </p>
            ) : (
              data && (
                <div className="mt-7 grid min-w-0 gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                  <section className="min-w-0 rounded-3xl border border-[#dce4df] bg-white p-5 sm:p-6">
                    <h2 className="text-lg font-semibold">
                      1. Elige tu horario
                    </h2>
                    {options.length > 1 && (
                      <label className="mt-5 block text-sm font-medium">
                        ¿Cómo prefieres tu consulta?
                        <select
                          className={inputClass}
                          value={option}
                          onChange={(e) => {
                            setOption(e.target.value);
                            setSelected(null);
                          }}
                        >
                          <option value="">Selecciona una opción</option>
                          {options.map((o) => (
                            <option
                              key={`${o.modality}|${o.location_id || ""}`}
                              value={`${o.modality}|${o.location_id || ""}`}
                            >
                              {o.modality === "online"
                                ? "En línea"
                                : data.locations.find(
                                    (l) => l.id === o.location_id,
                                  )?.name || "Presencial"}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {!requestMode ? (
                      <>
                        <label className="mt-5 block text-sm">
                          Ver la semana a partir de
                          <input
                            className={inputClass}
                            type="date"
                            value={from}
                            min={dateInZone(
                              new Date().toISOString(),
                              data.timezone,
                            )}
                            max={dateInZone(
                              new Date(
                                openedAt + data.horizonDays * 86400000,
                              ).toISOString(),
                              data.timezone,
                            )}
                            onChange={(e) => {
                              setFrom(e.target.value);
                              setLoading(true);
                            }}
                          />
                        </label>
                        {data.connectionError ? (
                          <p className="mt-5 rounded-xl bg-[#fff5dc] p-4 text-sm">
                            No pudimos comprobar el calendario. Reintenta o
                            solicita un horario pendiente de confirmación.
                          </p>
                        ) : option && Object.entries(groups).length ? (
                          <div className="mt-6 max-h-[32rem] space-y-5 overflow-y-auto pr-1">
                            {Object.entries(groups).map(([day, slots]) => (
                              <div key={day}>
                                <h3 className="mb-3 text-sm font-semibold capitalize">
                                  {new Intl.DateTimeFormat("es-MX", {
                                    weekday: "long",
                                    day: "numeric",
                                    month: "long",
                                    timeZone: data.timezone,
                                  }).format(new Date(slots[0].start))}
                                </h3>
                                <div className="grid grid-cols-3 gap-2">
                                  {slots.map((slot) => (
                                    <button
                                      type="button"
                                      key={slot.start}
                                      aria-pressed={
                                        selected?.start === slot.start
                                      }
                                      onClick={() => choose(slot)}
                                      className={`rounded-xl border px-2 py-3 text-sm ${selected?.start === slot.start ? "border-[#173d36] bg-[#173d36] text-white" : "border-[#dce4df] hover:bg-[#edf4ef]"}`}
                                    >
                                      <span className="block whitespace-nowrap">{localClock(slot.start,data.timezone)}</span>
                                      {slots.some(other=>other.start!==slot.start && localClock(other.start,data.timezone)===localClock(slot.start,data.timezone)) && <span className="mt-1 block whitespace-nowrap text-[10px]">{new Intl.DateTimeFormat('es-MX',{timeZone:data.timezone,timeZoneName:'shortOffset'}).formatToParts(new Date(slot.start)).find(part=>part.type==='timeZoneName')?.value}</span>}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-5 text-sm text-[#64786e]">
                            {!option && options.length > 1
                              ? "Selecciona la modalidad para ver los horarios."
                              : !data.hasSchedule
                                ? "Por el momento no hay horarios disponibles."
                                : "Estos días no tienen horarios libres. Prueba otra fecha."}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="mt-4 text-sm text-[#64786e]">
                          Este horario necesita confirmación del nutriólogo.
                        </p>
                        <label className="mt-4 block text-sm">
                          Fecha y hora en {data.timezone}
                          <input
                            type="datetime-local"
                            className={inputClass}
                            value={requestTime}
                            onChange={(e) => {
                              setRequestTime(e.target.value);
                              setSelected(null);
                            }}
                          />
                        </label>
                        <button
                          disabled={!requestTime || !option || working}
                          className="nuth-button mt-4"
                          onClick={() =>
                            run(async () => {
                              const resolved = await agendaApi<{
                                instants: string[];
                              }>("resolve_time", {
                                slug,
                                localTime: requestTime,
                              });
                              if (resolved.instants.length !== 1)
                                throw new Error(
                                  resolved.instants.length
                                    ? "Esta hora ocurre dos veces por el cambio de horario. Elige otra hora."
                                    : "La hora no existe en esta zona. Elige otra.",
                                );
                              choose({
                                start: resolved.instants[0],
                                end: new Date(
                                  Date.parse(resolved.instants[0]) +
                                    data.duration * 60000,
                                ).toISOString(),
                                modality: mode as AgendaSlot["modality"],
                                locationId: locationId || null,
                              });
                            })
                          }
                        >
                          Usar este horario
                        </button>
                      </>
                    )}
                    {data.requestsEnabled && (
                      <div className="mt-6 border-t border-[#e5ebe7] pt-5">
                        <p className="text-sm text-[#64786e]">
                          {requestMode
                            ? "¿Prefieres un horario disponible?"
                            : "¿No encuentras un horario que te funcione?"}
                        </p>
                        <button
                          className="mt-2 text-sm font-semibold underline underline-offset-4"
                          onClick={() => {
                            setRequestMode((v) => !v);
                            setSelected(null);
                          }}
                        >
                          {requestMode
                            ? "Ver horarios disponibles"
                            : "Solicitar otro horario"}
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="min-w-0 self-start rounded-3xl border border-[#dce4df] bg-white p-5 sm:p-6">
                    <h2 className="text-lg font-semibold">2. Tus datos</h2>
                    <p className="mt-2 text-sm text-[#64786e]">
                      Sin crear una cuenta ni compartir información clínica.
                    </p>
                    {selected ? (
                      <div className="mt-5 rounded-xl bg-[#edf4ef] p-4 text-sm">
                        <CalendarDays size={18} />
                        <p className="mt-2 font-semibold">
                          {agendaDate(selected.start, data.timezone)}
                        </p>
                        <p className="mt-2">
                          {data.duration} minutos ·{" "}
                          {selected.modality === "online"
                            ? "En línea"
                            : location?.name}
                        </p>
                        {location && <p className="mt-1">{location.address}</p>}
                      </div>
                    ) : (
                      <p className="mt-5 rounded-xl bg-[#f6f7f3] p-4 text-sm">
                        Primero selecciona un horario.
                      </p>
                    )}
                    <label className="mt-5 block text-sm font-medium">
                      Nombre completo
                      <input
                        className={inputClass}
                        autoComplete="name"
                        maxLength={160}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <label className="mt-4 block text-sm font-medium">
                      Correo electrónico
                      <input
                        type="email"
                        autoComplete="email"
                        className={inputClass}
                        disabled={!!proof}
                        value={email}
                        maxLength={254}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setProof("");
                          setChallenge("");
                        }}
                      />
                    </label>
                    {!proof ? (
                      <>
                        <button
                          className="nuth-button mt-4 w-full"
                          disabled={
                            !selected ||
                            name.trim().length < 2 ||
                            !email ||
                            working
                          }
                          onClick={() =>
                            run(async () => {
                              const sent = await agendaApi<{
                                id: string;
                                delivery: string;
                              }>("send_code", { slug, email });
                              setChallenge(sent.id);
                              setCode("");
                              setNotice(
                                sent.delivery === "sent"
                                  ? "Enviamos un código a tu correo."
                                  : "No se pudo confirmar el envío. Puedes solicitar otro código en unos minutos.",
                              );
                            })
                          }
                        >
                          <Mail size={16} />
                          {challenge
                            ? "Solicitar otro código"
                            : "Verificar correo"}
                        </button>
                        {challenge && (
                          <div className="mt-4">
                            <label className="text-sm">
                              Código de 6 dígitos
                              <input
                                className={inputClass}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                value={code}
                                onChange={(e) =>
                                  setCode(e.target.value.replace(/\D/g, ""))
                                }
                              />
                            </label>
                            <button
                              className="nuth-button mt-3 w-full"
                              disabled={code.length !== 6 || working}
                              onClick={() =>
                                run(async () => {
                                  const verified = await agendaApi<{
                                    proof: string;
                                  }>("verify_code", { id: challenge, code });
                                  setProof(verified.proof);
                                  setNotice(
                                    "Correo verificado. Revisa el horario y confirma.",
                                  );
                                })
                              }
                            >
                              Comprobar código
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <button
                        className="mt-3 text-xs underline"
                        onClick={() => {
                          setProof("");
                          setChallenge("");
                          setNotice("");
                        }}
                      >
                        Cambiar correo
                      </button>
                    )}
                    {notice && (
                      <p className="mt-4 text-sm text-[#64786e]" role="status">
                        {notice}
                      </p>
                    )}
                    {proof && (
                      <button
                        disabled={
                          !selected || name.trim().length < 2 || working
                        }
                        className="nuth-button mt-5 w-full"
                        onClick={() =>
                          run(async () => {
                            const payload = {
                              kind: requestMode ? "request" : "appointment",
                              name: name.trim(),
                              start: selected!.start,
                              modality: selected!.modality,
                              locationId: selected!.locationId,
                            };
                            const fingerprint = JSON.stringify({
                              payload,
                              proof,
                            });
                            if (operation.current.fingerprint !== fingerprint)
                              operation.current = {
                                fingerprint,
                                key: crypto.randomUUID(),
                              };
                            try {
                              setResult(
                                await agendaApi<AgendaResult>("book", {
                                  slug,
                                  proof,
                                  payload,
                                  operationKey: operation.current.key,
                                }),
                              );
                            } catch (e) {
                              if (
                                e instanceof AgendaError &&
                                e.code === "slot_taken"
                              ) {
                                setSelected(null);
                                setRefresh((r) => r + 1);
                              }
                              throw e;
                            }
                          })
                        }
                      >
                        {working
                          ? "Confirmando…"
                          : requestMode
                            ? "Enviar solicitud"
                            : "Confirmar cita"}
                      </button>
                    )}
                  </section>
                </div>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
