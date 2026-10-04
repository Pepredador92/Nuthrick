import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeSwitcher } from './ThemeSwitcher';
import { THEME_STORAGE_KEY } from './theme';

afterEach(() => {
  document.documentElement.dataset.nuthrickTheme = 'day';
  window.localStorage.removeItem(THEME_STORAGE_KEY);
});

describe('Nuthrick appearance', () => {
  it('changes the shared page theme and remembers the choice', () => {
    render(<ThemeSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'Tema de noche' }));
    expect(document.documentElement.dataset.nuthrickTheme).toBe('night');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('night');
    expect(screen.getByRole('button', { name: 'Tema de noche' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Tema de día' }));
    expect(document.documentElement.dataset.nuthrickTheme).toBe('day');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('day');
  });

  it('follows theme changes made in another tab', () => {
    render(<ThemeSwitcher />);
    fireEvent(window, new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'night' }));
    expect(document.documentElement.dataset.nuthrickTheme).toBe('night');
    expect(screen.getByRole('button', { name: 'Tema de noche' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('restores the preference after a route replaces the document root', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'night');
    document.documentElement.removeAttribute('data-nuthrick-theme');
    render(<ThemeSwitcher />);
    expect(document.documentElement.dataset.nuthrickTheme).toBe('night');
    expect(screen.getByRole('button', { name: 'Tema de noche' })).toHaveAttribute('aria-pressed', 'true');
  });
});
