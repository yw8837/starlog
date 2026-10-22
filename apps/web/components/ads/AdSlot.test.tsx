// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdSlot } from "./AdSlot";

/**
 * An ad unit that is not filled (the site not yet approved, no ad to show, an ad blocker) must not leave a labelled
 * blank box on the page: nothing shows until AdSense marks the unit filled, and an unfilled unit is hidden.
 */

afterEach(() => {
  cleanup();
  delete window.adsbygoogle;
});

const CLIENT = "ca-pub-1234567890123456";
const SLOT = "1234567890";

const parts = (container: HTMLElement) => ({
  aside: container.querySelector<HTMLElement>('aside[aria-label="광고"]') as HTMLElement,
  ins: container.querySelector<HTMLElement>("ins.adsbygoogle") as HTMLElement,
});

describe("AdSlot", () => {
  it("asks AdSense for the unit once, with its client and slot", () => {
    const { container } = render(<AdSlot client={CLIENT} slot={SLOT} />);
    const { ins } = parts(container);
    expect(ins.getAttribute("data-ad-client")).toBe(CLIENT);
    expect(ins.getAttribute("data-ad-slot")).toBe(SLOT);
    expect(window.adsbygoogle).toHaveLength(1);
  });

  it("shows no 광고 label and takes no room while the unit waits to be filled", () => {
    const { container } = render(<AdSlot client={CLIENT} slot={SLOT} />);
    const { aside } = parts(container);
    expect(screen.queryByText("광고")).toBeNull();
    expect(aside.getAttribute("data-ad-state")).toBe("pending");
    expect(aside.hidden).toBe(false);
  });

  it("hides the whole slot once AdSense marks the unit unfilled", async () => {
    const { container } = render(<AdSlot client={CLIENT} slot={SLOT} />);
    const { aside, ins } = parts(container);
    await act(async () => {
      ins.setAttribute("data-ad-status", "unfilled");
      await Promise.resolve();
    });
    expect(aside.getAttribute("data-ad-state")).toBe("unfilled");
    expect(aside.hidden).toBe(true);
    expect(screen.queryByText("광고")).toBeNull();
  });

  it("labels the ad as 광고 once it is filled", async () => {
    const { container } = render(<AdSlot client={CLIENT} slot={SLOT} />);
    const { aside, ins } = parts(container);
    await act(async () => {
      ins.setAttribute("data-ad-status", "filled");
      await Promise.resolve();
    });
    expect(aside.getAttribute("data-ad-state")).toBe("filled");
    expect(aside.hidden).toBe(false);
    expect(screen.getByText("광고")).toBeTruthy();
  });

  it("reserves no height for an empty unit and spaces the slot only when it holds an ad (stylesheet)", () => {
    // jsdom tests have no file: import.meta.url; vitest runs from the repo root or from apps/web.
    const file = ["apps/web/components/ads/AdSlot.module.css", "components/ads/AdSlot.module.css"].map((path) => resolve(process.cwd(), path)).find((path) => existsSync(path)) ?? "";
    const css = readFileSync(file, "utf8");
    expect(css).not.toMatch(/min-height/);
    expect(css).toMatch(/\.slot\[data-ad-state="filled"\]\s*\{[^}]*margin-block/);
  });
});
