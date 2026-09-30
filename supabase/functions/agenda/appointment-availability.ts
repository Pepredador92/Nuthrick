import { uuid } from './portal-content.ts';
import { overlaps } from './security.ts';
type Slot = { start: string; end: string };
type Availability = { day: string; today: string; lastDay: string; timezone: string; weekdays: number[]; slots: Slot[] };
export async function appointmentAvailability(request: Request, body: Record<string, unknown>, deps: {
  owner: (request: Request) => Promise<string>;
  load: (owner: string, day: string | null, mode: string, location: string | null) => Promise<Availability>;
  busy: (owner: string, start: string, end: string) => Promise<{ ranges: Slot[] }>;
}) {
  const owner = await deps.owner(request);
  if (!['online', 'in_person'].includes(String(body.modality))) throw new Error('invalid_option');
  if (body.day != null && (typeof body.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.day))) throw new Error('invalid_range');
  const result = await deps.load(owner, body.day as string | null ?? null, String(body.modality), body.locationId ? uuid(body.locationId) : null);
  if (!result.slots.length) return { ...result, connectionError: false };
  try {
    const { ranges } = await deps.busy(owner, result.slots[0].start, result.slots.at(-1)!.end);
    return { ...result, slots: result.slots.filter(slot => !ranges.some(range => overlaps(slot.start, slot.end, range))), connectionError: false };
  } catch {
    // An unavailable calendar must never be presented as an empty/free agenda.
    return { ...result, slots: [], connectionError: true };
  }
}
