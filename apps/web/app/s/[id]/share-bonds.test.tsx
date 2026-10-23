// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SharePayload } from "@/lib/share/payload";
import { shareOgData } from "@/lib/share/og";
import SharePage, { generateMetadata } from "./page";

/** /s/<id> for 별자리 인연 (owner 2026-10-23), read live: the constellation, or a friend's own star with its score table. */

const { shares, repo } = vi.hoisted(() => {
  const STAR = (id: string, slot: number, nickname: string, score: number, parts: unknown[] = []) => ({
    id, constellationId: "cons0123456789abcdef", slot, nickname, message: "비밀 한 줄", cardId: "cups-02", orientation: "upright", score, parts, friendKey: "k", createdAt: 1,
  });
  const stars = [
    STAR("star0000000000000000", 0, "하늘", 87, [{ id: "stem-generate", points: 10, text: "두 분의 일간이 서로 살려 주는 사이예요" }, { id: "fill-mine", points: 5, text: "내게 부족한 수 기운을 친구가 채워 줘요" }]),
    STAR("star1111111111111111", 1, "바다", 69, [{ id: "stem-combine", points: 12, text: "두 분의 일간이 서로 합을 이루는 사이예요" }, { id: "year-clash", points: -5, text: "띠가 마주 보는 사이라, 부딪히면서 서로를 깨워요" }]),
  ];
  return {
    shares: new Map<string, unknown>(),
    repo: {
      getConstellation: async (id: string) => (id === "cons0123456789abcdef" ? { id, ownerId: "owner", sign: "leo", status: "filling", total: 156, startedAt: 1, completedAt: null } : null),
      getOwner: async () => ({ id: "owner", nickname: "용우" }),
      starsOf: async () => stars,
    },
  };
});
vi.mock("@/lib/db", () => ({ accountDb: () => ({}), bondsRepo: () => repo }));
vi.mock("@/lib/share/store", () => ({
  SHARE_ID: /^[a-z0-9]{12}$/,
  findShare: async (_db: unknown, id: string) => (shares.has(id) ? { id, payload: shares.get(id), createdAt: 0 } : null),
}));

afterEach(() => {
  cleanup();
  shares.clear();
});
const params = (id: string) => ({ params: Promise.resolve({ id }) }) as PageProps<"/s/[id]">;
const save = (id: string, payload: SharePayload) => (shares.set(id, payload), id);

describe("/s/<id> for an owner's constellation", () => {
  it("shows the figure with the friends' nicknames, the total and the average on a gauge, never a friend's own score or message", async () => {
    const id = save("bbbbbbbbbbb1", { kind: "bonds", v: 1, constellationId: "cons0123456789abcdef" });
    render(await SharePage(params(id)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("용우님의 사자자리");
    expect(document.body.textContent).toContain("하늘");
    expect(document.body.textContent).toContain("바다");
    expect(document.body.textContent).toContain("인연 합계 156점");
    expect(screen.getByRole("meter", { name: "평균 인연 점수" }).getAttribute("aria-valuenow")).toBe("78");
    expect(document.body.textContent).not.toMatch(/87점|69점|비밀 한 줄/);
    expect(screen.getByRole("link", { name: /내 별자리 만들기/ }).getAttribute("href")).toBe("/bonds");
    const meta = await generateMetadata(params(id));
    expect(meta.openGraph?.title).toBe("용우님의 사자자리 · 인연 156점");
  });

  it("is gone when the constellation is", async () => {
    const id = save("bbbbbbbbbbb2", { kind: "bonds", v: 1, constellationId: "gone0123456789abcdef" });
    await expect(SharePage(params(id))).rejects.toThrow();
  });
});

describe("/s/<id> for a friend's own star", () => {
  it("shows their score big on the gauge, the table of what made it from their side, their card and whose constellation", async () => {
    const id = save("bbbbbbbbbbb3", { kind: "bond", v: 1, constellationId: "cons0123456789abcdef", starId: "star0000000000000000" });
    render(await SharePage(params(id)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("하늘님과 용우님의 인연");
    expect(screen.getByRole("meter", { name: "인연 점수" }).getAttribute("aria-valuenow")).toBe("87");
    const table = screen.getByRole("table", { name: "점수를 만든 항목" });
    expect(within(table).getByText("+10")).toBeTruthy();
    // read from the friend's side: the 오행 the owner fills for them
    expect(within(table).getByText("친구에게 부족한 수 기운을 내가 채워 줘요")).toBeTruthy();
    expect(document.body.textContent).not.toContain("비밀 한 줄");
    expect(document.body.textContent).not.toContain("바다");
  });

  it("draws the constellation and the score big in its preview image", () => {
    const data = shareOgData({ kind: "bond", v: 1, constellationId: "c", starId: "s" }, "https://x.kr", {
      kind: "bond", sign: "leo", ownerNickname: "용우", friendNickname: "하늘", score: 87, parts: [], card: { cardId: "cups-02", orientation: "upright" }, bondLine: "",
    });
    expect(data).toMatchObject({ headline: "하늘님과 용우님", big: "인연 87점", sign: "leo" });
  });
});
