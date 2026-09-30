import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPublicCommercialData, publicPlans } from './publicCommercial';

const plan = {
  id: 'public-plan', name: 'Consulta', monthly_price: 123.5, annual_price: 1200,
  currency: 'MXN', values: { 'patients.limit': 5 },
};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('public commercial data', () => {
  it('omits internal, inactive and malformed entries without rejecting valid unset prices', () => {
    expect(publicPlans([plan, { ...plan, internal_only: true }, { ...plan, active: false },
      { ...plan, monthly_price: -1 }, { ...plan, annual_price: 'wrong' },
      { ...plan, currency: '<MXN>' }, { ...plan, values: null }, null])).toEqual([plan]);
    expect(publicPlans([{ ...plan, monthly_price: null }])).toHaveLength(1);
    expect(publicPlans({ error: 'unavailable' })).toEqual([]);
  });

  it('loads fresh anonymous prices on each request without a product session or fixed fallback', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://public.example.test');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    let price = 123.5;
    const fetcher = vi.fn(async (url: URL) => new Response(JSON.stringify(
      url.pathname.endsWith('plan_catalog') ? [{ ...plan, monthly_price: price }] : [{ support_email: 'support@example.test' }]
    )));
    vi.stubGlobal('fetch', fetcher);
    expect(await loadPublicCommercialData()).toEqual({ plans: [plan], supportEmail: 'support@example.test' });
    price = 159;
    expect((await loadPublicCommercialData()).plans[0].monthly_price).toBe(159);
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const [, options] of fetcher.mock.calls as unknown as [URL, RequestInit][]) {
      expect(options.cache).toBe('no-store');
      expect(options.headers).toEqual({ apikey: 'sb_publishable_test', 'Content-Type': 'application/json' });
    }
  });

  it('keeps the landing available with no fabricated prices when the public service fails', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://public.example.test');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('service unavailable')));
    expect(await loadPublicCommercialData()).toEqual({ plans: [], supportEmail: null });
  });

  it('does not request placeholder infrastructure before configuration exists', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await loadPublicCommercialData()).toEqual({ plans: [], supportEmail: null });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
