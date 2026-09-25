import type { Metadata } from 'next';
import { SITE_ORIGIN } from './site';

export const productMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: 'Nuthrick — Hasta el mejor nutriólogo tiene sus trucos',
  description: 'Nuthrick conecta evaluación, cálculos, decisiones, indicaciones y seguimiento para que los profesionales de nutrición terminen más trabajo durante la consulta y tengan menos pendientes después.',
  openGraph: {
    title: 'Nuthrick — Hasta el mejor nutriólogo tiene sus trucos',
    description: 'Termina más trabajo durante la consulta y ten menos pendientes después.',
    images: [{ url: '/og.png', width: 1730, height: 909, alt: 'Nuthrick, herramientas para ejercer mejor la nutrición' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nuthrick — Hasta el mejor nutriólogo tiene sus trucos',
    description: 'Termina más trabajo durante la consulta y ten menos pendientes después.',
    images: ['/og.png'],
  },
};
