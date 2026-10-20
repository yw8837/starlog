// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { premiumProgressPlans } from "@/lib/reading/progress";
import { usePremiumOpen } from "./useOpen";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  sessionStorage.clear();
  router.push.mockReset();
});

describe("usePremiumOpen (review 2026-10-16 #7)", () => {
  it("starts one opening however many times open is called before it ends: one reading request, never a second purchase in use", async () => {
    let finish!: () => void;
    const held = new Promise<void>((resolve) => (finish = resolve));
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/me") return Response.json({ payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [{ orderId: "o", productId: "newyear-2027" }], opening: [] } });
      if (url === "/api/premium/newyear-2027/reading") {
        await held;
        return Response.json({ code: "UPSTREAM" }, { status: 502 });
      }
      return Response.json({ readings: [], next: null });
    });
    vi.stubGlobal("fetch", fetchMock);
    window.scrollTo = vi.fn() as never;
    const { result } = renderHook(() =>
      usePremiumOpen({
        id: "newyear-2027",
        input: { birth: { year: 1990 } },
        plans: premiumProgressPlans("newyear-2027"),
        returnTo: "/premium/newyear-2027/preview",
        matches: () => false,
        accept: (reading): reading is unknown => Boolean(reading),
        save: () => "local",
      }),
    );
    act(() => {
      result.current.open("paid");
      result.current.open("paid");
      result.current.open("paid");
    });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === "/api/premium/newyear-2027/reading")).toHaveLength(1));
    finish();
    await waitFor(() => expect(result.current.running).toBeNull());
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/premium/newyear-2027/reading")).toHaveLength(1);
  });
});

describe("usePremiumOpen when the reading ends without passing through save (audit B B12, B13)", () => {
  const INPUT = { birth: { year: 1990 } };
  const READING_ID = "abcdefghij0123456789";
  const RESUME_KEY = "starlog.premium-resume.newyear-2027";
  const ME = { payments: true, login: true, owner: false, user: { nickname: "별", gift: null, unused: [{ orderId: "o", productId: "newyear-2027" }], opening: [] } };

  /** A tab that wrote the first part already, and a reading request answered by `reading`. */
  function openWith(reading: () => Response, readings: unknown[] = []) {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({ input: JSON.stringify(INPUT), resume: "resume-token", done: 1 }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/me") return Response.json(ME);
      if (url === "/api/premium/newyear-2027/reading") return reading();
      return Response.json({ readings, next: null });
    }));
    window.scrollTo = vi.fn() as never;
    const hook = renderHook(() =>
      usePremiumOpen({
        id: "newyear-2027",
        input: INPUT,
        plans: premiumProgressPlans("newyear-2027"),
        returnTo: "/premium/newyear-2027/preview",
        matches: () => true,
        accept: (r): r is unknown => Boolean(r),
        save: () => "local",
      }),
    );
    expect(hook.result.current.resumable).toBe(true);
    act(() => hook.result.current.open("paid"));
    return hook;
  }

  it("forgets this tab's resume token when 409 opened brings the account's copy, so a new purchase with the same input is not refused as opened", async () => {
    openWith(() => Response.json({ code: "NOT_AVAILABLE", reason: "opened", readingId: READING_ID }, { status: 409 }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${READING_ID}`));
    expect(sessionStorage.getItem(RESUME_KEY)).toBeNull();
  });

  it("forgets this tab's resume token when the account check after a cut-off finds the reading delivered", async () => {
    const delivered = { id: READING_ID, createdAt: Date.now(), chapter: { kind: "newyear" } };
    openWith(() => Response.json({ code: "UPSTREAM" }, { status: 502 }), [delivered]);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${READING_ID}`));
    expect(sessionStorage.getItem(RESUME_KEY)).toBeNull();
  });

  it("goes to the login page on LOGIN_REQUIRED without flashing an error first", async () => {
    const { result } = openWith(() => Response.json({ code: "LOGIN_REQUIRED" }, { status: 401 }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login?next=%2Fpremium%2Fnewyear-2027%2Fpreview"));
    await waitFor(() => expect(result.current.running).toBeNull());
    expect(result.current.error).toBeNull();
  });
});
