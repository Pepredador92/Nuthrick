import { beforeEach, expect, it, vi } from 'vitest';
import { trackSiteVisit } from './siteAnalytics';
import { publicReferrer, publicVisitPath } from '../../../supabase/functions/_shared/site-analytics';
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {status: 204})));
});
it('excludes patient links, private workspaces, authentication and registration forms', () => {
  for (const path of ['/mi-espacio#secret','/agenda/confirmar#secret','/agenda/responder?token=secret','/app','/admin','/auth/callback','/login','/register','/p/nutri/agendar/datos','//evil.invalid']) trackSiteVisit(path);
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
