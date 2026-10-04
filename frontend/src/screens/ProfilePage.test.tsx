import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';

vi.mock('@/src/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'professional' } }) }));
vi.mock('@/src/hooks/useProfileWorkspace', () => ({
  useProfileWorkspace: () => ({
    workspace: { profile: { id: 'professional', full_name: 'Dra. Ana López', professional_title: 'Nutrióloga', language: 'es', country: 'México', public_slug: 'ana', is_public: true, avatar_path: null } },
    loading: false,
    error: '',
    reload: vi.fn(),
  }),
}));
vi.mock('@/src/services/media', () => ({ getSignedMediaUrl: vi.fn().mockResolvedValue(null), removeProfessionalImage: vi.fn(), uploadProfessionalImage: vi.fn() }));
vi.mock('@/src/features/profile/ProfileSections', () => Object.fromEntries(['AboutSection', 'ContactsSection', 'BusinessSection', 'AvailabilitySection', 'ExtrasSection', 'EducationSection', 'LinksSection', 'PaymentsSection'].map((name) => [name, () => <div>{name}</div>])));
vi.mock('@/src/features/bioimpedance/BioimpedanceDevicesSection', () => ({ BioimpedanceDevicesSection: () => <div>Equipos registrados</div> }));

beforeEach(() => localStorage.clear());

describe('ProfilePage', () => {
  it('guides the professional through the existing profile sections', () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    expect(screen.getByRole('navigation', { name: 'Secciones del perfil' })).toBeVisible();
    expect(screen.getByText('AboutSection')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Siguiente: Negocio/ })[0]).toBeVisible();

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Secciones del perfil' })).getByRole('button', { name: /Negocio/ }));
    expect(screen.getByText('BusinessSection')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Siguiente: Disponibilidad/ })[0]).toBeVisible();
  });
});
