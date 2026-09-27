import type { MetadataRoute } from 'next';
import { publicUrl } from '@/src/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    // Let crawlers read the server noindex on account/private routes. Auth
    // guards, not robots.txt, protect patient data. Only public URLs are listed.
    rules: { userAgent: '*', allow: '/' },
    sitemap: publicUrl('/sitemap.xml'),
  };
}
