// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  checkCalendarConflict,
  type CalendarCheck,
} from "../../../supabase/functions/agenda/calendar-reconciliation";
const check: CalendarCheck = {
  appointmentId: "appointment",
  eventId: "event",
  calendarId: "work",
  busyCalendarIds: ["work", "personal"],
  start: "2026-09-18T16:00:00Z",
  end: "2026-09-18T17:00:00Z",
};
const own = {
  id: "event",
  start: { dateTime: check.start },
  end: { dateTime: check.end },
  extendedProperties: { private: { nuthrickAppointment: "appointment" } },
};
function responses(...bodies: (object | number)[]) {
  const mock = vi.fn<typeof fetch>();
  for (const body of bodies)
    mock.mockResolvedValueOnce(
      typeof body === "number"
        ? new Response(null, { status: body })
        : Response.json(body),
    );
  return mock;
}
describe("Google conflict reconciliation", () => {
  it("ignores its own event and transparent events, reads only logistical fields", async () => {
    const fetcher = responses(
      own,
      { items: [{ id: "event" }] },
      { items: [{ id: "transparent", transparency: "transparent" }] },
    );
    expect(await checkCalendarConflict(check, "test-access", fetcher)).toBe(
      false,
    );
    for (const [url, options] of fetcher.mock.calls) {
      expect(options?.method).toBeUndefined();
      expect(new URL(String(url)).searchParams.get("fields")).not.toMatch(
        /summary|description|attendees/,
      );
    }
  });
  it("detects an opaque external overlap without modifying it", async () => {
    expect(
      await checkCalendarConflict(
        check,
        "test",
        responses(own, { items: [{ id: "event" }, { id: "external" }] }),
      ),
    ).toBe(true);
  });
  it("detects externally moved or deleted own events", async () => {
    expect(
      await checkCalendarConflict(
        check,
        "test",
        responses({ ...own, start: { dateTime: check.end } }),
      ),
    ).toBe(true);
    expect(await checkCalendarConflict(check, "test", responses(410))).toBe(
      true,
    );
  });
  it("never interprets connection failure as conflict-free", async () => {
    await expect(
      checkCalendarConflict(check, "test", responses(403)),
    ).rejects.toThrow("google_unavailable");
    await expect(
      checkCalendarConflict(check, "test", responses(own, { items: [] }, 503)),
    ).rejects.toThrow("google_unavailable");
  });
  it("checks every page even after an empty page", async () => {
    const fetcher = responses(
      own,
      { items: [], nextPageToken: "page2" },
      { items: [{ id: "other" }] },
    );
    expect(await checkCalendarConflict(check, "test", fetcher)).toBe(true);
    expect(
      new URL(String(fetcher.mock.calls[2][0])).searchParams.get("pageToken"),
    ).toBe("page2");
  });
});
