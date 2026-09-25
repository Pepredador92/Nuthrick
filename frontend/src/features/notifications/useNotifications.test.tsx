import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsProvider, useNotifications } from "./useNotifications";
import type { ProfessionalNotification } from "./model";

const mocks = vi.hoisted(() => ({
  user: { id: "professional-a" } as { id: string } | null,
  list: vi.fn(),
  markRead: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  sound: vi.fn(),
}));

type TestChannel = {
  topic: string;
  subscribed: boolean;
  callback?: (payload: { new: ProfessionalNotification }) => void;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};
const channels = new Map<string, TestChannel>();

vi.mock("@/src/features/auth/AuthProvider", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("./sound", () => ({ playNotificationSound: mocks.sound }));
vi.mock("@/src/lib/supabase", () => ({ supabase: {
  from: () => ({
    select: () => ({ order: () => ({ limit: mocks.list }) }),
    update: () => ({ eq: mocks.markRead }),
  }),
  channel: mocks.channel,
  removeChannel: mocks.removeChannel,
} }));

const notification = (id = "new-message"): ProfessionalNotification => ({
  id, professional_id: "professional-a", type: "portal_message",
  actor_name: "Prueba", resource_id: "patient-test", resource_type: "patient",
  title: "Nuevo mensaje de prueba", metadata: {}, created_at: "2026-09-25T10:00:00Z", read_at: null,
});

function Consumer({ name }: { name: string }) {
  const { items, unreadCount, loading, markRead } = useNotifications();
  return <div><output data-testid={name}>{loading ? "loading" : `${unreadCount}:${items.map((item) => item.id).join(",")}`}</output><button onClick={() => void markRead(items[0].id)}>Leer {name}</button></div>;
}

function Inbox({ dashboard = true }: { dashboard?: boolean }) {
  return <NotificationsProvider><Consumer name="bell" />{dashboard && <Consumer name="dashboard" />}</NotificationsProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  channels.clear();
  mocks.user = { id: "professional-a" };
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.markRead.mockResolvedValue({ error: null });
  // Match the SDK: equal topics reuse channels; adding postgres callbacks
  // after subscribe throws, and asynchronous removal can still be pending.
  mocks.channel.mockImplementation((topic: string) => {
    const existing = channels.get(topic);
    if (existing) return existing;
    const channel: TestChannel = {
      topic, subscribed: false,
      on: vi.fn((_type, _filter, callback) => {
        if (channel.subscribed) throw new Error("cannot add postgres_changes callbacks after subscribe()");
        channel.callback = callback;
        return channel;
      }),
      subscribe: vi.fn(() => { channel.subscribed = true; return channel; }),
    };
    channels.set(topic, channel);
    return channel;
  });
  mocks.removeChannel.mockImplementation(() => new Promise(() => {}));
});

describe("shared notifications", () => {
  it("shares one inbox and subscription between dashboard and bell across navigation", async () => {
    const view = render(<Inbox />);
    await waitFor(() => expect(screen.getByTestId("dashboard")).toHaveTextContent("0:"));
    expect(mocks.channel).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledTimes(1);
    const channel = [...channels.values()][0];
    act(() => { channel.callback!({ new: notification() }); channel.callback!({ new: notification() }); });
    expect(screen.getByTestId("bell")).toHaveTextContent("1:new-message");
    expect(screen.getByTestId("dashboard")).toHaveTextContent("1:new-message");
    expect(mocks.sound).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Leer bell" }));
    await waitFor(() => expect(screen.getByTestId("dashboard")).toHaveTextContent("0:new-message"));
    view.rerender(<Inbox dashboard={false} />);
    expect(mocks.removeChannel).not.toHaveBeenCalled();
    view.rerender(<Inbox />);
    expect(mocks.channel).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("can remount in StrictMode before asynchronous removal finishes", async () => {
    render(<StrictMode><Inbox /></StrictMode>);
    await waitFor(() => expect(screen.getByTestId("dashboard")).toHaveTextContent("0:"));
    const [oldChannel, currentChannel] = [...channels.values()];
    expect(currentChannel).toBeDefined();
    expect(oldChannel.topic).not.toBe(currentChannel.topic);
    expect(currentChannel.subscribe).toHaveBeenCalledTimes(1);
    act(() => oldChannel.callback!({ new: notification("stale") }));
    expect(screen.getByTestId("bell")).not.toHaveTextContent("stale");
    act(() => currentChannel.callback!({ new: notification() }));
    expect(screen.getByTestId("dashboard")).toHaveTextContent("1:new-message");
  });

  it("discards the previous account's inbox and in-flight response", async () => {
    let resolveOld!: (value: { data: ProfessionalNotification[]; error: null }) => void;
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const view = render(<Inbox />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    mocks.user = { id: "professional-b" };
    view.rerender(<Inbox />);
    await waitFor(() => expect(screen.getByTestId("bell")).toHaveTextContent("0:"));
    await act(async () => resolveOld({ data: [notification("previous-account")], error: null }));
    expect(screen.getByTestId("bell")).not.toHaveTextContent("previous-account");
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
    mocks.user = null;
    view.rerender(<Inbox />);
    await waitFor(() => expect(screen.getByTestId("bell")).toHaveTextContent("0:"));
    expect(mocks.channel).toHaveBeenCalledTimes(2);
  });
});
