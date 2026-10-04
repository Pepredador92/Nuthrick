'use client';

import { Moon, Sun } from 'lucide-react';
import { useNuthrickTheme } from './theme';

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useNuthrickTheme();
  return (
    <div className={`nuth-theme-switch${compact ? ' is-compact' : ''}`} role="group" aria-label="Apariencia de Nuthrick">
      <button type="button" aria-label="Tema de día" aria-pressed={theme === 'day'} onClick={() => setTheme('day')}>
        <Sun size={16} aria-hidden="true" /><span>Día</span>
      </button>
      <button type="button" aria-label="Tema de noche" aria-pressed={theme === 'night'} onClick={() => setTheme('night')}>
        <Moon size={16} aria-hidden="true" /><span>Noche</span>
      </button>
    </div>
  );
}
