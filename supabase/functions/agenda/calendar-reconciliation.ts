// Read only: never overwrite an externally edited event. Request logistical
// fields only; titles, descriptions, attendees and clinical data are unnecessary.
export type CalendarCheck = {
  appointmentId: string;
  eventId: string;
  calendarId: string;
  busyCalendarIds: string[];
  start: string;
  end: string;
};
type Event = {
  id?: string; status?: string; transparency?: string;
  start?: { dateTime?: string }; end?: { dateTime?: string };
  extendedProperties?: { private?: { nuthrickAppointment?: string } };
};
export async function checkCalendarConflict(check: CalendarCheck, accessToken: string, request: typeof fetch = fetch): Promise<boolean> {
  // A single deadline covers every calendar/page, not 12 seconds per page.
  const deadline = AbortSignal.timeout(25000);
  const signal = () => AbortSignal.any([deadline, AbortSignal.timeout(12000)]);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const base = 'https://www.googleapis.com/calendar/v3/calendars/';
  const own = new URL(`${base}${encodeURIComponent(check.calendarId)}/events/${encodeURIComponent(check.eventId)}`);
  own.searchParams.set('fields', 'id,status,transparency,start,end,extendedProperties/private');
  const response = await request(own, { headers, signal: signal() });
  if ([404, 410].includes(response.status)) return true;
  if (!response.ok) throw new Error('google_unavailable');
  const event = await response.json() as Event;
  if (event.status === 'cancelled' || event.transparency === 'transparent' ||
    event.extendedProperties?.private?.nuthrickAppointment !== check.appointmentId ||
    Date.parse(event.start?.dateTime || '') !== Date.parse(check.start) ||
    Date.parse(event.end?.dateTime || '') !== Date.parse(check.end)) return true;

  for (const calendar of new Set([...check.busyCalendarIds, check.calendarId])) {
    let next = '';
    for (let page = 0; page < 10; page++) {
      const url = new URL(`${base}${encodeURIComponent(calendar)}/events`);
      url.search = new URLSearchParams({ timeMin: check.start, timeMax: check.end,
        singleEvents: 'true', showDeleted: 'false', maxResults: '250',
        fields: 'items(id,status,transparency),nextPageToken', ...(next ? { pageToken: next } : {}) }).toString();
      const res = await request(url, { headers, signal: signal() });
      if (!res.ok) throw new Error('google_unavailable');
      const data = await res.json() as { items?: Event[]; nextPageToken?: string };
      // events.list filters overlap server-side, including all-day/recurring
      // events. Its bounds are exclusive on end/start, so adjacency is safe.
      if ((data.items || []).some(item => item.status !== 'cancelled' && item.transparency !== 'transparent' &&
        !(calendar === check.calendarId && item.id === check.eventId))) return true;
      next = data.nextPageToken || '';
      if (!next) break;
      if (page === 9) throw new Error('google_unavailable');
    }
  }
  return false;
}
