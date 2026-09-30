import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { authReturnTarget } from './authReturn';
import { AuthCallbackPage } from '@/src/screens/AuthPages';

vi.mock('@/src/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: null, profile: null, loading: false }) }));
vi.mock('@/src/lib/supabase', () => ({ supabase: {} }));

it('routes root invitations to the app without moving tokens into the query', () => {
  const hash = '#access_token=fixture-access&refresh_token=fixture-refresh&type=invite';
  expect(authReturnTarget({ pathname: '/', search: '', hash })).toBe(`/auth/callback${hash}`);
});
it('handles recovery, PKCE and expired links on their local destinations', () => {
  expect(authReturnTarget({ pathname: '/', search: '', hash: '#access_token=fixture&type=recovery' })).toBe('/reset-password#access_token=fixture&type=recovery');
  expect(authReturnTarget({ pathname: '/', search: '?code=fixture', hash: '' })).toBe('/auth/callback?code=fixture');
  expect(authReturnTarget({ pathname: '/', search: '', hash: '#error=access_denied&error_code=otp_expired' })).toBe('/auth/callback#error=access_denied&error_code=otp_expired');
});
it('leaves landing sections untouched and cannot loop or redirect to an external destination', () => {
  expect(authReturnTarget({ pathname: '/', search: '?campaign=beta', hash: '#segunda-jornada' })).toBeNull();
  expect(authReturnTarget({ pathname: '/auth/callback', search: '', hash: '#access_token=fixture' })).toBeNull();
  expect(authReturnTarget({ pathname: '/', search: '?next=https://evil.example', hash: '#access_token=fixture' })).toBe('/auth/callback?next=https://evil.example#access_token=fixture');
});
it('offers recovery when callback initialization finishes without a session', () => {
  render(<MemoryRouter><AuthCallbackPage /></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent('enlace más reciente');
  expect(screen.getByRole('link', { name: 'Recuperar acceso' })).toHaveAttribute('href', '/forgot-password');
  expect(screen.queryByText('Preparando tu cuenta…')).not.toBeInTheDocument();
});
