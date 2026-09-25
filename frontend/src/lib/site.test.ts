import { afterEach, expect, it, vi } from 'vitest';
import { siteOrigin, PUBLIC_SITE_ORIGIN, TECHNICAL_SITE_ORIGIN, productOriginAllowed } from '../../../supabase/functions/_shared/site';
import { publicUrl, authRedirectUrl } from './site';
afterEach(()=>vi.unstubAllGlobals());
it('share links remain canonical while the technical domain is open',()=>{
 vi.stubGlobal('window',{location:{origin:TECHNICAL_SITE_ORIGIN}});
 expect(publicUrl('/p/jose-olmedo')).toBe('https://nuthrick.com/p/jose-olmedo');
 expect(publicUrl('/mi-espacio#opaque-token')).toBe('https://nuthrick.com/mi-espacio#opaque-token');
 expect(authRedirectUrl('/reset-password')).toBe('https://nuthrick.com/reset-password');
});
it('local auth keeps its session origin without changing public links',()=>{
 vi.stubGlobal('window',{location:{origin:'http://localhost:5173'}});
 expect(authRedirectUrl('/auth/callback')).toBe('http://localhost:5173/auth/callback');
 expect(publicUrl('/privacy')).toBe('https://nuthrick.com/privacy');
});
it('site configuration and public paths cannot introduce external redirects',()=>{
 expect(siteOrigin('https://nuthrick.com/')).toBe(PUBLIC_SITE_ORIGIN);
 for(const value of ['http://nuthrick.com','https://name:secret@nuthrick.com','https://nuthrick.com/path','https://nuthrick.com?next=external'])expect(()=>siteOrigin(value)).toThrow();
 for(const path of ['https://other.example','//other.example','/\\other.example'])expect(()=>publicUrl(path)).toThrow();
 expect(productOriginAllowed(TECHNICAL_SITE_ORIGIN,PUBLIC_SITE_ORIGIN)).toBe(true);
 expect(productOriginAllowed('https://nuthrick.vercel.app.attacker.example',PUBLIC_SITE_ORIGIN)).toBe(false);
 expect(productOriginAllowed('https://preview.vercel.app',PUBLIC_SITE_ORIGIN)).toBe(false);
});
