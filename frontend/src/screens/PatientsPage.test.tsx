import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientsPage } from './PatientsPage';
import { getPatientCounters, listPatients } from '@/src/services/patients';

vi.mock('@/src/features/admin/AccessProvider', () => ({ useAccess: () => ({ data: null }) }));
vi.mock('@/src/services/patients', () => ({
  getPatientCounters: vi.fn(),
  listPatients: vi.fn(),
  archivePatient: vi.fn(),
  createPatient: vi.fn(),
  deletePatient: vi.fn(),
  restorePatient: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getPatientCounters).mockResolvedValue({ total: 1, active: 1 });
  vi.mocked(listPatients).mockResolvedValue({ rows: [{ id: 'patient-1', full_name: 'Diana Laura', email: 'diana@example.test', status: 'active', portal_access_enabled: true, birth_date: '1990-01-01', last_activity_at: '2026-09-25' } as never], total: 1 });
});

describe('PatientsPage', () => {
  it('keeps search, filters and patient detail available in guided cards', async () => {
    render(<MemoryRouter><PatientsPage /></MemoryRouter>);

    expect(screen.getByRole('region', { name: 'Buscar y filtrar pacientes' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Abrir ficha' })).toHaveAttribute('href', '/app/patients/patient-1');
    expect(screen.getByText('Diana Laura')).toBeVisible();
  });
});
