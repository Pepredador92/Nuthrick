import { productMetadata } from '@/src/lib/productMetadata';
import type { Metadata } from 'next';
import { publicUrl } from '@/src/lib/site';
import { ClientApplication } from '@/src/app/ClientApplication';

export default function ApplicationRoute() {
  return <ClientApplication />;
}

export async function generateMetadata({ params }: { params: Promise<{ path?: string[] }> }): Promise<Metadata> {
  const { path = [] } = await params;
  const pathname = '/' + path.map(encodeURIComponent).join('/');
  const isPublic = ['/', '/terms', '/privacy', '/refunds'].includes(pathname);
  return {
    alternates: { canonical: publicUrl(pathname) },
    openGraph: { ...productMetadata.openGraph, url: publicUrl(pathname) },
    ...(isPublic ? {} : { robots: { index: false, follow: false } }),
  };
}
