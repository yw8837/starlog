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
