const encoder = new TextEncoder();
export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function unbase64url(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
export function secretToken(): string { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function sha256(value: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
export async function codeHash(secret: string, id: string, code: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', unbase64url(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`agenda:otp:${id}:${code}`))));
}
export async function encrypt(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', unbase64url(secret), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('agenda:v1') }, key, encoder.encode(value));
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}
export async function decrypt(secret: string, envelope: string): Promise<string> {
  const [version, nonce, data] = envelope.split('.');
  if (version !== 'v1' || !nonce || !data) throw new Error('invalid_envelope');
  const key = await crypto.subtle.importKey('raw', unbase64url(secret), 'AES-GCM', false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64url(nonce), additionalData: encoder.encode('agenda:v1') }, key, unbase64url(data)));
}
export function normalizeEmail(input: unknown): string {
  if (typeof input !== 'string') throw new Error('invalid_email');
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)) throw new Error('invalid_email');
  return email;
}
export function parseInstant(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(input) || !Number.isFinite(Date.parse(input))) throw new Error('invalid_time');
  return new Date(input).toISOString();
}
export function overlaps(start: string, end: string, busy: { start: string; end: string }): boolean {
  return Date.parse(start) < Date.parse(busy.end) && Date.parse(end) > Date.parse(busy.start);
}
export function calendarEventId(appointmentId: string): string {
  if (!/^[a-f0-9-]{36}$/.test(appointmentId)) throw new Error('invalid_id');
  return `n${appointmentId.replaceAll('-', '')}`;
}
export function readFreeBusy(body: unknown, calendarIds: string[]): { start: string; end: string }[] {
  if (!body || typeof body !== 'object' || !('calendars' in body)) throw new Error('google_unavailable');
  const calendars = body.calendars as Record<string, { errors?: unknown[]; busy?: { start: string; end: string }[] }>;
  return calendarIds.flatMap(id => {
    const calendar = calendars[id];
    if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw new Error('google_unavailable');
    return calendar.busy.map(item => ({ start: parseInstant(item.start), end: parseInstant(item.end) }));
  });
}
export function gmailMessage(sender: string, recipient: string, subject: string, text: string, id: string): string {
  const from = normalizeEmail(sender), to = normalizeEmail(recipient);
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('invalid_id');
  const encodedSubject = btoa(String.fromCharCode(...encoder.encode(subject)));
  const body = btoa(String.fromCharCode(...encoder.encode(text)));
  const mime = `From: Nuthrick <${from}>\r\nTo: ${to}\r\nSubject: =?UTF-8?B?${encodedSubject}?=\r\nMessage-ID: <agenda-${id}@nuthrick.vercel.app>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}`;
  return base64url(encoder.encode(mime));
}
