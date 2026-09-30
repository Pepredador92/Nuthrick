export type PublicPlan = {
  id: string;
  name: string;
  monthly_price: number | null;
  annual_price: number | null;
  currency: string;
  values: Record<string, unknown>;
};

function validPrice(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

export function publicPlans(value: unknown): PublicPlan[] {
  if (!Array.isArray(value)) return [];
  return value.filter((plan): plan is PublicPlan => Boolean(
    plan && typeof plan === 'object' && typeof plan.id === 'string' &&
    typeof plan.name === 'string' && plan.name.trim() &&
    typeof plan.currency === 'string' && /^[A-Z]{3}$/.test(plan.currency) &&
    validPrice(plan.monthly_price) && validPrice(plan.annual_price) &&
    plan.values && typeof plan.values === 'object' && !Array.isArray(plan.values) &&
    plan.active !== false && plan.internal_only !== true
  ));
}

export function publicPrice(amount: number | null, currency: string) {
  if (amount === null) return 'Por definir';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

// Anonymous public data only. Never use the authenticated product client here:
// the landing is server-rendered and must not depend on a visitor's session.
export async function loadPublicCommercialData() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) return { plans: [] as PublicPlan[], supportEmail: null as string | null };
  const read = async (path: string, method = 'GET'): Promise<unknown> => {
    try {
      const response = await fetch(new URL(`/rest/v1/${path}`, url), {
        method, headers: { apikey: key, 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: '{}' } : {}),
        cache: 'no-store', signal: AbortSignal.timeout(3500),
      });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };
  const [catalog, contacts] = await Promise.all([
    read('rpc/plan_catalog', 'POST'),
    read('operational_contact_public?select=support_email&id=eq.true&limit=1'),
  ]);
  const email = Array.isArray(contacts) ? contacts[0]?.support_email : null;
  return {
    plans: publicPlans(catalog),
    supportEmail: typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
  };
}
