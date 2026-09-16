// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  calendarEventId,
  codeHash,
  decrypt,
  encrypt,
  gmailMessage,
  normalizeEmail,
  overlaps,
  parseInstant,
  readFreeBusy,
  secretToken,
  sha256,
} from "../../../supabase/functions/agenda/security";

describe("agenda boundary security", () => {
  it("encrypts credentials with authenticated encryption and unique nonces", async () => {
    const key = secretToken();
    const a = await encrypt(key, "secret-refresh-token");
    const b = await encrypt(key, "secret-refresh-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret-refresh-token");
    expect(await decrypt(key, a)).toBe("secret-refresh-token");
    await expect(decrypt(secretToken(), a)).rejects.toThrow();
    await expect(decrypt(key, a.slice(0, -3) + "xyz")).rejects.toThrow();
  });
  it("binds low-entropy codes to a private key and challenge", async () => {
    const key = secretToken();
    expect(await codeHash(key, "first", "123456")).not.toBe(
      await codeHash(key, "second", "123456"),
    );
    expect(await codeHash(key, "first", "123456")).not.toBe(
      await codeHash(secretToken(), "first", "123456"),
    );
    expect(await sha256("token")).toBe(await sha256("token"));
  });
  it("rejects email header injection and timezone-free input", () => {
    expect(normalizeEmail(" User@Example.com ")).toBe("user@example.com");
    expect(() =>
      normalizeEmail("a@example.com\r\nBcc: b@example.com"),
    ).toThrow();
    expect(() => parseInstant("2026-09-16T10:00")).toThrow();
    expect(parseInstant("2026-09-16T10:00-06:00")).toBe(
      "2026-09-16T16:00:00.000Z",
    );
  });
  it("allows adjacent intervals, forbids partial overlaps", () => {
    const busy = { start: "2026-09-16T10:00Z", end: "2026-09-16T11:00Z" };
    expect(overlaps("2026-09-16T11:00Z", "2026-09-16T12:00Z", busy)).toBe(
      false,
    );
    expect(overlaps("2026-09-16T09:30Z", "2026-09-16T10:30Z", busy)).toBe(true);
  });
  it("fails closed on missing/error calendars even in successful HTTP responses", () => {
    expect(() =>
      readFreeBusy({ calendars: { a: { busy: [] } } }, ["a", "b"]),
    ).toThrow("google_unavailable");
    expect(() =>
      readFreeBusy(
        { calendars: { a: { busy: [], errors: [{ reason: "notFound" }] } } },
        ["a"],
      ),
    ).toThrow();
    expect(readFreeBusy({ calendars: { a: { busy: [] } } }, ["a"])).toEqual([]);
  });
  it("uses retry-stable Google IDs with base32hex characters", () => {
    const id = calendarEventId("a0000000-0000-0000-0000-000000000001");
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(id).toBe(calendarEventId("a0000000-0000-0000-0000-000000000001"));
  });
  it("builds UTF-8 mail without allowing input headers", () => {
    const raw = gmailMessage(
      "sender@example.com",
      "patient@example.com",
      "Tu cita quedó agendada",
      "Miércoles: 10:00",
      "job-123",
    );
    const decoded = Buffer.from(raw, "base64url").toString();
    expect(decoded).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(decoded).toContain("Message-ID: <agenda-job-123@");
    expect(() =>
      gmailMessage("sender@example.com", "bad\n@example.com", "x", "y", "job"),
    ).toThrow();
  });
});
