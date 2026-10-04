import { useSyncExternalStore } from 'react';

export type NuthrickTheme = 'day' | 'night';

export const THEME_STORAGE_KEY = 'nuthrick.theme';
const THEME_EVENT = 'nuthrick-theme-change';

function readTheme(): NuthrickTheme {
  if (typeof document === 'undefined') return 'day';
  return document.documentElement.dataset.nuthrickTheme === 'night' ? 'night' : 'day';
}

function subscribe(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener);
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if ((saved === 'day' || saved === 'night') && document.documentElement.dataset.nuthrickTheme !== saved) {
      document.documentElement.dataset.nuthrickTheme = saved;
      updateBrowserColor(saved);
      listener();
    }
  } catch { /* A private browsing context may deny storage. */ }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    const theme = event.newValue === 'night' ? 'night' : 'day';
    document.documentElement.dataset.nuthrickTheme = theme;
    updateBrowserColor(theme);
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

function updateBrowserColor(theme: NuthrickTheme) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', theme === 'night' ? '#081520' : '#eef3ef',
  );
}

export function setNuthrickTheme(theme: NuthrickTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.nuthrickTheme = theme;
  updateBrowserColor(theme);
  try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Storage is optional. */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useNuthrickTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'day');
  return [theme, setNuthrickTheme] as const;
}
