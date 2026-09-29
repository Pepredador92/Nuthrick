import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SiteVisitStats } from './SiteVisitStats';
import { fetchSiteAnalytics } from './api';
vi.mock('./api', () => ({fetchSiteAnalytics: vi.fn()}));
it('shows real totals, sessions, and daily counts without claiming unique people', async () => {
  vi.mocked(fetchSiteAnalytics).mockResolvedValue({total:14, days:30, pageviews:9, visitors:3, timezone:'America/Mexico_City', daily:[{day:'2026-09-29',pageviews:4,visitors:2}]});
  render(<SiteVisitStats/>);
  expect(await screen.findByText('14')).toBeVisible();
  expect(within(screen.getByRole('list')).getByText('4 visitas · 2 sesiones')).toBeVisible();
  expect(screen.queryByText('Visitantes únicos')).not.toBeInTheDocument();
});
it('shows an error instead of invented zero totals when the backend is unavailable', async () => {
  vi.mocked(fetchSiteAnalytics).mockRejectedValue(new Error('offline'));
  render(<SiteVisitStats/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar');
  expect(screen.queryByText('0')).not.toBeInTheDocument();
});
