import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/src/lib/supabase';

type ConsentStatus = { eligible: boolean; version: string; accepted: boolean; accepted_at: string | null };
const manageEvent = 'nuthrick:ai-consent-manage';

export function openAIProcessingConsent() {
  window.dispatchEvent(new Event(manageEvent));
}

export function AIProcessingConsent() {
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [authorization, setAuthorization] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: problem } = await supabase.rpc('my_ai_processing_consent');
    if (problem || !data) {
      setError('No pudimos verificar el estado del aviso de IA. Intenta de nuevo.');
      return;
    }
    const next = data as ConsentStatus;
    setStatus(next);
    setError('');
    if (next.eligible && !next.accepted) setOpen(true);
  }, []);

  useEffect(() => {
    void load();
    const manage = () => { setOpen(true); void load(); };
    window.addEventListener(manageEvent, manage);
    return () => window.removeEventListener(manageEvent, manage);
  }, [load]);

  const accept = async () => {
    if (!status || !authorization) return;
    setBusy(true);
    setError('');
    const { data, error: problem } = await supabase.rpc('accept_ai_processing_consent', {
      p_version: status.version,
      p_patient_authorization: true,
    });
    if (problem || !data) {
      setError('No pudimos guardar tu consentimiento. Actualiza el aviso e inténtalo de nuevo.');
    } else {
      setStatus(data as ConsentStatus);
      window.dispatchEvent(new Event('nuthrick:ai-consent-changed'));
      setOpen(false);
      setAuthorization(false);
    }
    setBusy(false);
  };

  const revoke = async () => {
    setBusy(true);
    setError('');
    const { data, error: problem } = await supabase.rpc('revoke_ai_processing_consent');
    if (problem || !data) setError('No pudimos retirar el consentimiento. Intenta de nuevo.');
    else {
      setStatus(data as ConsentStatus);
      window.dispatchEvent(new Event('nuthrick:ai-consent-changed'));
      setAuthorization(false);
    }
    setBusy(false);
  };

  if (!open || !status?.eligible) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#102d27]/55 p-4" role="presentation">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8" role="dialog" aria-modal="true" aria-labelledby="ai-consent-title">
        <p className="admin-eyebrow">AVISO DE IA · {status.version}</p>
        <h2 id="ai-consent-title" className="mt-2 text-2xl font-semibold text-[#17312c]">Antes de usar funciones de IA</h2>
        <div className="mt-4 space-y-3 text-sm leading-6 text-[#53665d]">
          <p>Nuthrick utiliza OpenAI para asistir con el Recordatorio de 24 horas, diagnóstico PES y borradores del Taller de dietas, según las funciones incluidas en tu plan. Cuando solicites una de estas funciones, se enviará a OpenAI el contexto clínico mínimo preparado para esa solicitud. La información no se considera anónima de forma garantizada.</p>
          <p>Las solicitudes de Nuthrick usan <code>store: false</code>, que evita guardar el estado de respuesta en la API. OpenAI puede conservar registros de control de abuso hasta por 30 días, con excepciones previstas en su documentación. Consulta los <a className="font-semibold underline" href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">controles de datos de OpenAI</a>.</p>
          <p>La IA ofrece apoyo y puede equivocarse. Revisa cada resultado con tu criterio profesional antes de incorporarlo al expediente o compartirlo. Puedes retirar este consentimiento desde el menú de tu cuenta; al retirarlo se bloquean nuevas solicitudes.</p>
        </div>
        {status.accepted ? (
          <div className="mt-6 rounded-2xl bg-[#f4f6f2] p-4 text-sm text-[#53665d]">
            <p>Consentimiento vigente{status.accepted_at ? ` desde ${new Date(status.accepted_at).toLocaleString('es-MX')}` : ''}.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="nuth-button-secondary" disabled={busy} onClick={() => setOpen(false)}>Cerrar</button>
              <button className="rounded-xl border border-[#bd7065] px-4 py-2 text-sm font-semibold text-[#963f34]" disabled={busy} onClick={() => void revoke()}>{busy ? 'Guardando…' : 'Retirar consentimiento'}</button>
            </div>
          </div>
        ) : (
          <>
            <label className="mt-6 flex items-start gap-3 rounded-2xl border border-[#dfe5e1] p-4 text-sm leading-6 text-[#405d4e]">
              <input className="mt-1 size-4 shrink-0 accent-[#356454]" type="checkbox" checked={authorization} onChange={(event) => setAuthorization(event.target.checked)} />
              <span>Confirmo que informaré a mis pacientes sobre este uso y que obtendré las autorizaciones que correspondan antes de enviar sus datos a una función de IA.</span>
            </label>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="nuth-button" disabled={!authorization || busy} onClick={() => void accept()}>{busy ? 'Guardando…' : 'Aceptar y habilitar la IA'}</button>
              <button className="nuth-button-secondary" disabled={busy} onClick={() => setOpen(false)}>Ahora no</button>
            </div>
          </>
        )}
        {error && <p className="mt-4 text-sm text-[#984a39]" role="alert">{error}</p>}
      </section>
    </div>
  );
}
