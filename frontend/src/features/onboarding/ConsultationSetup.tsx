import { ArrowRight, Check, ClipboardList, Clock3, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useAccess } from '@/src/features/admin/AccessProvider';
import { canUseFeature } from '@/src/features/admin/api';
import { supabase } from '@/src/lib/supabase';
import './ConsultationSetup.css';

const metadataKey = 'nuthrick_consultation_setup_v1';
const setupPath = '/app/consultation-templates/initial';
type Progress = { seen_at: string; completed_at?: string };
type SetupContext = {
  pending: boolean;
  welcomePending: boolean;
  saving: boolean;
  error: string;
  complete: () => Promise<void>;
};
const Setup = createContext<SetupContext>({ pending: false, welcomePending: false, saving: false, error: '', complete: async () => {} });

function progress(value: unknown): Progress | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.seen_at !== 'string' || !Number.isFinite(Date.parse(item.seen_at))) return null;
  return {
    seen_at: item.seen_at,
    ...(typeof item.completed_at === 'string' && Number.isFinite(Date.parse(item.completed_at)) ? { completed_at: item.completed_at } : {}),
  };
}

function savedProgress(userId: string, metadata: unknown): Progress | null {
  const remote = progress(metadata);
  try {
    const local = progress(JSON.parse(localStorage.getItem(`${metadataKey}:${userId}`) ?? 'null'));
    return remote?.completed_at ? remote : local?.completed_at ? local : remote ?? local;
  } catch { return remote; }
}

function cacheProgress(userId: string, value: Progress) {
  try { localStorage.setItem(`${metadataKey}:${userId}`, JSON.stringify(value)); } catch { /* Account metadata remains the cross-device source. */ }
}

export const useConsultationSetup = () => useContext(Setup);

export function ConsultationSetupProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const { data, loading: accessLoading } = useAccess();
  const navigate = useNavigate();
  const userId = user?.id;
  const [initialProgress] = useState(() => user ? savedProgress(user.id, user.user_metadata[metadataKey]) : null);
  const [record, setRecord] = useState(initialProgress);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const attempted = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const eligible = Boolean(user && profile?.onboarding_completed && canUseFeature(data?.access, 'consultation_design'));

  // These are display preferences, never authorization or clinical data. Auth
  // merges this one metadata key; other registration/profile metadata survives.
  const persist = useCallback((value: Progress) => {
    const task = writes.current.catch(() => {}).then(async () => {
      const result = await supabase.auth.updateUser({ data: { [metadataKey]: value } });
      if (result.error) throw result.error;
    });
    writes.current = task;
    return task;
  }, []);

  useEffect(() => {
    if (!eligible || !userId) return;
    let active = true;
    // Established professionals who already have their own active design do
    // not receive a new-user interruption when this feature is published.
    const inspect = async () => {
      if (!initialProgress) {
        const { data: templates } = await supabase.from('consultation_templates')
          .select('id').eq('professional_id', userId).eq('is_system', false).eq('is_active', true).limit(1);
        if (!active) return;
        if (templates?.length) {
          const now = new Date().toISOString();
          setRecord({ seen_at: now, completed_at: now });
        }
      }
      if (active) setChecked(true);
    };
    void inspect().catch(() => { if (active) setChecked(true); });
    return () => { active = false; };
  }, [eligible, initialProgress, userId]);

  useEffect(() => {
    if (!eligible || !checked || record || attempted.current || !user) return;
    attempted.current = true;
    const value = { seen_at: new Date().toISOString() };
    cacheProgress(user.id, value);
    setRecord(value);
    setOpen(true);
    // The local fallback keeps the optional welcome dismissible if offline.
    void persist(value).catch(() => {});
  }, [checked, eligible, persist, record, user]);

  const complete = useCallback(async () => {
    if (!user || !eligible || record?.completed_at || saving) return;
    setSaving(true);
    setError('');
    const value = { seen_at: record?.seen_at ?? new Date().toISOString(), completed_at: new Date().toISOString() };
    try {
      await persist(value);
      cacheProgress(user.id, value);
      setRecord(value);
    } catch {
      setError('No pudimos guardar la confirmación de esta revisión. Puedes volver a intentarlo.');
    } finally { setSaving(false); }
  }, [eligible, persist, record, saving, user]);

  const welcomePending = accessLoading || (eligible && (!checked || !record || open));
  return <Setup.Provider value={{ pending: eligible && checked && !record?.completed_at, welcomePending, saving, error, complete }}>
    {children}
    {eligible && open && <ConsultationWelcome onLater={() => setOpen(false)} onCustomize={() => {
      setOpen(false);
      navigate(setupPath);
    }} />}
  </Setup.Provider>;
}

function ConsultationWelcome({ onLater, onCustomize }: { onLater: () => void; onCustomize: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const gutter = document.documentElement.style.scrollbarGutter;
    document.documentElement.style.scrollbarGutter = 'stable';
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      document.documentElement.style.scrollbarGutter = gutter;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="consultation-welcome" aria-labelledby="consultation-welcome-title" aria-describedby="consultation-welcome-description consultation-welcome-purpose" onCancel={event => { event.preventDefault(); onLater(); }}>
    <div className="consultation-welcome-layout">
      <div className="consultation-welcome-art" aria-hidden="true">
        <img src="/images/consultation-welcome-forest.webp" alt="" width="1080" height="1440" />
      </div>
      <img className="consultation-welcome-logo" src="/brand/logotipo-ivory.svg" alt="Nuthrick" width="164" height="40" />
      <button type="button" className="consultation-welcome-close" aria-label="Cerrar y hacerlo después" onClick={onLater}><X size={21} /></button>
      <div className="consultation-welcome-copy">
        <span className="consultation-welcome-step"><span aria-hidden="true" />Configuración inicial</span>
        <h1 id="consultation-welcome-title">Personaliza tu consulta</h1>
        <p id="consultation-welcome-description">Antes de atender a tu primer paciente, adapta tu guion de consulta. Revisa las preguntas y elige lo que necesitas de acuerdo con el tiempo previsto para cada consulta.</p>
        <p id="consultation-welcome-purpose">Un guion bien ajustado te ayuda a mantener la duración de la consulta, cuidar tu energía y evitar que la sesión resulte demasiado larga o cansada para tu paciente.</p>
        <div className="consultation-welcome-actions">
          <button type="button" className="consultation-welcome-primary" onClick={onCustomize} autoFocus>Personalizar mi consulta<ArrowRight size={20} aria-hidden="true" /></button>
          <button type="button" className="consultation-welcome-later" onClick={onLater}>Hacerlo después</button>
        </div>
      </div>
    </div>
  </dialog>;
}

export function ConsultationSetupReminder() {
  const { pending } = useConsultationSetup();
  if (!pending) return null;
  return <aside className="consultation-setup-reminder" aria-labelledby="consultation-setup-reminder-title">
    <span className="consultation-setup-reminder-icon"><Clock3 size={21} aria-hidden="true" /></span>
    <div><h2 id="consultation-setup-reminder-title">Personaliza tu consulta</h2><p>Adapta las preguntas al tiempo previsto para tus sesiones.</p></div>
    <Link to={setupPath}>Personalizar mi consulta<ArrowRight size={16} aria-hidden="true" /></Link>
  </aside>;
}

export function ConsultationSetupReview({ disabled = false }: { disabled?: boolean }) {
  const { pending, saving, error, complete } = useConsultationSetup();
  if (!pending) return null;
  return <aside className="consultation-setup-review" aria-label="Revisión inicial del guion">
    <ClipboardList size={21} aria-hidden="true" />
    <div className="consultation-setup-review-copy"><strong>Revisa el guion de inicio y de seguimiento.</strong><p>{disabled ? 'Guarda los cambios de tu diseño antes de terminar esta revisión.' : 'Puedes personalizar las preguntas o conservar el diseño actual si se ajusta a tu consulta.'}</p>{error && <p className="consultation-setup-error" role="alert">{error}</p>}</div>
    <button type="button" disabled={disabled || saving} onClick={() => void complete()}><Check size={16} aria-hidden="true" />{saving ? 'Guardando…' : 'Ya revisé mi guion'}</button>
  </aside>;
}
