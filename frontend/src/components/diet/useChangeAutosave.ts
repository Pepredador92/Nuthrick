import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_SAVED_INDICATOR_MS,
  encodePersistedValue,
  type AutosaveStatus,
} from "@/src/features/diet-workshop/autosave";

type PendingSave<T> = {
  value: T;
  encoded: string;
  dueAt: number;
};

export function useChangeAutosave<T>({
  initialValue,
  onSave,
  onDraftChange,
  delay = AUTOSAVE_DEBOUNCE_MS,
}: {
  initialValue: T;
  onSave: (value: T) => Promise<void>;
  onDraftChange?: (value: T) => void;
  delay?: number;
}) {
  const [status, setStatus] = useState<AutosaveStatus>("clean");
  const saveRef = useRef(onSave);
  const draftChangeRef = useRef(onDraftChange);
  const lastSavedRef = useRef(encodePersistedValue(initialValue));
  const pendingRef = useRef<PendingSave<T> | null>(null);
  const savingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const quietTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const performSaveRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => { saveRef.current = onSave; }, [onSave]);
  useEffect(() => { draftChangeRef.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (quietTimerRef.current !== null) window.clearTimeout(quietTimerRef.current);
    };
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (quietTimerRef.current !== null) window.clearTimeout(quietTimerRef.current);
    timerRef.current = null;
    quietTimerRef.current = null;
  }, []);

  const schedulePending = useCallback(() => {
    if (!pendingRef.current || savingRef.current) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const wait = Math.max(0, pendingRef.current.dueAt - Date.now());
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void performSaveRef.current();
    }, wait);
  }, []);

  const performSave = useCallback(async () => {
    if (savingRef.current) return;
    const pending = pendingRef.current;
    if (!pending) return;
    if (pending.dueAt > Date.now()) return schedulePending();
    if (pending.encoded === lastSavedRef.current) {
      pendingRef.current = null;
      if (mountedRef.current) setStatus("clean");
      return;
    }

    pendingRef.current = null;
    savingRef.current = true;
    if (mountedRef.current) setStatus("saving");
    let succeeded = false;
    try {
      await saveRef.current(pending.value);
      lastSavedRef.current = pending.encoded;
      succeeded = true;
      if (mountedRef.current && !pendingRef.current) {
        setStatus("saved");
        quietTimerRef.current = window.setTimeout(() => {
          quietTimerRef.current = null;
          if (mountedRef.current && !pendingRef.current && !savingRef.current) setStatus("clean");
        }, AUTOSAVE_SAVED_INDICATOR_MS);
      }
    } catch {
      if (!pendingRef.current) pendingRef.current = pending;
      if (mountedRef.current) setStatus("error");
    } finally {
      savingRef.current = false;
      const hasNewerPending = pendingRef.current !== null && pendingRef.current !== pending;
      if (pendingRef.current && (succeeded || hasNewerPending)) {
        if (mountedRef.current) setStatus("dirty");
        schedulePending();
      }
    }
  }, [schedulePending]);
  useEffect(() => { performSaveRef.current = performSave; }, [performSave]);

  const change = useCallback((value: T, options: { immediate?: boolean } = {}) => {
    draftChangeRef.current?.(value);
    const encoded = encodePersistedValue(value);
    clearTimers();
    if (encoded === lastSavedRef.current && !savingRef.current) {
      pendingRef.current = null;
      if (mountedRef.current) setStatus("clean");
      return;
    }
    pendingRef.current = { value, encoded, dueAt: options.immediate ? 0 : Date.now() + delay };
    if (mountedRef.current) setStatus("dirty");
    if (options.immediate) void performSaveRef.current();
    else schedulePending();
  }, [clearTimers, delay, schedulePending]);

  const saveNow = useCallback(async (value?: T) => {
    if (value !== undefined) change(value);
    if (!pendingRef.current) return;
    pendingRef.current.dueAt = 0;
    clearTimers();
    await performSaveRef.current();
  }, [change, clearTimers]);

  return { status, change, saveNow };
}
