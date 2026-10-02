import { useEffect, useId, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
export type RecallSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => RecallSpeechRecognition;
  webkitSpeechRecognition?: new () => RecallSpeechRecognition;
};
const speechConstructor = () => typeof window === "undefined" ? undefined
  : (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
const joinText = (base: string, extra: string) => [base.trimEnd(), extra.trim()].filter(Boolean).join(" ").slice(0, 8000);

export function RecallNarrativeInput({ value, onChange, disabled, onListeningChange }: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onListeningChange: (listening: boolean) => void;
}) {
  const id = useId();
  const [listening, setListening] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const recognition = useRef<RecallSpeechRecognition | null>(null);
  const callbacks = useRef({ onChange, onListeningChange });
  useEffect(() => { callbacks.current = { onChange, onListeningChange }; }, [onChange, onListeningChange]);
  useEffect(() => {
    const abort = () => {
      const current = recognition.current;
      if (!current) return;
      recognition.current = null;
      current.onresult = current.onerror = current.onend = null;
      current.abort();
      setListening(false);
      setPreview(null);
      callbacks.current.onListeningChange(false);
    };
    const hide = () => { if (document.hidden) abort(); };
    document.addEventListener("visibilitychange", hide);
    if (disabled) abort();
    return () => {
      document.removeEventListener("visibilitychange", hide);
      abort();
    };
  }, [disabled]);

  function start() {
    const Constructor = speechConstructor();
    if (!Constructor || disabled || recognition.current) return;
    setMessage("");
    const base = value;
    let current: RecallSpeechRecognition;
    try { current = new Constructor(); } catch {
      setMessage("No pudimos iniciar el micrófono. Puedes continuar escribiendo.");
      return;
    }
    recognition.current = current;
    current.lang = "es-MX";
    current.continuous = true;
    current.interimResults = true;
    const finish = () => {
      if (recognition.current !== current) return;
      recognition.current = null;
      current.onresult = current.onerror = current.onend = null;
      setListening(false);
      setPreview(null);
      callbacks.current.onListeningChange(false);
    };
    current.onresult = ({ results }) => {
      if (recognition.current !== current) return;
      const all = Array.from(results);
      const final = joinText(base, all.filter((part) => part.isFinal).map((part) => part[0].transcript).join(" "));
      callbacks.current.onChange(final);
      setPreview(joinText(base, all.map((part) => part[0].transcript).join(" ")));
      if (final.length >= 8000) { setMessage("Alcanzaste el límite de 8,000 caracteres."); current.stop(); }
    };
    current.onend = finish;
    current.onerror = ({ error }) => {
      setMessage(error === "not-allowed" || error === "service-not-allowed"
        ? "No se autorizó el micrófono. Revisa los permisos del navegador o continúa escribiendo."
        : error === "no-speech" ? "No se detectó voz. Puedes iniciar el dictado de nuevo."
          : "El dictado se interrumpió. El texto reconocido se conserva; puedes continuar escribiendo.");
      finish();
      current.abort();
    };
    setListening(true);
    callbacks.current.onListeningChange(true);
    try { current.start(); } catch {
      finish();
      setMessage("No pudimos iniciar el micrófono. Puedes continuar escribiendo.");
    }
  }

  return <div>
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm">Texto capturado</label>
      <button type="button" aria-pressed={listening}
        aria-label={listening ? "Detener dictado" : "Dictar recordatorio"}
        disabled={disabled || !speechConstructor() || value.length >= 8000 && !listening}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${listening ? "border-red-300 bg-red-50 text-red-800" : "border-[#dfe5e1] bg-white text-[#315e4f]"}`}
        onClick={() => listening ? recognition.current?.stop() : start()}>
        {listening ? <Square size={15} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
        {listening ? "Detener" : "Dictar"}
      </button>
    </div>
    <textarea id={id} className="mt-2 w-full rounded-lg border border-[#dfe5e1] bg-white px-3 py-2 text-sm text-[#173d36]"
      rows={4} maxLength={8000} disabled={disabled} readOnly={listening}
      placeholder="Describe lo que comió y bebió, con las cantidades que recuerde."
      value={preview ?? value} onChange={(event) => onChange(event.target.value)} />
    <p className="mt-1 text-xs leading-5 text-[#687870]">
      {speechConstructor() ? "El dictado usa el servicio de voz del navegador, que puede procesar audio en línea. Nuthrick guarda el texto al confirmar el recordatorio."
        : "Este navegador no ofrece dictado. Puedes escribir o usar el micrófono del teclado de tu dispositivo."}
    </p>
    {(listening || message) && <p role="status" className="mt-2 text-xs text-[#315e4f]">
      {listening ? "Escuchando… Detén el dictado para revisar y editar el texto." : message}
    </p>}
  </div>;
}
