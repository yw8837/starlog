// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FRESH_FOR_MS, NEW_SAJU_HREF, NEW_TAROT_HREF, isStale, takeFlag, type FlowName } from "./freshStart";
import { forgetRoutes, noteRoute } from "./lastRoute";
import { cameFromFlow, useFlowVisit } from "./useFlowVisit";

afterEach(() => {
  cleanup();
  forgetRoutes();
  window.history.replaceState(null, "", "/");
});

/** A flow page that reports how it was entered. */
function Page({ flow, seen }: { flow: FlowName; seen: boolean[] }) {
  useFlowVisit(flow, (inFlow) => seen.push(inFlow));
  return null;
}

/** Like RouteTracker (components/layout/RouteTracker.tsx): notes the route on screen in a passive effect. */
function Tracker() {
  useEffect(() => {
    noteRoute(window.location.pathname);
  }, []);
  return null;
}

/** Shows `path` as the current route after `from` was on screen. */
function arrive(path: string, from: string | null) {
  forgetRoutes();
  if (from !== null) noteRoute(from);
  window.history.replaceState(null, "", path);
}

describe("freshStart", () => {
  it("links a new question with ?new=1", () => {
    expect(NEW_TAROT_HREF).toBe("/tarot/new?new=1");
    expect(NEW_SAJU_HREF).toBe("/saju/start?new=1");
  });

  it("takes a flag once and leaves the rest of the address as it was", () => {
    window.history.replaceState(null, "", "/tarot/new?new=1&instant=1#top");
    expect(takeFlag("new")).toBe(true);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/tarot/new?instant=1#top");
    expect(takeFlag("new")).toBe(false);
  });

  it("calls answers stale after 30 minutes, or when their age is unknown", () => {
    const now = 1_790_000_000_000;
    expect(FRESH_FOR_MS).toBe(30 * 60 * 1000);
    expect(isStale(now - 29 * 60 * 1000, now)).toBe(false);
    expect(isStale(now - 30 * 60 * 1000, now)).toBe(false);
    expect(isStale(now - 30 * 60 * 1000 - 1, now)).toBe(true);
    expect(isStale(undefined, now)).toBe(true);
  });
});

describe("cameFromFlow: only a move from another page of the same flow keeps the answers", () => {
  it("keeps between the pages of a flow, the tarot result's 질문 고치기 included", () => {
    expect(cameFromFlow("tarot", "/tarot/new", "/tarot/new/situation")).toBe(true);
    expect(cameFromFlow("tarot", "/tarot/new/situation", "/tarot/new")).toBe(true);
    expect(cameFromFlow("tarot", "/tarot/draw", "/tarot/new/situation")).toBe(true);
    expect(cameFromFlow("tarot", "/tarot/result", "/tarot/new")).toBe(true);
    expect(cameFromFlow("saju", "/saju/chart", "/saju/new")).toBe(true);
  });

  it("starts clean on a document's first route (refresh, typed address), from elsewhere, from another flow or from itself", () => {
    expect(cameFromFlow("tarot", null, "/tarot/new")).toBe(false);
    expect(cameFromFlow("tarot", "/", "/tarot/new")).toBe(false);
    expect(cameFromFlow("tarot", "/saju/chart", "/tarot/new")).toBe(false);
    expect(cameFromFlow("saju", "/tarot/new", "/saju/new")).toBe(false);
    expect(cameFromFlow("tarot", "/tarot/new", "/tarot/new")).toBe(false);
  });
});

describe("useFlowVisit", () => {
  it("reports a fresh visit on a document's first route and a kept one after another flow page", () => {
    const seen: boolean[] = [];
    arrive("/tarot/new", null);
    render(<Page flow="tarot" seen={seen} />);
    cleanup();
    arrive("/tarot/new", "/tarot/new/situation");
    render(<Page flow="tarot" seen={seen} />);
    cleanup();
    arrive("/tarot/new", "/");
    render(<Page flow="tarot" seen={seen} />);
    expect(seen).toEqual([false, true, false]);
  });

  it("never keeps for ?new=1 (which leaves the address) and keeps for ?keep=1", () => {
    const seen: boolean[] = [];
    arrive("/tarot/new?new=1", "/tarot/new/situation");
    render(<Page flow="tarot" seen={seen} />);
    expect(window.location.search).toBe("");
    cleanup();
    arrive("/tarot/new?keep=1", null);
    render(<Page flow="tarot" seen={seen} />);
    expect(seen).toEqual([false, true]);
  });

  it("decides the same when StrictMode runs the effect twice, and once per render otherwise", () => {
    const seen: boolean[] = [];
    arrive("/tarot/new/situation", "/tarot/new");
    const { rerender } = render(
      <StrictMode>
        <Page flow="tarot" seen={seen} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <Page flow="tarot" seen={seen} />
      </StrictMode>,
    );
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.every((inFlow) => inFlow)).toBe(true);
  });

  it("keeps the answers when StrictMode's dev replay comes after RouteTracker noted this very route", () => {
    const seen: boolean[] = [];
    arrive("/tarot/new/situation", "/tarot/new");
    render(
      <StrictMode>
        <Tracker />
        <Page flow="tarot" seen={seen} />
      </StrictMode>,
    );
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.every((inFlow) => inFlow)).toBe(true);
  });
});
