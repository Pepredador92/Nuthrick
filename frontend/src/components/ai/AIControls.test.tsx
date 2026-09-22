import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIButton, AIGenerationState, AIUsageIndicator } from './AIControls';
import { getAIBalance } from '@/src/services/ai';
vi.mock('@/src/services/ai', async importOriginal => ({ ...await importOriginal<typeof import('@/src/services/ai')>(), getAIBalance: vi.fn() }));
describe('AI controls',() => {
  beforeEach(() => vi.clearAllMocks());
  it('blocks clicks during generation and uncertain billing',() => { const { rerender } = render(<AIButton state="generating" />); expect(screen.getByRole('button')).toBeDisabled(); rerender(<AIButton state="uncertain" />); expect(screen.getByRole('button')).toBeDisabled(); });
  it('explains insufficient balance without a fake checkout',() => { render(<AIGenerationState state="insufficient" />); expect(screen.getByRole('status')).toHaveTextContent('Ya utilizaste los créditos'); expect(screen.queryByRole('button')).toBeNull(); });
  it('shows available balance separately from reservations',async () => { vi.mocked(getAIBalance).mockResolvedValue({ available_credits:350,reserved_credits:2 }); render(<AIUsageIndicator />); await screen.findByText('350 créditos disponibles'); expect(screen.getByText('2 en reserva')).toBeInTheDocument(); });
  it('does not invent zero balance on network failure',async () => { vi.mocked(getAIBalance).mockRejectedValue(new Error('offline')); render(<AIUsageIndicator />); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saldo no disponible')); });
});
