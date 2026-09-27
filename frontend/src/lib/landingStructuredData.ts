import { publicUrl } from './site';

// Only facts presented on the landing. No ratings, invented credentials or
// offers: prices on the landing are indicative, not subscription contracts.
export const landingStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': publicUrl('/#website'),
      url: publicUrl('/'),
      name: 'Nuthrick',
      inLanguage: 'es-MX',
      publisher: { '@id': publicUrl('/#organization') },
    },
    {
      '@type': 'Organization',
      '@id': publicUrl('/#organization'),
      name: 'Nuthrick',
      url: publicUrl('/'),
      founder: { '@id': publicUrl('/#jose-olmedo') },
    },
    {
      '@type': 'Person',
      '@id': publicUrl('/#jose-olmedo'),
      name: 'José Olmedo',
      jobTitle: 'Nutriólogo y creador de Nuthrick',
      description: 'Nutriólogo con más de 8 años de experiencia en consulta privada.',
      image: publicUrl('/images/jose-olmedo-nuthrick-1280.webp'),
      url: publicUrl('/#creador'),
    },
    {
      '@type': 'SoftwareApplication',
      '@id': publicUrl('/#software'),
      name: 'Nuthrick',
      url: publicUrl('/'),
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: 'Software para nutriólogos: expedientes, cálculos, planes de alimentación y seguimiento nutricional.',
      creator: { '@id': publicUrl('/#jose-olmedo') },
      publisher: { '@id': publicUrl('/#organization') },
      inLanguage: 'es-MX',
    },
  ],
};
