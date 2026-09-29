import type { Metadata } from 'next';
import { LandingPage } from '@/src/screens/LandingPage';
import { productMetadata } from '@/src/lib/productMetadata';
import { landingStructuredData } from '@/src/lib/landingStructuredData';
import { publicUrl } from '@/src/lib/site';
import { PublicVisitTracker } from '@/src/components/marketing/PublicVisitTracker';

export const metadata: Metadata = {
  ...productMetadata,
  alternates: { canonical: publicUrl('/') },
  robots: { index: true, follow: true },
  openGraph: { ...productMetadata.openGraph, url: publicUrl('/') },
};

export default function PublicLanding() {
  return <>
    <PublicVisitTracker path="/" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(landingStructuredData).replace(/</g, '\\u003c') }} />
    <LandingPage />
  </>;
}
