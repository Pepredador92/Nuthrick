import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LandingPage } from './LandingPage';

const plans = [{
  id: 'plan-from-admin', name: 'Esencial', monthly_price: 427, annual_price: 4270,
  currency: 'MXN', values: { 'patients.limit': 30 },
}];

describe('LandingPage', () => {
  it('renders its positioning and creator in the initial HTML without a router or auth', () => {
    const html = renderToString(<LandingPage />);
    expect(html).toContain('Software para nutriólogos');
    expect(html).toContain('Tu consulta merece tu atención.');
    expect(html).toContain('Tu vida también.');
    expect(html).toContain('José Olmedo');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });

  it('keeps the complete founder photograph and requested introduction with emphasis', () => {
    render(<LandingPage />);
    const founder = screen.getByRole('region', { name: /Nuthrick nació desde/ });
    expect(founder).toHaveTextContent('nutriólogo con más de 8 años de experiencia en consulta privada');
    expect(founder).toHaveTextContent('no para reemplazar tu criterio profesional');
    expect(within(founder).getByText('más simple, rápida y organizada').tagName).toBe('STRONG');
    const image = within(founder).getByRole('img');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('width', '1280');
    expect(image.getAttribute('srcSet')).toContain('640w');
    expect(image.getAttribute('alt')).toContain('tres computadoras');
  });

  it('offers a keyboard-operable menu and real navigation destinations', () => {
    render(<LandingPage plans={plans} />);
    const toggle = screen.getByRole('button', { name: 'Abrir menú' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const nav = screen.getByRole('navigation', { name: 'Navegación móvil' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Quién lo creó' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('link', { name: /^Registrarme/ }).every(link => link.getAttribute('href') === '/register')).toBe(true);
    expect(screen.getByRole('link', { name: 'Consultar plan Esencial' })).toHaveAttribute('href', '/planes?plan=plan-from-admin');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('identifies demonstration data without claiming deferred integrations or a free plan', () => {
    render(<LandingPage />);
    expect(screen.getByText(/Pantalla real del sistema · datos de demostración/)).toBeInTheDocument();
    expect(screen.getByText(/Revisa el importe y la periodicidad/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/agenda|calendar|gmail|automatizaciones de comunicación/i);
    expect(screen.queryByText(/gratis para siempre|plan gratuito/i)).not.toBeInTheDocument();
  });

  it('lets visitors explore real screens with the keyboard', () => {
    render(<LandingPage />);
    const first = screen.getByRole('tab', { name: 'Planes de alimentación' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const calculations = screen.getByRole('tab', { name: 'Cálculos y mediciones' });
    expect(calculations).toHaveFocus();
    expect(calculations).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).getByRole('img')).toHaveAttribute('src', '/images/landing/nuthrick-calculos.png');
    fireEvent.keyDown(calculations, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Tus pacientes' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Tus pacientes' }), { key: 'Home' });
    expect(first).toHaveFocus();
  });

  it('renders the current catalog and contact in the initial HTML, without fixed price fallbacks', () => {
    const html = renderToString(<LandingPage plans={plans} supportEmail="support@example.test" />);
    expect(html).toContain('$427');
    expect(html).toContain('$4,270');
    expect(html).toContain('Hasta 30 pacientes activos.');
    expect(html).toContain('mailto:support@example.test');
    expect(html).not.toMatch(/Essential|Complete|\$399|\$649|\$799|hola@nuthrick.com/);
    const unavailable = renderToString(<LandingPage />);
    expect(unavailable).toContain('Consulta la disponibilidad y los precios');
    expect(unavailable).not.toContain('MXN / mes');
  });
});
