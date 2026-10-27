// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpeningOnly } from "./OpeningOnly";

/** The last free moment and the first one after it (SITE.beta.openingEndsAt, exclusive), in KST. */
const LAST = Date.parse("2026-11-30T23:59:59+09:00");
const ENDED = Date.parse("2026-12-01T00:00:00+09:00");

const promo = <p>오픈 기념 무료</p>;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("OpeningOnly: the 오픈 기념 무료 lines appear in the browser, never in the cached HTML, and go away by themselves", () => {
  it("renders nothing on the server, even while the promotion runs, so a page cached for a year never states it", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LAST);
    expect(renderToString(<OpeningOnly>{promo}</OpeningOnly>)).toBe("");
  });

  it("shows its children after mount at 2026-10-31 23:59:59 KST", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LAST);
    const { container } = render(<OpeningOnly>{promo}</OpeningOnly>);
    await act(async () => {});
    expect(container.textContent).toBe("오픈 기념 무료");
  });

  it("shows nothing from 2026-12-01 00:00:00 KST, with no deploy", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ENDED);
    const { container } = render(<OpeningOnly>{promo}</OpeningOnly>);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });

  it("hydrates the server's empty HTML without a mismatch, then shows the line while it runs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LAST);
    const { hydrateRoot } = await import("react-dom/client");
    const host = document.createElement("div");
    host.innerHTML = renderToString(<OpeningOnly>{promo}</OpeningOnly>);
    document.body.appendChild(host);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(host, <OpeningOnly>{promo}</OpeningOnly>);
    });
    expect(errors).not.toHaveBeenCalled();
    expect(host.textContent).toBe("오픈 기념 무료");
    errors.mockRestore();
    host.remove();
  });
});
