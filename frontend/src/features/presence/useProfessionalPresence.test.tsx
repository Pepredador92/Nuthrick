import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { useProfessionalPresence } from "./useProfessionalPresence";

const mocks = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/src/lib/supabase", () => ({ supabase: mocks }));
function Probe({id = "professional"}: {id?: string}) { useProfessionalPresence(id); return null; }
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });
afterEach(() => { vi.useRealTimers(); });
const flush = () => act(async () => { await Promise.resolve(); });
it("publishes only the authenticated session and releases the tab on unmount", async () => {
  const view = render(<Probe />); await flush();
  const data = mocks.rpc.mock.calls[0][1];
  expect(mocks.rpc).toHaveBeenCalledWith("professional_presence_ping", {p_client: expect.any(String), p_online: true});
  expect(data).not.toHaveProperty("professional_id");
  view.unmount(); await flush();
  expect(mocks.rpc).toHaveBeenLastCalledWith("professional_presence_ping", {...data, p_online: false});
});
it("becomes offline after five idle minutes and returns with keyboard activity", async () => {
  const view = render(<Probe />); await flush();
  await act(async () => { await vi.advanceTimersByTimeAsync(300000); });
  expect(mocks.rpc).toHaveBeenLastCalledWith("professional_presence_ping", expect.objectContaining({p_online: false}));
  fireEvent.keyDown(document, {key: "Tab"}); await flush();
  expect(mocks.rpc).toHaveBeenLastCalledWith("professional_presence_ping", expect.objectContaining({p_online: true}));
  view.unmount(); await flush();
});
it("releases a hidden tab and renews when visible again", async () => {
  const view = render(<Probe />); await flush();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  fireEvent(document, new Event("visibilitychange")); await flush();
  expect(mocks.rpc).toHaveBeenLastCalledWith("professional_presence_ping", expect.objectContaining({p_online: false}));
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  fireEvent(document, new Event("visibilitychange")); await flush();
  expect(mocks.rpc).toHaveBeenLastCalledWith("professional_presence_ping", expect.objectContaining({p_online: true}));
  view.unmount(); await flush();
});
