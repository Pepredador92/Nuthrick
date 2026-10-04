import type { Metadata } from 'next';
import { LandingPage } from '@/src/screens/LandingPage';
import { productMetadata } from '@/src/lib/productMetadata';
import { landingStructuredData } from '@/src/lib/landingStructuredData';
import { publicUrl } from '@/src/lib/site';
import { PublicVisitTracker } from '@/src/components/marketing/PublicVisitTracker';
import { loadPublicCommercialData } from '@/src/lib/publicCommercial';
import { AuthReturnRedirect } from '@/src/features/auth/AuthReturnRedirect';
import { ThemeSwitcher } from '@/src/features/theme/ThemeSwitcher';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...productMetadata,
  alternates: { canonical: publicUrl('/') },
  robots: { index: true, follow: true },
  openGraph: { ...productMetadata.openGraph, url: publicUrl('/') },
};

export default async function PublicLanding() {
  const commercial = await loadPublicCommercialData();
  return <>
    <AuthReturnRedirect />
    <PublicVisitTracker path="/" />
    <div className="nuth-public-theme-control"><ThemeSwitcher compact /></div>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(landingStructuredData).replace(/</g, '\\u003c') }} />
    <LandingPage plans={commercial.plans} supportEmail={commercial.supportEmail} />
  </>;
}
