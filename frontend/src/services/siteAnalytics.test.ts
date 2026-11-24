import { beforeEach, expect, it, vi } from 'vitest';
import { trackPublicProfileVisit, trackSiteVisit } from './siteAnalytics';
import { publicReferrer, publicVisitPath } from '../../../supabase/functions/_shared/site-analytics';
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/src/lib/supabase', () => ({ supabase: { auth } }));
beforeEach(() => {
  sessionStorage.clear();
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 204})));
});
it('excludes patient links, private workspaces, authentication and registration forms', () => {
  for (const path of ['/mi-espacio#secret','/agenda/confirmar#secret','/agenda/tu-cita#secret','/agenda/responder?token=secret','/app','/admin','/auth/callback','/login','/register','/p/nutri/agendar/datos','//evil.invalid']) trackSiteVisit(path);
  expect(fetch).not.toHaveBeenCalled();
});
it('strips query strings, fragments and public profile identifiers', () => {
  expect(publicVisitPath('/?campaign=one#token')).toBe('/');
  expect(publicVisitPath('/p/jane-doe')).toBe('/perfil-publico');
  expect(publicVisitPath('/p/jane-doe/agendar?token=secret')).toBe('/reservar-cita');
  expect(publicReferrer('https://example.com/patient?token=secret#private')).toBe('https://example.com');
  expect(publicReferrer('https://secret:password@example.com')).toBe('');
  expect(publicReferrer('javascript:alert(1)')).toBe('');
});
it('reuses an anonymous session for server deduplication and disables the Referer header', () => {
  trackSiteVisit('/?campaign=one'); trackSiteVisit('/');
  const calls=vi.mocked(fetch).mock.calls;
  const first=JSON.parse(calls[0][1]?.body as string), second=JSON.parse(calls[1][1]?.body as string);
  expect(first.path).toBe('/');expect(first.sessionId).toBe(second.sessionId);
  expect(calls[0][1]).toEqual(expect.objectContaining({referrerPolicy:'no-referrer',keepalive:true}));
});
it('tracks the loaded professional profile using a stable browser session', async () => {
  trackSiteVisit('/p/nutri');
  await trackPublicProfileVisit('nutri?token=private');
  expect(fetch).not.toHaveBeenCalled();

  await trackPublicProfileVisit('Nutri');
  await trackPublicProfileVisit('nutri');
  const [first, second] = vi.mocked(fetch).mock.calls.map(call => JSON.parse(call[1]?.body as string));
  expect(first).toMatchObject({ path: '/perfil-publico', profileSlug: 'nutri' });
  expect(first.sessionId).toBe(second.sessionId);
  expect(vi.mocked(fetch).mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
});
it('sends an authenticated viewer token in the header for server-side owner exclusion', async () => {
  auth.getSession.mockResolvedValueOnce({ data: { session: { access_token: 'signed-token' } }, error: null });
  await trackPublicProfileVisit('nutri');
  const request = vi.mocked(fetch).mock.calls[0][1];
  expect(request?.headers).toHaveProperty('Authorization', 'Bearer signed-token');
  expect(request?.body).not.toContain('signed-token');
});
