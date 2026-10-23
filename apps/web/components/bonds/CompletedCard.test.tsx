// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ConstellationView, StarView } from "@/lib/bonds/service";
import { CompletedCard } from "./CompletedCard";

afterEach(cleanup);

const star = (slot: number, score: number): StarView => ({
  id: `s${slot}`, slot, nickname: `친구${slot}`, message: null, cardId: "wands-01", orientation: "upright", score, parts: [], createdAt: 1, line: "",
});
const ROW: ConstellationView & { stars: StarView[] } = {
  id: "c1", sign: "aries", status: "complete", total: 412, startedAt: 1, completedAt: Date.UTC(2026, 9, 1, 3),
  stars: [star(0, 100), star(1, 100), star(2, 112), star(3, 100)],
};

const show = (props: Partial<Parameters<typeof CompletedCard>[0]> = {}) =>
  render(<CompletedCard row={ROW} ownerNickname="용우" allRank={3} filling={null} sharePrimary={false} onRefilled={() => undefined} {...props} />);

describe("CompletedCard", () => {
  it("says the all-time rank on one line: the sign and the place, with no week and no hall of fame", () => {
    const { container } = show();
    expect(screen.getByText("양자리 3위")).toBeTruthy();
    expect(container.querySelectorAll("ul li")).toHaveLength(1);
    expect(container.textContent).not.toMatch(/이번 주|명예의 전당/);
  });

  it("says plainly when it is not on the ranking", () => {
    const { container } = show({ allRank: null });
    expect(screen.getByText("랭킹에는 없어요")).toBeTruthy();
    expect(container.textContent).not.toMatch(/이번 주|명예의 전당/);
  });

  it("shares with the plain label, or with the one a ranking page gives it, through the same image", () => {
    show();
    expect(screen.getByRole("button", { name: "별자리 공유하기" })).toBeTruthy();
    cleanup();
    show({ shareLabel: "내 순위 공유하기", sharePrimary: true });
    expect(screen.getByRole("button", { name: "내 순위 공유하기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "공유하기" })).toBeNull();
  });
});
