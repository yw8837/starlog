// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FRESH_FOR_MS, NEW_SAJU_HREF, NEW_TAROT_HREF, isStale, takeFlag, type FlowName } from "./freshStart";
import { forgetFlowPages, leaveFlowPage, useFlowVisit } from "./useFlowVisit";

afterEach(() => {
  cleanup();
  forgetFlowPages();
  window.history.replaceState(null, "", "/");
  vi.useRealTimers();
});

/** A flow page that reports how it was entered. */
function Page({ flow, seen }: { flow: FlowName; seen: boolean[] }) {
  useFlowVisit(flow, (inFlow) => seen.push(inFlow));
  return null;
}

/** A flow page that only records being left (the draw, the result, the chart). */
function Quiet({ flow }: { flow: FlowName }) {
  useFlowVisit(flow);
  return null;
}

describe("freshStart", () => {
  it("links a new question with ?new=1", () => {
    expect(NEW_TAROT_HREF).toBe("/tarot/new?new=1");
    expect(NEW_SAJU_HREF).toBe("/saju/new?new=1");
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

describe("useFlowVisit (owner: a refresh or a visit from elsewhere starts clean)", () => {
  it("is a fresh visit when nothing of the flow was just left (a refresh, a link from elsewhere)", () => {
    const seen: boolean[] = [];
    render(<Page flow="tarot" seen={seen} />);
    expect(seen).toEqual([false]);
  });

  it("is in the flow when the page before, in the same move, was another page of the same flow", () => {
    const seen: boolean[] = [];
    window.history.replaceState(null, "", "/tarot/draw");
    render(<Quiet flow="tarot" />).unmount();
    window.history.replaceState(null, "", "/tarot/new/situation");
    render(<Page flow="tarot" seen={seen} />);
    expect(seen).toEqual([true]);
  });

  it("is a fresh visit after a page of another flow, or when the flow page was left a while ago", () => {
    const seen: boolean[] = [];
    leaveFlowPage("saju");
    render(<Page flow="tarot" seen={seen} />);
    cleanup();
    forgetFlowPages();
    vi.useFakeTimers();
    leaveFlowPage("tarot");
    vi.advanceTimersByTime(5_000);
    render(<Page flow="tarot" seen={seen} />);
    expect(seen).toEqual([false, false]);
  });

  it("never keeps for ?new=1 (which leaves the address) and keeps for ?keep=1", () => {
    const seen: boolean[] = [];
    leaveFlowPage("tarot");
    window.history.replaceState(null, "", "/tarot/new?new=1");
    render(<Page flow="tarot" seen={seen} />);
    expect(window.location.search).toBe("");
    cleanup();
    forgetFlowPages();
    window.history.replaceState(null, "", "/tarot/new?keep=1");
    render(<Page flow="tarot" seen={seen} />);
    expect(seen).toEqual([false, true]);
  });

  it("is a fresh visit when the page left was this very page (to the home, then back)", () => {
    const seen: boolean[] = [];
    window.history.replaceState(null, "", "/tarot/new");
    render(<Page flow="tarot" seen={seen} />).unmount();
    render(<Page flow="tarot" seen={seen} />);
    expect(seen).toEqual([false, false]);
  });

  it("asks once per visit (StrictMode's replay of the same page is not a new visit)", () => {
    const seen: boolean[] = [];
    // StrictMode runs the effect, its cleanup and the effect again: still one fresh visit.
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
    expect(seen).toEqual([false]);
  });
});
