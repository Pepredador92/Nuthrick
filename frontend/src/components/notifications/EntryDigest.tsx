import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { useNotifications } from '@/src/features/notifications/useNotifications';
import { notificationPath } from '@/src/features/notifications/model';
import { listAppointments, confirmationOpensAt, type Appointment } from '@/src/services/appointments';
import { AppointmentCard } from '@/src/components/agenda/AppointmentCard';

export function upcomingReminders(items: Appointment[], now = Date.now()) {
  return items.filter(item => item.status === 'confirmed' && Date.parse(item.starts_at) > now && confirmationOpensAt(item) <= now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export function EntryDigest() {
  const { user } = useAuth();
  return user ? <DigestSession key={user.id} userId={user.id} /> : null;
}

function DigestSession({ userId }: { userId: string }) {
  const { items, loading, markRead } = useNotifications();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const key = `nuthrick:entry-digest:${userId}:${new Date().toLocaleDateString('en-CA')}`;
  const messageKey = `nuthrick:message-alerts:${userId}`;
  const [dismissedMessages, setDismissedMessages] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(messageKey) ?? '[]');
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
    } catch { return []; }
  });
  const [alreadySeen] = useState(() => { try { return sessionStorage.getItem(key) === 'seen'; } catch { return false; } });
  const showAgenda = !alreadySeen && !dismissed && appointments !== null;
  const notices = showAgenda ? items.filter(item => !item.read_at && item.type !== 'portal_message') : [];
  const upcoming = showAgenda ? upcomingReminders(appointments ?? []) : [];
  const messages = items.filter(item => !item.read_at && item.type === 'portal_message' && !dismissedMessages.includes(item.id));
  const show = !loading && (messages.length > 0 || upcoming.length > 0 || notices.length > 0);

  useEffect(() => {
    if (alreadySeen) return;
    let active = true;
    void listAppointments().then(result => { if (active) setAppointments(result.appointments); }, () => { if (active) setAppointments([]); });
    return () => { active = false; };
  }, [alreadySeen]);

  useEffect(() => {
    if (!show) return;
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, [show]);

  function close() {
    try { sessionStorage.setItem(key, 'seen'); } catch { /* Keep the session usable when storage is unavailable. */ }
    // Dismissing an alert does not read the conversation. Remember only IDs,
    // so a new message can reopen the dialog without repeating older alerts.
    const next = [...new Set([...dismissedMessages, ...messages.map(item => item.id)])].slice(-500);
    try { sessionStorage.setItem(messageKey, JSON.stringify(next)); } catch { /* State still deduplicates alerts during this mount. */ }
    setDismissedMessages(next);
    setDismissed(true);
  }
  async function refresh() {
    try { setAppointments((await listAppointments()).appointments); } catch { /* Existing cards report action errors; retain the last available list. */ }
  }
  if (!show) return null;
  return <dialog ref={dialog} aria-labelledby="entry-digest-title" onCancel={event => { event.preventDefault(); close(); }} className="m-auto max-h-[90dvh] w-[min(900px,calc(100vw-24px))] overflow-y-auto rounded-3xl border border-[#dce6de] bg-[#f6f8f4] p-5 text-[#173d36] shadow-xl backdrop:bg-[#102d27]/50 sm:p-8">
    <header className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#537365]">{messages.length ? 'Mensajes de tus pacientes' : 'Antes de comenzar'}</p><h2 id="entry-digest-title" className="mt-2 text-2xl font-semibold">{messages.length ? messages.length === 1 ? 'Recibiste un mensaje nuevo' : `Tienes ${messages.length} mensajes nuevos` : 'Tu agenda necesita una mirada'}</h2><p className="mt-2 text-sm text-[#63796d]">{messages.length ? 'Abre la conversación para leer y responder. Si lo dejas para después, el aviso seguirá en la campana.' : 'Revisa tus próximas citas y los avisos pendientes. También los encontrarás en la campana.'}</p></div><button type="button" className="nuth-button-secondary shrink-0" onClick={close}>Cerrar</button></header>
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      {messages.length > 0 && <section className="md:col-span-2" aria-label="Mensajes nuevos"><ul className="grid gap-3 md:grid-cols-2">{messages.map(item => <li key={item.id} className="rounded-2xl border border-[#dce6de] bg-white p-5"><h3 className="font-semibold">{item.actor_name || 'Tu paciente'}</h3><p className="mt-2 text-sm text-[#63796d]">{item.title}</p><button type="button" className="nuth-button mt-4" onClick={() => { void markRead(item.id); close(); navigate(notificationPath(item)); }}>Abrir conversación</button></li>)}</ul></section>}
      {upcoming.length > 0 && <section className={notices.length ? '' : 'md:col-span-2'} aria-label="Recordatorios de citas"><h3 className="mb-3 font-semibold">En las próximas 48 horas · {upcoming.length}</h3><div className="space-y-3">{upcoming.map(appointment => <AppointmentCard key={appointment.id} appointment={appointment} onChanged={() => void refresh()} />)}</div></section>}
      {notices.length > 0 && <section className={upcoming.length ? '' : 'md:col-span-2'} aria-label="Avisos de agenda"><h3 className="mb-3 font-semibold">Por revisar · {notices.length}</h3><ul className="space-y-2">{notices.map(item => <li key={item.id}><button type="button" className="w-full rounded-xl border border-[#dce6de] bg-white p-4 text-left text-sm font-semibold hover:bg-[#eaf3ed]" onClick={() => { void markRead(item.id); close(); navigate(notificationPath(item)); }}>{item.title}<span className="mt-2 block text-xs font-normal text-[#63796d]">Abrir en agenda →</span></button></li>)}</ul></section>}
    </div>
    <footer className="mt-6 flex flex-wrap justify-end gap-3 border-t border-[#dce6de] pt-4"><button type="button" className="nuth-button-secondary" onClick={close}>Revisar después</button>{(upcoming.length > 0 || notices.length > 0) && <button type="button" className="nuth-button" onClick={() => { close(); navigate('/app/agenda'); }}>Ir a mi agenda</button>}</footer>
  </dialog>;
}
