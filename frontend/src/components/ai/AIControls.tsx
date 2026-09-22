import { useEffect, useState, type ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { aiMessages, getAIBalance, type AIBalance, type AIState } from '@/src/services/ai';

export function AIButton({ state = 'idle', children = 'Generar con IA', disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { state?: AIState }) {
  return <button {...props} type="button" disabled={disabled || state === 'generating' || state === 'uncertain' || state === 'insufficient'} aria-busy={state === 'generating'} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#173d36] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55 ${props.className ?? ''}`}>
    {state === 'generating' && <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
    {state === 'generating' ? 'Generando…' : children}
  </button>;
}
export function AIGenerationState({ state }: { state: AIState }) {
  if (state === 'idle') return null;
  const messages = { generating: 'Generando…', ready: 'Listo', error: 'No se pudo generar.', insufficient: aiMessages.insufficient_credits, uncertain: aiMessages.provider_outcome_unknown };
  return <p role="status" aria-live="polite" className="mt-2 text-sm text-[#52675f]">{messages[state]}</p>;
}
export function AIUsageIndicator() {
  const [balance,setBalance] = useState<AIBalance | null>(null);
  const [failed,setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void getAIBalance().then(value => { if (alive) { setBalance(value); setFailed(false); } }).catch(() => { if (alive) setFailed(true); }); };
    refresh(); window.addEventListener('nuthrick:ai-balance',refresh); window.addEventListener('focus',refresh);
    return () => { alive = false; window.removeEventListener('nuthrick:ai-balance',refresh); window.removeEventListener('focus',refresh); };
  },[]);
  return <div className="rounded-xl border border-[#dfe5e1] bg-white px-3 py-2 text-xs text-[#52675f]" role="status">
    <span className="font-semibold text-[#173d36]">IA</span><span className="ml-2">{failed ? 'Saldo no disponible' : balance ? `${balance.available_credits.toLocaleString('es-MX',{ maximumFractionDigits: 3 })} créditos disponibles` : 'Consultando saldo…'}</span>
    {!failed && balance && balance.reserved_credits > 0 && <p className="mt-1">{balance.reserved_credits.toLocaleString('es-MX')} en reserva</p>}
  </div>;
}
