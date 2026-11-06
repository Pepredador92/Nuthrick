import { applicationMetadata } from '@/src/lib/applicationMetadata';
import type { Metadata } from 'next';
import { ClientApplication } from '@/src/app/ClientApplication';

export default function ApplicationRoute() {
  return <ClientApplication />;
}

export async function generateMetadata({ params }: { params: Promise<{ path?: string[] }> }): Promise<Metadata> {
  const { path = [] } = await params;
  const pathname = '/' + path.map(encodeURIComponent).join('/');
  return applicationMetadata(pathname);
}
