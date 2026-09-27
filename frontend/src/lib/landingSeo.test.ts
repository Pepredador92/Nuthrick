import { describe, expect, it } from 'vitest';
import { landingStructuredData } from './landingStructuredData';
import { productMetadata } from './productMetadata';
import { generateMetadata } from '../../app/[...path]/page';
import sitemap from '../../app/sitemap';
import robots from '../../app/robots';
import { publicUrl } from './site';

describe('public landing SEO', () => {
  it('marks only real public facts and never adds reviews or prices as offers', () => {
    expect(landingStructuredData['@graph'].map(item => item['@type'])).toEqual(['WebSite', 'Organization', 'Person', 'SoftwareApplication']);
    expect(JSON.stringify(landingStructuredData)).not.toMatch(/aggregateRating|review|offers/);
    expect(productMetadata.title).toBe('Software para nutriólogos | Nuthrick');
  });
  it('keeps private and unknown routes noindex while permitting crawlers to read that instruction', async () => {
    for (const path of [['app','patients','123'], ['admin'], ['login'], ['register'], ['onboarding'], ['unknown-preview']]) {
      expect((await generateMetadata({ params: Promise.resolve({ path }) })).robots).toEqual({ index: false, follow: false });
    }
    expect(robots().rules).toEqual({ userAgent: '*', allow: '/' });
  });
  it('lists only intentionally public pages in the sitemap', () => {
    expect(sitemap().map(item => item.url)).toEqual(['/', '/terms', '/privacy', '/refunds'].map(publicUrl));
  });
});
