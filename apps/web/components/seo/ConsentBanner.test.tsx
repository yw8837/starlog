// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const IN_FORCE = Date.parse("2026-10-30T00:00:00+09:00");
const KEY = "starlog.analytics.consent";
const TITLE = "방문 통계를 켜도 될까요?";
const flags = window as unknown as Record<string, unknown>;

// A fresh store each time: it keeps the last choice in memory for a page load.
let ConsentBanner: typeof import("./ConsentBanner").ConsentBanner;

beforeEach(async () => {
  vi.resetModules();
  ({ ConsentBanner } = await import("./ConsentBanner"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
  delete flags["ga-disable-G-8X11ZGFZKY"];
});

const at = (time: number) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time);
};
const stored = (choice: "granted" | "denied") => window.localStorage.setItem(KEY, JSON.stringify({ choice, at: "2026-10-30T00:00:00.000Z" }));
const banner = () => screen.queryByRole("region", { name: TITLE });
const mount = async () => {
  const view = render(createElement(ConsentBanner));
  await act(async () => {});
  return view;
};

describe("ConsentBanner: asks once, from the GA revision, until this browser has answered", () => {
  it("before 2026-10-30 00:00 KST: nothing, even with no choice", async () => {
    at(IN_FORCE - 1);
    const { container } = await mount();
    expect(container.innerHTML).toBe("");
  });

  it("from then with no choice: a labelled, non-modal region with the plain text, 자세히 to /privacy#analytics and two equal buttons", async () => {
    at(IN_FORCE);
    await mount();
    const region = banner();
    expect(region).not.toBeNull();
    expect(region!.getAttribute("aria-modal")).toBeNull();
    expect(region!.textContent).toContain("어떤 화면을 많이 보는지 알아보려고 Google 애널리틱스를 써요. 허용한 경우에만 쓰고, 설정은 언제든 바꿀 수 있어요.");
    expect(screen.getByRole("link", { name: "자세히" }).getAttribute("href")).toBe("/privacy#analytics");
    const [allow, deny] = screen.getAllByRole("button");
    expect([allow!.textContent, deny!.textContent]).toEqual(["허용", "거부"]);
    // Same size and style: no dark pattern.
    expect(allow!.className).toBe(deny!.className);
    // It does not take the focus: the page stays usable.
    expect(region!.contains(document.activeElement)).toBe(false);
  });

  it("from then with a stored choice: nothing", async () => {
    at(IN_FORCE);
    for (const choice of ["granted", "denied"] as const) {
      stored(choice);
      const { container } = await mount();
      expect(container.innerHTML, choice).toBe("");
      cleanup();
    }
  });

  it("거부 closes it, stores the choice and stops gtag; 허용 closes it and stores the choice", async () => {
    at(IN_FORCE);
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "거부" }));
    expect(banner()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "{}").choice).toBe("denied");
    expect(flags["ga-disable-G-8X11ZGFZKY"]).toBe(true);
    cleanup();
    window.localStorage.clear();
    vi.resetModules();
    ({ ConsentBanner } = await import("./ConsentBanner"));
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "허용" }));
    expect(banner()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "{}").choice).toBe("granted");
  });

  it("when storage throws: asks, then stays closed for the rest of the page load (the next page does not ask again)", async () => {
    at(IN_FORCE);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "허용" }));
    expect(banner()).toBeNull();
    cleanup();
    await mount();
    expect(banner()).toBeNull();
  });

  it("is never in the server HTML (no flash before the browser's clock and choice are known)", () => {
    at(IN_FORCE);
    expect(renderToString(createElement(ConsentBanner))).toBe("");
  });
});
