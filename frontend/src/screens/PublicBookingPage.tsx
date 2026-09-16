import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CalendarDays, Check, Clock, Mail, ShieldCheck, Video } from "lucide-react";
import { Logo } from "@/src/components/ui/Logo";
import { AgendaDayPicker } from "@/src/features/profile/AgendaDayPicker";
import { calculateAge, normalizePhone } from "@/src/features/patients/patientUtils";
import './PublicBookingPage.css';
import {
  AgendaError,
  agendaApi,
  agendaDate,
  dateInZone,
  type AgendaAvailability,
  type AgendaResult,
  type AgendaSlot,
} from "@/src/services/agenda";

type BookingSelection = { slot: AgendaSlot; from: string; requestMode: boolean };
export function PublicBookingPage() {
  const { slug = '' } = useParams();
  const route = useLocation();
  const selection = route.pathname.endsWith('/datos') ? route.state as BookingSelection | null : null;
  return <main><PublicBookingPanel key={slug + route.pathname} slug={slug} initialSelection={selection}/></main>;
}

/** Both public routes share the same verification, idempotency and booking flow. */
export function PublicBookingPanel({ slug, compact = false, fee, initialSelection }: { slug: string; compact?: boolean; fee?: string | null; initialSelection?: BookingSelection | null }) {
  const navigate = useNavigate();
  const Heading = compact ? 'h2' : 'h1';
  const [openedAt] = useState(() => Date.now());
  const [contactStep, setContactStep] = useState(!!initialSelection?.slot);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const previousContactStep = useRef(false);
  useEffect(() => {
    if (previousContactStep.current !== contactStep) stepTitle.current?.focus();
    previousContactStep.current = contactStep;
  }, [compact, contactStep]);
  const [from, setFrom] = useState(initialSelection?.from || new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<AgendaAvailability | null>(null);
  const [option, setOption] = useState(initialSelection?.slot ? `${initialSelection.slot.modality}|${initialSelection.slot.locationId || ''}` : '');
  const [selected, setSelected] = useState<AgendaSlot | null>(initialSelection?.slot || null);
  const [requestMode, setRequestMode] = useState(initialSelection?.requestMode || false);
  const [requestTime, setRequestTime] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState('');
  const [countryCode, setCountryCode] = useState('+52');
  const [localPhone, setLocalPhone] = useState('');
  const [consent, setConsent] = useState(false);
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
  const initialDateForProfile = useRef<string | null>(initialSelection ? slug : null);
  useEffect(() => {
    let active = true;
    void agendaApi<AgendaAvailability>("availability", { slug, from })
      .then((value) => {
        if (!active) return;
        setData(value);
        // UTC may already be tomorrow while the professional is still working
        // today. Resolve the initial date once we know their IANA timezone;
        // never reset a date the visitor chooses subsequently.
        if (initialDateForProfile.current !== slug) {
          initialDateForProfile.current = slug;
          setFrom(dateInZone(new Date().toISOString(), value.timezone));
        }
        // Open the schedule immediately, preferring a modality with actual
        // availability. Never replace a visitor's explicit choice on refresh.
        setOption(current => {
          if (current) return current;
          const first = value.options.find(o => value.slots.some(s => s.modality === o.modality && s.locationId === o.location_id)) || value.options[0];
          return first ? `${first.modality}|${first.location_id || ''}` : '';
        });
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
  const location = data?.locations.find((l) => l.id === selected?.locationId);
  const today = dateInZone(new Date().toISOString(), data?.timezone || 'America/Mexico_City');
  const age = calculateAge(birthDate || null, new Date(`${today}T12:00:00`));
  const phone = normalizePhone(countryCode, localPhone);
  const validRegistration = name.trim().length >= 2 && birthDate >= '1900-01-01' && birthDate <= today && age !== null && /^\+[1-9][0-9]{7,14}$/.test(phone) && /^\+[1-9][0-9]{0,2}$/.test(countryCode) && consent;
  const continueToDetails = () => {
    if (!selected) return;
    if (initialSelection) setContactStep(true);
    else navigate(`/p/${slug}/agendar/datos`, { state: { slot: selected, from, requestMode } satisfies BookingSelection });
  };
  const inputClass =
    "mt-2 w-full min-w-0 rounded-xl border border-[#dce4df] bg-white px-4 py-3 text-base";

  return (
    <div className={compact ? "min-w-0 text-[#173d36] [overflow-wrap:anywhere]" : "min-h-screen bg-[#f6f7f3] p-4 text-[#173d36] [overflow-wrap:anywhere] sm:p-8"}>
      <div className={compact ? 'mx-auto max-w-4xl' : 'mx-auto max-w-2xl'}>
        {!compact && <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Logo />
          <Link to={`/p/${slug}`} className="flex items-center gap-2 text-sm">
            <ArrowLeft size={16} />
            Volver al perfil
          </Link>
        </header>}
        {result ? (
          <section
            className="relative isolate overflow-hidden rounded-3xl border border-[#dce4df] bg-white p-6 sm:p-10"
            aria-live="polite"
          >
            {result.status === 'pending_confirmation' && <div className="booking-confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <span key={i} style={{ left: `${(i * 37) % 100}%`, backgroundColor: ['#437964','#d5af68','#9abbb0'][i % 3], animationDelay: `${(i % 6) * 0.08}s`, rotate: `${i * 31}deg` }}/>)}</div>}
            <Check className="mb-5 rounded-full bg-[#e7f2e9] p-2" size={44} />
            <Heading className={compact ? "text-2xl font-semibold" : "text-3xl font-semibold"}>
              {result.status === 'pending_confirmation' ? 'Tu reserva se registró correctamente' : result.status === "confirmed"
                ? "Tu cita quedó agendada."
                : "Tu solicitud fue enviada."}
            </Heading>
            <p className="mt-3 text-[#64786e]">
              {result.status === 'pending_confirmation' ? 'Gracias por agendar tu cita. Tu nutriólogo se pondrá en contacto contigo para confirmar tu reserva.' : result.status === "confirmed"
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
            {!compact && <Link to={`/p/${slug}`} className="nuth-button mt-8">
              Volver al perfil
            </Link>}
          </section>
        ) : (
          <>
            <Heading className={compact ? "text-xl font-semibold tracking-tight" : "max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl"}>
              {data ? `Agenda una cita con ${data.name}` : "Agenda una cita"}
            </Heading>
            {fee && <div className="mt-4 rounded-xl bg-[#edf4ef] px-4 py-3"><p className="text-xs text-[#64786e]">Costo aproximado de la consulta</p><p className="mt-1 text-xl font-semibold tabular-nums text-[#173d36]">{fee}</p></div>}
            {data && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#64786e]">
                <span className="inline-flex items-center gap-2"><Clock size={16} />{data.duration} minutos</span>
                <span className="min-w-0 break-words">· Horarios en {data.timezone}</span>
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
                <div className={compact ? "mt-5 min-w-0 border-t border-[#e5ebe7] pt-5" : "mt-7 min-w-0"}>
                  {!contactStep && <section className={compact ? "min-w-0" : "min-w-0 rounded-3xl border border-[#dce4df] bg-white p-5 sm:p-6"}>
                    <h2 ref={stepTitle} tabIndex={-1} className={compact ? 'sr-only' : 'text-lg font-semibold outline-none'}>
                      1. Elige tu horario
                    </h2>
                    {options.length > 1 && (
                      <fieldset className={compact ? 'min-w-0' : 'mt-4 min-w-0'} disabled={working}>
                        <legend className="text-sm font-medium">¿Cómo prefieres tu consulta?</legend>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {options.map(o => {
                            const value = `${o.modality}|${o.location_id || ''}`;
                            const Icon = o.modality === 'online' ? Video : Building2;
                            return <label key={value} className="relative min-w-0 cursor-pointer">
                              <input type="radio" name={`booking-option-${slug}`} className="peer sr-only" checked={option === value}
                                onChange={() => { setOption(value); setSelected(null); }}/>
                              <span className="flex min-h-20 min-w-0 flex-col gap-2 rounded-2xl border border-[#dce4df] p-3 text-sm peer-checked:border-[#356454] peer-checked:bg-[#eaf3ed] peer-checked:ring-1 peer-checked:ring-[#356454] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
                                <Icon size={18} aria-hidden="true"/>
                                <span className="break-words font-medium">{o.modality === 'online' ? 'En línea' : data.locations.find(l => l.id === o.location_id)?.name || 'Presencial'}</span>
                              </span>
                            </label>;
                          })}
                        </div>
                      </fieldset>
                    )}
                    {!requestMode ? (
                      <>
                        {data.connectionError ? (
                          <p className="mt-5 rounded-xl bg-[#fff5dc] p-4 text-sm">
                            No pudimos comprobar el calendario. Reintenta o
                            solicita un horario pendiente de confirmación.
                          </p>
                        ) : option ? (
                          <AgendaDayPicker key={`${option}|${from}`} hasSchedule={data.hasSchedule}
                            slots={filtered} timezone={data.timezone} from={from}
                            min={dateInZone(new Date().toISOString(), data.timezone)}
                            max={dateInZone(new Date(openedAt + data.horizonDays * 86400000).toISOString(), data.timezone)}
                            selected={selected} disabled={working}
                            onFrom={value => { setFrom(value); setLoading(true); }}
                            onSelect={choose} onClear={() => setSelected(null)}
                          />
                        ) : (
                          <p className="mt-5 text-sm text-[#64786e]">
                            {options.length > 1 ? 'Selecciona la modalidad para ver los horarios.' : 'Por el momento no hay horarios disponibles.'}
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
                    <button type="button" className="nuth-button mt-5 w-full" disabled={!selected || working}
                      onClick={continueToDetails}>{requestMode ? 'Solicitar este horario' : 'Reservar'}</button>
                    {data.requestsEnabled && (
                      <div className="mt-4 border-t border-[#e5ebe7] pt-4">
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
                    {compact && <p className="mt-5 flex items-center justify-center gap-2 text-xs text-[#64786e]"><ShieldCheck size={15}/>Sin cuenta ni datos clínicos</p>}
                  </section>}
                  {contactStep && <section className={compact ? "min-w-0" : "min-w-0 self-start rounded-3xl border border-[#dce4df] bg-white p-5 sm:p-6"}>
                    <button type="button" disabled={working} onClick={() => setContactStep(false)} className="mb-4 flex min-h-11 items-center gap-2 text-sm font-medium"><ArrowLeft size={16}/>Cambiar horario</button>
                    <h2 ref={stepTitle} tabIndex={-1} className="text-lg font-semibold outline-none">2. Tus datos</h2>
                    <p className="mt-2 text-sm text-[#64786e]">
                      Tus datos básicos se registrarán en el espacio de tu nutriólogo. No necesitas crear una cuenta.
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
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block text-sm font-medium">Fecha de nacimiento
                        <input type="date" autoComplete="bday" min="1900-01-01" max={today} className={inputClass} value={birthDate} onChange={e => setBirthDate(e.target.value)}/>
                        {birthDate && age !== null && birthDate <= today && <span className="mt-2 block text-xs text-[#64786e]">{age} años · calculados automáticamente</span>}
                      </label>
                      <div><label className="block text-sm font-medium">Lada internacional
                        <input aria-label="Lada internacional" autoComplete="tel-country-code" maxLength={4} className={inputClass} value={countryCode} onChange={e => setCountryCode(e.target.value)} list="booking-calling-codes"/>
                        <datalist id="booking-calling-codes"><option value="+52">México</option><option value="+1">EE. UU. / Canadá</option><option value="+34">España</option><option value="+57">Colombia</option><option value="+54">Argentina</option></datalist>
                      </label></div>
                    </div>
                    <label className="mt-4 block text-sm font-medium">Número de WhatsApp
                      <input type="tel" autoComplete="tel-national" inputMode="tel" maxLength={20} className={inputClass} value={localPhone} onChange={e => setLocalPhone(e.target.value)}/>
                      <span className="mt-2 block text-xs font-normal text-[#64786e]">Sin la lada internacional; la agregamos automáticamente.</span>
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
                    <label className="mt-5 flex items-start gap-3 text-sm text-[#64786e]"><input type="checkbox" className="mt-1 size-4 shrink-0 accent-[#356454]" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>Autorizo que {data.name} registre mis datos básicos para gestionar mi cita.</span></label>
                    {!proof ? (
                      <>
                        <button
                          className="nuth-button mt-4 w-full"
                          disabled={
                            !selected ||
                            !validRegistration ||
                            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
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
                          !selected || !validRegistration || working
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
                              registration: { birthDate, countryCode, phone, consent },
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
                                setContactStep(false);
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
                            : "Completar reserva"}
                      </button>
                    )}
                  </section>}
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
