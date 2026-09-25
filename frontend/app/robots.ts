import type { MetadataRoute } from 'next';
import { publicUrl } from '@/src/lib/site';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/admin', '/auth', '/login', '/register', '/reset-password', '/forgot-password', '/mi-espacio', '/agenda/responder'] },
    sitemap: publicUrl('/sitemap.xml'),
  };
}
