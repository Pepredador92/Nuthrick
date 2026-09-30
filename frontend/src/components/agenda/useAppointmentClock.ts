import { useEffect, useState } from 'react';

/** Refresh a long-open portal/notification center at the attendance boundary. */
export function useAppointmentClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  return now;
}
