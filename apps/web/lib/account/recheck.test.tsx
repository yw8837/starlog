// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asksServer, resetAccountForTests, useAccount } from "./client";

const MEMBER = { payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [], opening: [] } };
const VISITOR = { payments: true, login: true, owner: false, user: null };

const T0 = Date.parse("2026-11-20T12:00:00+09:00");
const answers = (...bodies: Array<() => Response>) => {
  const fetchMock = vi.fn(async () => (bodies.length > 1 ? bodies.shift()! : bodies[0]!)());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const ok = (body: unknown) => () => Response.json(body);
const showTab = async () => {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};
const restore = async (persisted: boolean) => {
  await act(async () => {
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: persisted });
    window.dispatchEvent(event);
  });
};

describe("the account is asked again when the page comes back (owner 2026-11-05)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    resetAccountForTests();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetAccountForTests();
  });

  it("on a tab shown again: a real answer changes the state, at most once in 30 seconds", async () => {
    const fetchMock = answers(ok(MEMBER), ok(VISITOR));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current?.user?.nickname).toBe("별"));
    await showTab();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(T0 + 29_000);
    await showTab();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(T0 + 31_000);
    await showTab();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current?.user).toBeNull());
    await showTab();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a hidden tab asks nothing, and many screens share one listener", async () => {
    const fetchMock = answers(ok(MEMBER));
    const first = renderHook(() => useAccount());
    renderHook(() => useAccount());
    await waitFor(() => expect(first.result.current?.user).toBeTruthy());
    vi.setSystemTime(T0 + 60_000);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await showTab();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await showTab();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a failed answer changes nothing: a flaky network does not blank a logged-in reader's screen", async () => {
    const fetchMock = answers(ok(MEMBER), () => new Response("", { status: 503 }));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current?.user).toBeTruthy());
    vi.setSystemTime(T0 + 60_000);
    await showTab();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(result.current?.user?.nickname).toBe("별");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    vi.setSystemTime(T0 + 120_000);
    await showTab();
    await act(async () => {});
    expect(result.current?.user?.nickname).toBe("별");
  });

  it("a page restored from the back/forward cache asks at once, within the 30 seconds too; a normal page show asks nothing", async () => {
    const fetchMock = answers(ok(MEMBER), ok(VISITOR));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current?.user).toBeTruthy());
    await restore(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await restore(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current?.user).toBeNull());
  });
});

describe("asksServer: whether a screen asks for its 맛보기 (code review 2026-11-05)", () => {
  const kept = { title: "kept" };
  it("asks when nothing is kept, whoever is asking", () => {
    for (const account of [undefined, null, MEMBER, VISITOR]) expect(asksServer(account as never, null)).toBe(true);
  });
  it("with something kept: only a known visitor asks (the server answers the login or the care screen)", () => {
    expect(asksServer(VISITOR as never, kept)).toBe(true);
    expect(asksServer(MEMBER as never, kept)).toBe(false);
    expect(asksServer(undefined, kept)).toBe(false);
    // /api/me failed: a reader's place is not spent on what this device already has.
    expect(asksServer(null, kept)).toBe(false);
  });
});
