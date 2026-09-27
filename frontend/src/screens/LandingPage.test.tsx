import { fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  it('renders its positioning and creator in the initial HTML without a router or auth', () => {
    const html = renderToString(<LandingPage />);
    expect(html).toContain('Software para nutriólogos.');
    expect(html).toContain('Termina cada consulta con el trabajo hecho.');
    expect(html).toContain('José Olmedo, nutriólogo con más de 8 años de experiencia en consulta privada');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });

  it('preserves the complete founder statement and responsive real photograph', () => {
    render(<LandingPage />);
    const founder = screen.getByRole('region', { name: 'Creado desde la experiencia de un nutriólogo.' });
    expect(founder).toHaveTextContent('Nuthrick nació desde un nutriólogo de verdad.');
    expect(founder).toHaveTextContent('todo el trabajo que continúa después de que termina la consulta.');
    expect(founder).toHaveTextContent('hacer más simple, rápido y organizado el trabajo del nutriólogo, sin reemplazar su criterio profesional.');
    const image = within(founder).getByRole('img');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('width', '1280');
    expect(image.getAttribute('srcSet')).toContain('640w');
    expect(within(founder).getByText('José Olmedo, nutriólogo con más de 8 años de experiencia en consulta privada').tagName).toBe('STRONG');
  });

  it('offers a keyboard-operable menu and real navigation destinations', () => {
    render(<LandingPage />);
    const toggle = screen.getByRole('button', { name: 'Abrir menú' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const nav = screen.getByRole('navigation', { name: 'Navegación móvil' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Quién lo creó' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('link', { name: /^Registrarme/ }).every(link => link.getAttribute('href') === '/register')).toBe(true);
    expect(screen.getByRole('link', { name: 'Consultar plan Nuthrick Essential' })).toHaveAttribute('href', '/planes');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('distinguishes illustrative data, indicative pricing and upcoming features', () => {
    render(<LandingPage />);
    expect(screen.getByText(/Vista ilustrativa del flujo/)).toBeInTheDocument();
    expect(screen.getByText(/Esta presentación no activa una suscripción/)).toBeInTheDocument();
    expect(screen.getByText(/Automatizaciones adicionales: próximamente/)).toBeInTheDocument();
    expect(screen.queryByText(/gratis para siempre|plan gratuito/i)).not.toBeInTheDocument();
  });
});
