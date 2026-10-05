import type { Metadata } from 'next';
import { SITE_ORIGIN } from './site';

const title = 'Software para nutriólogos | Nuthrick';
const description = 'Cuida tu consulta y tu tiempo. Organiza expedientes, cálculos, planes de alimentación y seguimiento con Nuthrick, software creado por un nutriólogo.';

export const productMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title,
  description,
  icons: { icon: '/favicon.svg', apple: '/brand/apple-touch-icon.png' },
  openGraph: {
    title,
    description,
    siteName: 'Nuthrick',
    locale: 'es_MX',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Nuthrick, herramientas para ejercer mejor la nutrición' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og.png'],
  },
};
