import type { MetadataRoute } from 'next';
import { publicUrl } from '@/src/lib/site';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/terms', '/privacy', '/refunds'].map(path => ({url: publicUrl(path)}));
}
