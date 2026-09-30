import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AIProcessingConsent } from './AIProcessingConsent';
import { supabase } from '@/src/lib/supabase';

vi.mock('@/src/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.rpc).mockResolvedValue({
    data: { eligible: true, version: 'pilot-v1', accepted: false, accepted_at: null },
    error: null,
  } as never);
});

it('shows the privacy notice and records acceptance only after the patient-authorization affirmation', async () => {
  vi.mocked(supabase.rpc).mockImplementation(((name: string) => Promise.resolve(name === 'my_ai_processing_consent'
    ? { data: { eligible: true, version: 'pilot-v1', accepted: false, accepted_at: null }, error: null }
    : { data: { eligible: true, version: 'pilot-v1', accepted: true, accepted_at: '2026-09-30T10:00:00Z' }, error: null })) as never);
  render(<AIProcessingConsent />);
  await screen.findByRole('dialog');
  const accept = screen.getByRole('button', { name: 'Aceptar y habilitar la IA' });
  expect(accept).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(accept);
  await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('accept_ai_processing_consent', { p_version: 'pilot-v1', p_patient_authorization: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('does not display a blocking notice to accounts without AI entitlements', async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({ data: { eligible: false, version: 'pilot-v1', accepted: false, accepted_at: null }, error: null } as never);
  render(<AIProcessingConsent />);
  await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('my_ai_processing_consent'));
  expect(screen.queryByRole('dialog')).toBeNull();
});
