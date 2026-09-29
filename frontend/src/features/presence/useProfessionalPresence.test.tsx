import { beforeEach, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useProfessionalPresence } from "./useProfessionalPresence";

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));
vi.mock("@/src/lib/supabase", () => ({ supabase: mocks }));

it("tracks presence for the authenticated professional and cleans up", () => {
  const channel = { subscribe: vi.fn((callback) => { callback("SUBSCRIBED"); return channel; }), track: vi.fn(), untrack: vi.fn() };
  mocks.channel.mockReturnValue(channel);
  function Probe() { useProfessionalPresence("professional"); return null; }
  const view = render(<Probe />);
  expect(mocks.channel).toHaveBeenCalledWith("professional-presence:professional", { config: { presence: { key: "professional" } } });
  expect(channel.track).toHaveBeenCalledWith({ online: true });
  view.unmount();
  expect(channel.untrack).toHaveBeenCalled();
  expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
});

beforeEach(() => { vi.clearAllMocks(); });
