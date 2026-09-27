import type { Metadata } from 'next';
import { SITE_ORIGIN } from './site';

const title = 'Software para nutriólogos | Nuthrick';
const description = 'Organiza expedientes, cálculos, planes de alimentación y seguimiento con Nuthrick. Software creado por un nutriólogo para terminar cada consulta con el trabajo hecho.';

export const productMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title,
  description,
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title,
    description,
    siteName: 'Nuthrick',
    locale: 'es_MX',
    images: [{ url: '/og.png', width: 1730, height: 909, alt: 'Nuthrick, herramientas para ejercer mejor la nutrición' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og.png'],
  },
};
