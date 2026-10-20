// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAccountForTests } from "@/lib/account/client";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { clearChapters, saveChapter } from "@/lib/storage/chapters";
import HomePage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

const card = { position: "지금의 나", cardId: "major-00", orientation: "upright" as const };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ products: [] })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
  resetAccountForTests();
  clearChapters();
  localStorage.clear();
});

describe("the home's rows", () => {
  it("shows no 지난 풀이 돌아보기 even when a reading is due (owner 2026-10-20: it lives in 내 정보)", async () => {
    saveChapter(
      {
        kind: "tarot",
        question: "돌아볼 질문",
        conditions: [],
        note: "",
        cards: [card],
        reading: { verdict: "결론", cards: [], action: { heading: "오늘", body: "해 볼 일" }, observation: { heading: "며칠 안에 확인해 볼 신호", body: "답장이 오는지 보세요" } } as never,
        chapterToken: "t",
      },
      Date.now() - 4 * 86_400_000,
    );
    render(<HomePage />);
    await waitFor(() => expect(screen.getByRole("link", { name: /타로 보기/ })).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/지난 풀이 돌아보기/)).toBeNull();
  });
});
