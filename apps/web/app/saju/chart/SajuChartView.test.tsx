// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { saveTeaser } from "@/lib/reading/teaserCache";
import { clearSajuProfile, saveSajuProfile } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM, sanitizeSajuForm } from "@/lib/sajuForm";
import { clearChapters } from "@/lib/storage/chapters";
import { SajuChartView } from "./SajuChartView";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ID = "abcdefghij0123456789";
const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";
const BIRTH = sanitizeSajuForm({ ...DEFAULT_SAJU_FORM, year: 1994, month: 5, day: 17 })!;

/** Saved birth data and its free reading, as the chart page left them. */
function seed() {
  saveSajuProfile(BIRTH);
  saveTeaser("saju", JSON.stringify({ birth: BIRTH }), { title: "고요한 물", summary: "첫 장 요약", lockedToc: ["성향", "올해"] });
}

const user = (over: Record<string, unknown> = {}) => ({ nickname: "별", stardust: 0, stardustExpiresAt: null, unused: [], opening: [], ...over });
const meBody = (over: Record<string, unknown> = {}) => ({ payments: true, login: true, owner: false, user: user(over) });
const savedReading = () => ({
  id: ID,
  createdAt: Date.now(),
  chapter: { kind: "saju", birth: BIRTH, title: "고요한 물", summary: "첫 장 요약", reading: { sections: [{ heading: "성향", body: "본문" }] }, chapterToken: "t0", createdAt: 1, turns: [], followUpsLeft: 3 },
});

type Routes = { me: Array<() => Response>; reading?: () => Response | Promise<Response>; readings?: () => Response };

function stub(routes: Routes) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/me") return (routes.me.length > 1 ? routes.me.shift()! : routes.me[0]!)();
    if (url === "/api/saju/reading") return routes.reading ? routes.reading() : Promise.reject(new TypeError("offline"));
    if (url.startsWith("/api/readings")) return routes.readings ? routes.readings() : Response.json({ readings: [], next: null });
    return Response.json({});
  }));
}

beforeEach(() => {
  window.scrollTo = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
  sessionStorage.clear();
  clearSajuProfile();
  clearChapters();
  router.push.mockClear();
  router.replace.mockClear();
});

describe("SajuChartView after a paid opening was cut off", () => {
  it("offers nothing to press while it checks whether the reading opened", async () => {
    seed();
    stub({ me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "saju" }] })), () => Response.json(meBody({ opening: [{ productId: "saju", currency: "paid", orderId: ORDER }] }))] });
    render(<SajuChartView />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    expect(await screen.findByText("풀이가 열렸는지 확인하고 있어요", { selector: "#unlock-error" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "결제한 풀이 열기" })).toBeNull();
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
  });

  it("when the server refuses because the purchase is still taken, checks and opens the delivered reading instead of offering to pay", async () => {
    seed();
    stub({
      me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "saju" }] })), () => Response.json(meBody())],
      reading: () => Response.json({ code: "NO_CREDIT" }, { status: 402 }),
      readings: () => Response.json({ readings: [savedReading()], next: null }),
    });
    render(<SajuChartView />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
  });

  it("while the account is opening a saju reading, says so instead of offering to buy or open", async () => {
    seed();
    stub({ me: [() => Response.json(meBody({ unused: [{ orderId: "other", productId: "saju" }], opening: [{ productId: "saju", currency: "paid", orderId: ORDER }] }))] });
    render(<SajuChartView />);
    expect(await screen.findByText("열고 있는 풀이가 있어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 확인하기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "결제한 풀이 열기" })).toBeNull();
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
  });
});
