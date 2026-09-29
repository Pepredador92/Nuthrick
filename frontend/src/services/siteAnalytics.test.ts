import { beforeEach, expect, it, vi } from "vitest";
import { trackSiteVisit } from "./siteAnalytics";

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
});

it("records public routes and skips private workspaces", () => {
  trackSiteVisit("/");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/functions/v1/site-analytics"),
    expect.objectContaining({ method: "POST", keepalive: true }),
  );
  trackSiteVisit("/app");
  trackSiteVisit("/admin");
  expect(fetch).toHaveBeenCalledTimes(1);
});
