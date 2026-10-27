// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BOT_CHECK_EVENT } from "./botCheckEvent";
import { resetTurnstile, turnstileToken } from "./turnstile";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Options = Record<string, (...args: unknown[]) => unknown> & { sitekey?: unknown };

/** window.turnstile as the script defines it; `options()` is what the widget was rendered with. */
function fakeTurnstile() {
  let options: Options | null = null;
  const api = {
    render: vi.fn((_container: HTMLElement, rendered: Options) => {
      options = rendered;
      return "widget-1";
    }),
    execute: vi.fn(),
    reset: vi.fn(),
  };
  window.turnstile = api;
  return { api, options: () => options! };
}

afterEach(() => {
  resetTurnstile();
  delete window.turnstile;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("turnstileToken", () => {
  it("renders one interaction-only widget that runs only when asked: a fresh challenge per request, reset after each", async () => {
    const { api, options } = fakeTurnstile();
    const first = turnstileToken("site-key-1");
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(1));
    expect(api.render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ sitekey: "site-key-1", appearance: "interaction-only", execution: "execute" }));
    expect(api.execute).toHaveBeenCalledWith("widget-1");
    options().callback!("token-1");
    expect(await first).toBe("token-1");
    expect(api.reset).toHaveBeenCalledWith("widget-1");

    const second = turnstileToken("site-key-1");
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(2));
    options().callback!("token-2");
    expect(await second).toBe("token-2");
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.reset).toHaveBeenCalledTimes(2);
  });

  it("resolves null, never hangs, on a failed challenge, an unsupported browser or a timed-out one", async () => {
    const { api, options } = fakeTurnstile();
    for (const [i, callback] of ["error-callback", "unsupported-callback", "timeout-callback"].entries()) {
      const pending = turnstileToken("site-key-1");
      await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(i + 1));
      options()[callback]!("300030");
      expect(await pending, callback).toBeNull();
    }
    // A challenge that never answers gives up after two minutes.
    vi.useFakeTimers();
    const silent = turnstileToken("site-key-1");
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(4));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await silent).toBeNull();
  });

  it("resolves null when the caller leaves", async () => {
    const { api } = fakeTurnstile();
    const controller = new AbortController();
    const pending = turnstileToken("site-key-1", controller.signal);
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(await pending).toBeNull();
    expect(api.reset).toHaveBeenCalledTimes(1);
  });

  it("tells a person who has to take part, in plain Korean, and clears it after", async () => {
    const { api, options } = fakeTurnstile();
    const pending = turnstileToken("site-key-1");
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(1));
    const status = document.querySelector('[role="status"]')!;
    expect(status.textContent).toBe("");
    options()["before-interactive-callback"]!();
    expect(status.textContent).toBe("보안 확인이 필요해요. 아래 확인란을 눌러 주세요.");
    options()["after-interactive-callback"]!();
    options().callback!("token-1");
    expect(await pending).toBe("token-1");
    expect(status.textContent).toBe("");
  });

  it("tells the page while the person has to take part (BOT_CHECK_EVENT), so a waiting screen stops counting", async () => {
    const { api, options } = fakeTurnstile();
    const seen: unknown[] = [];
    const listen = (event: Event) => seen.push((event as CustomEvent<boolean>).detail);
    window.addEventListener(BOT_CHECK_EVENT, listen);
    const pending = turnstileToken("site-key-1");
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(1));
    options()["before-interactive-callback"]!();
    expect(seen).toEqual([true]);
    options()["after-interactive-callback"]!();
    options().callback!("token-1");
    await pending;
    window.removeEventListener(BOT_CHECK_EVENT, listen);
    expect(seen.at(-1)).toBe(false);
  });

  it("loads the script once from challenges.cloudflare.com (explicit rendering), and resolves null when it cannot load", async () => {
    const first = turnstileToken("site-key-1");
    const second = turnstileToken("site-key-1");
    await vi.waitFor(() => expect(document.head.querySelectorAll("script")).toHaveLength(1));
    const script = document.head.querySelector("script")!;
    expect(script.src).toBe(SCRIPT);
    script.dispatchEvent(new Event("error"));
    expect(await first).toBeNull();
    // The next request tries the script again.
    await vi.waitFor(() => expect(document.head.querySelectorAll("script")).toHaveLength(1));
    const { api, options } = fakeTurnstile();
    document.head.querySelector("script")!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(1));
    options().callback!("token-1");
    expect(await second).toBe("token-1");
  });
});
