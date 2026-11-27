// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { assertVoice } from "@/lib/voice/banned";
import WorriesPage from "./page";

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT;${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/worries" }));

function premium(visible: boolean) {
  const fetchMock = vi.fn(async () => Response.json({ products: ["tarot-deep", "match", "newyear-2027"].map((id) => ({ id, open: visible, visible, opensAt: null })) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
  redirect.mockClear();
});

const list = () => screen.getByRole("region", { name: "고민 목록" });
const worryLinks = () => within(list()).getAllByRole("link").map((a) => a.getAttribute("href"));

/** Spec 2026-11-26 worry catalog §5.3: the category chips, the worries, then 도구로 바로 보기. */
describe("/worries", () => {
  it("lists every worry under 전체, the premium two once their product is visible here", async () => {
    const fetchMock = premium(true);
    render(<WorriesPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("고민 전체 보기");
    // True for saju and 궁합 too, which take no question (code review 2026-11-26 A4).
    expect(screen.getByText("고민을 고르면 맞는 풀이로 바로 이어져요.")).toBeTruthy();
    // Before the premium status answers: the ten that need no premium.
    expect(worryLinks()).toHaveLength(10);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(worryLinks()).toEqual(["/w/some", "/w/no-reply", "/w/miss-ex", "/w/again", "/w/after-breakup", "/w/moved-on", "/w/coworker", "/w/solo", "/w/money-leak", "/w/job", "/w/marry", "/w/stay-or-go"]));
    for (const a of within(list()).getAllByRole("link")) assertVoice((a.textContent ?? "").replaceAll("집안일", ""));
  });

  it("keeps the premium two out while premium is off here", async () => {
    const fetchMock = premium(false);
    render(<WorriesPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(worryLinks()).not.toContain("/w/marry");
    expect(worryLinks()).not.toContain("/w/stay-or-go");
  });

  it("narrows the list by the chips 전체, 연애·재회, 돈, 일", async () => {
    premium(true);
    render(<WorriesPage />);
    const chips = within(screen.getByRole("group", { name: "고민 분류" })).getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual(["전체", "연애·재회", "돈", "일"]);
    expect(chips[0]!.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chips[2]!);
    expect(worryLinks()).toEqual(["/w/money-leak"]);
    fireEvent.click(chips[3]!);
    await waitFor(() => expect(worryLinks()).toEqual(["/w/coworker", "/w/job", "/w/stay-or-go"]));
    fireEvent.click(chips[1]!);
    expect(worryLinks()).toEqual(["/w/some", "/w/no-reply", "/w/miss-ex", "/w/again", "/w/after-breakup", "/w/moved-on", "/w/solo", "/w/marry"]);
  });

  it("ends with the readings by their tools' names: 타로 3장, 사주, 가격 안내", () => {
    premium(false);
    render(<WorriesPage />);
    const tools = screen.getByRole("region", { name: "도구로 바로 보기" });
    expect(within(tools).getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["타로 3장 보기", "/tarot/new"],
      ["사주 보기", "/saju/start"],
      ["가격 안내", "/pricing"],
    ]);
  });

  it("sends home while SITE.features.worries is off (§8)", () => {
    const features = SITE.features as { worries: boolean };
    features.worries = false;
    try {
      expect(() => WorriesPage()).toThrow("NEXT_REDIRECT;/");
    } finally {
      features.worries = true;
    }
  });
});
