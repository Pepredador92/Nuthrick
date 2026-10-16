import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateLayout } from './PrivateLayout';
import { SettingsPage } from '@/src/screens/SettingsPage';
import { openAIProcessingConsent } from '@/src/features/ai/AIProcessingConsent';

const signOut = vi.hoisted(() => vi.fn());
const access = vi.hoisted(() => ({
  allowed: true,
  read_only: false,
  status: 'active',
  values: { consultation_design: true, patients: true } as Record<string, boolean>,
}));
const billing = vi.hoisted(() => ({ value: { subscription: { state: 'active' }, access: { arrangement: 'monthly' } } as unknown }));
vi.mock('@/src/features/auth/AuthProvider', () => ({
  useAuth: () => ({ profile: { full_name: 'Nutriólogo de prueba' }, user: { id: 'owner', email: 'test@example.com' }, signOut }),
}));
vi.mock('@/src/features/admin/AccessProvider', async (original) => ({
  ...(await original<object>()),
  useAccess: () => ({ data: { access, is_admin: false } }),
}));
vi.mock('@/src/features/presence/useProfessionalPresence', () => ({ useProfessionalPresence: vi.fn() }));
vi.mock('@/src/components/ai/AIControls', () => ({ AIUsageIndicator: () => null }));
vi.mock('@/src/components/notifications/NotificationCenter', () => ({ NotificationCenter: () => null }));
vi.mock('@/src/components/notifications/EntryDigest', () => ({ EntryDigest: () => null }));
vi.mock('@/src/features/notifications/useNotifications', () => ({ NotificationsProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/src/features/support/SupportProvider', () => ({ SupportProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/src/features/support/SupportWidget', () => ({ SupportWidget: () => null }));
vi.mock('@/src/features/ai/AIProcessingConsent', () => ({ AIProcessingConsent: () => null, openAIProcessingConsent: vi.fn() }));
vi.mock('@/src/features/onboarding/BeginnerOnboarding', () => ({ BeginnerOnboarding: () => null, openBeginnerOnboarding: vi.fn() }));
vi.mock('@/src/features/billing/api', () => ({ getMyBilling: vi.fn(async () => billing.value) }));

function mount() {
  render(<MemoryRouter initialEntries={['/app']}><Routes>
    <Route path="/logout" element={<h1>Salida después de confirmar</h1>} />
    <Route path="/app" element={<PrivateLayout />}>
      <Route index element={<h1>Inicio</h1>} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="academy" element={<h1>Capacitación Nuthrick</h1>} />
      <Route path="consultation-templates/:consultationType" element={<h1>Editor de entrevista</h1>} />
    </Route>
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  access.allowed = true;
  access.values.consultation_design = true;
  billing.value = { subscription: { state: 'active' }, access: { arrangement: 'monthly' } };
});

describe('acceso a configuración de entrevistas', () => {
  it('requests navigation before revoking the session so consultation guards can run', () => {
    signOut.mockClear();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByRole('heading', { name: 'Salida después de confirmar' })).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });
  it('keeps training reachable when professional access has expired', () => {
    access.allowed = false;
    mount();
    fireEvent.click(screen.getByRole('link', { name: 'Capacitación Nuthrick' }));
    expect(screen.getByRole('heading', { name: 'Capacitación Nuthrick' })).toBeInTheDocument();
  });
  it('moves interview design out of the sidebar and opens it through account settings', async () => {
    mount();
    const sidebar = within(screen.getByRole('navigation', { name: 'Aplicación' }));
    expect(sidebar.queryByRole('link', { name: /Diseño|Configuración/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }));
    fireEvent.click(screen.getByRole('link', { name: 'Configuración' }));
    expect(screen.getByRole('heading', { name: 'Configuración' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menú de cuenta' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: /Abrir perfil/ })).toHaveAttribute('href', '/app/profile');
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Cambiar plan/ })).toHaveAttribute('href', '/app/my-plan#plan-actions');
      expect(screen.getByRole('link', { name: /Cancelar suscripción/ })).toHaveAttribute('href', '/app/my-plan#plan-actions');
    });
    expect(screen.getAllByRole('group', { name: 'Apariencia de Nuthrick' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Administrar consentimiento/ }));
    expect(openAIProcessingConsent).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: /Entrevista de seguimiento/ })).toHaveAttribute('href', '/app/consultation-templates/follow_up');
    fireEvent.click(screen.getByRole('link', { name: /Entrevista inicial/ }));
    expect(screen.getByRole('heading', { name: 'Editor de entrevista' })).toBeInTheDocument();
  });

  it('does not promise self-service cancellation for managed access', async () => {
    billing.value = { subscription: null, access: { arrangement: 'managed' } };
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }));
    fireEvent.click(screen.getByRole('link', { name: 'Configuración' }));
    expect(await screen.findByRole('link', { name: /Ver mi plan/ })).toHaveAttribute('href', '/app/my-plan#plan-actions');
    expect(screen.queryByRole('link', { name: /Cancelar suscripción/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Tu acceso es administrado por Nuthrick/)).toBeInTheDocument();
  });

  it('keeps design links unavailable when the subscription lacks the feature', () => {
    access.values.consultation_design = false;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Menú de cuenta' }));
    fireEvent.click(screen.getByRole('link', { name: 'Configuración' }));
    expect(screen.queryByRole('link', { name: /Entrevista inicial/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar mi plan' })).toHaveAttribute('href', '/app/my-plan');
    expect(screen.getByRole('link', { name: 'Ir a Pacientes' })).toHaveAttribute('href', '/app/patients');
  });

  it('closes the account dropdown on Escape and restores focus', () => {
    mount();
    const button = screen.getByRole('button', { name: 'Menú de cuenta' });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});
