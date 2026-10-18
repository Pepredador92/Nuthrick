import { useEffect, useRef, useState } from 'react';
import { EntryDigest } from '@/src/components/notifications/EntryDigest';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { announcementMediaUrl, fetchEntryAnnouncements, recordAnnouncement } from './api';
import { announcementIsActive, type Announcement } from './model';
import { AnnouncementModal } from './AnnouncementModal';

// Automatic announcements yield to every existing dialog, including the AI
// consent and onboarding overlays, without claiming that the user dismissed it.
function useOtherDialogOpen() {
  const [blocked, setBlocked] = useState(true);
  useEffect(() => {
    const inspect = () => setBlocked([...document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')]
      .some(element => !element.hasAttribute('data-announcement-dialog') && !element.closest('[hidden], [aria-hidden="true"]')));
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-modal', 'hidden', 'aria-hidden'] });
    inspect();
    return () => observer.disconnect();
  }, []);
  return blocked;
}

export function EntryAnnouncements() {
  const { user } = useAuth();
  return user ? <AnnouncementSession key={user.id} /> : null;
}

function AnnouncementSession() {
  const [digestAvailable, setDigestAvailable] = useState(false);
  const blocked = useOtherDialogOpen();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [index, setIndex] = useState(0);
  const [media, setMedia] = useState<{ id: string; url: string } | null>(null);
  const [now, setNow] = useState(Date.now);
  const impressions = useRef(new Set<string>());
  const current = items?.slice(index).find(item => announcementIsActive(item, now));
  const currentIndex = current && items ? items.indexOf(current) : -1;
  const enabled = digestAvailable && !blocked;

  useEffect(() => {
    if (!enabled || items !== null) return;
    let active = true;
    void fetchEntryAnnouncements().then(result => { if (active) setItems(result); }, () => { if (active) setItems([]); });
    return () => { active = false; };
  }, [enabled, items]);
  useEffect(() => {
    if (!current) return;
    let active = true;
    void announcementMediaUrl(current.media_path).then(url => { if (active) setMedia({ id: current.id, url }); }, () => { if (active) setMedia({ id: current.id, url: '' }); });
    return () => { active = false; };
  }, [current]);
  useEffect(() => {
    if (!current?.ends_at) return;
    const remaining = Date.parse(current.ends_at) - Date.now();
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(remaining, 2147483647)));
    return () => window.clearTimeout(timer);
  }, [current, now]);
  const close = (followAction = false) => {
    if (!current) return;
    void recordAnnouncement(current, 'dismiss').catch(() => { /* The announcement never prevents entry to the workspace. */ });
    setIndex(followAction ? items?.length ?? 0 : currentIndex + 1);
  };
  const shown = () => {
    if (!current || impressions.current.has(current.id)) return;
    impressions.current.add(current.id);
    void recordAnnouncement(current, 'seen').then(accepted => {
      if (!accepted) setIndex(value => Math.max(value, currentIndex + 1));
    }).catch(() => { /* Retain a usable close button during a connection interruption. */ });
  };

  return <><EntryDigest onAvailabilityChange={setDigestAvailable} />{enabled && current && media?.id === current.id && announcementIsActive(current, now) && <AnnouncementModal
    key={current.id} item={current} mediaUrl={media.url} onShown={shown} onClose={() => close()} onAction={() => close(true)}
    position={{ current: currentIndex + 1, total: items?.length ?? 0 }}
  />}</>;
}
