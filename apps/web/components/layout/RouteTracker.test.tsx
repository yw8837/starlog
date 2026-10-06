// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetRoutes, lastRoute } from "@/lib/lastRoute";
import { SAJU_TEASERS_KEY, saveTeaser } from "@/lib/reading/teaserCache";
import { RouteTracker } from "./RouteTracker";

vi.mock("next/navigation", () => ({ usePathname: () => "/saju/chart" }));

const DAY = 86_400_000;
const teaser = { title: "t", summary: "s", lockedToc: [] };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  forgetRoutes();
});

describe("RouteTracker", () => {
  it("notes the route on screen", () => {
    render(<RouteTracker />);
    expect(lastRoute()).toBe("/saju/chart");
  });

  it("drops the saju teasers past their time whenever the app opens (their keys hold birth data), and keeps the others", () => {
    saveTeaser("saju", "a-key-kept", teaser);
    saveTeaser("saju", "a-key-past-its-time", teaser, Date.now() - 40 * DAY);
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).toContain("a-key-past-its-time");
    render(<RouteTracker />);
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).not.toContain("a-key-past-its-time");
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).toContain("a-key-kept");
  });

  it("writes nothing to the device when no teaser is kept or none is past its time", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    render(<RouteTracker />);
    cleanup();
    saveTeaser("saju", "a-key-kept", teaser);
    write.mockClear();
    render(<RouteTracker />);
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(SAJU_TEASERS_KEY)).toContain("a-key-kept");
  });
});
