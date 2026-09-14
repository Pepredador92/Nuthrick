import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChangeAutosave } from "./useChangeAutosave";

describe("useChangeAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not save without a persistable change or on a periodic timer", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useChangeAutosave({ initialValue: { value: 1 }, onSave }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("marks dirty, debounces typing and emits one write with the newest value", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useChangeAutosave({ initialValue: { value: "" }, onSave, delay: 800 }));
    act(() => result.current.change({ value: "a" }));
    expect(result.current.status).toBe("dirty");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    act(() => result.current.change({ value: "abc" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(799); });
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ value: "abc" });
  });

  it("persists semantic actions immediately and skips an identical payload", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useChangeAutosave({ initialValue: { value: 1 }, onSave }));
    await act(async () => { result.current.change({ value: 2 }, { immediate: true }); await Promise.resolve(); });
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => { result.current.change({ value: 2 }, { immediate: true }); await Promise.resolve(); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not resave when callback identity changes", async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ onSave }) => useChangeAutosave({ initialValue: { value: 1 }, onSave }), { initialProps: { onSave: first } });
    rerender({ onSave: second });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it("serializes rapid writes so an older response cannot drop the newest draft", async () => {
    let finishFirst: (() => void) | undefined;
    const onSave = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useChangeAutosave({ initialValue: { value: 0 }, onSave }));
    act(() => result.current.change({ value: 1 }, { immediate: true }));
    act(() => result.current.change({ value: 2 }, { immediate: true }));
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => { finishFirst?.(); await Promise.resolve(); await vi.runOnlyPendingTimersAsync(); });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith({ value: 2 });
  });

  it("keeps a newer draft queued when an older request fails", async () => {
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    const onSave = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useChangeAutosave({ initialValue: { value: 0 }, onSave }));
    act(() => result.current.change({ value: 1 }, { immediate: true }));
    act(() => result.current.change({ value: 2 }, { immediate: true }));
    await act(async () => { rejectFirst?.(new Error("network")); await Promise.resolve(); await vi.runOnlyPendingTimersAsync(); });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith({ value: 2 });
  });
});
