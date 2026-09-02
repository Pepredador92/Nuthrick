import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';

function readValue<T>(key: string, initialValue: T): T {
  if (typeof window === 'undefined') return initialValue;
  try {
    const stored = window.sessionStorage.getItem(key);
    return stored === null ? initialValue : JSON.parse(stored) as T;
  } catch {
    return initialValue;
  }
}

export function usePersistentState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => readValue(key, initialValue));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Draft persistence is best effort and must never block editing.
    }
  }, [key, value]);

  const clear = useCallback(() => {
    try { window.sessionStorage.removeItem(key); } catch { /* best effort */ }
  }, [key]);

  return [value, setValue, clear];
}
