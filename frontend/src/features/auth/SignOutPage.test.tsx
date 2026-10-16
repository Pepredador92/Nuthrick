import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { SignOutPage } from './SignOutPage';

const signOut = vi.hoisted(() => vi.fn());
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ signOut }) }));
beforeEach(() => { vi.clearAllMocks(); });
function mount() {
  return render(<MemoryRouter initialEntries={['/logout']}><Routes><Route path="/logout" element={<SignOutPage />} /><Route path="/" element={<h1>Inicio público</h1>} /></Routes></MemoryRouter>);
}
it('revokes the session after entering the sign out route', async () => {
  signOut.mockResolvedValue(undefined);
  mount();
  await screen.findByRole('heading', { name: 'Inicio público' });
  expect(signOut).toHaveBeenCalledOnce();
});
it('shows a way back to the app if signing out fails', async () => {
  signOut.mockRejectedValue(new Error('offline'));
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cerrar tu sesión');
  expect(screen.getByRole('link', { name: 'Volver a mi espacio' })).toHaveAttribute('href', '/app');
});
