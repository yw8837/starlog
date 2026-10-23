// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SharePayload } from "@/lib/share/payload";
import { shareOgData } from "@/lib/share/og";
import SharePage, { generateMetadata } from "./page";

/** /s/<id> for 별자리 인연 (owner 2026-10-23), read live: the constellation, or a friend's own star with its score table. */

const { shares, repo, status } = vi.hoisted(() => {
  const STAR = (id: string, slot: number, nickname: string, score: number, parts: unknown[] = []) => ({
    id, constellationId: "cons0123456789abcdef", slot, nickname, message: "비밀 한 줄", cardId: "cups-02", orientation: "upright", score, parts, friendKey: "k", createdAt: 1,
  });
  const stars = [
    STAR("star0000000000000000", 0, "하늘", 87, [{ id: "stem-generate", points: 10, text: "두 분의 일간이 서로 살려 주는 사이예요" }, { id: "fill-mine", points: 5, text: "내게 부족한 수 기운을 친구가 채워 줘요" }]),
    STAR("star1111111111111111", 1, "바다", 69, [{ id: "stem-combine", points: 12, text: "두 분의 일간이 서로 합을 이루는 사이예요" }, { id: "year-clash", points: -5, text: "띠가 마주 보는 사이라, 부딪히면서 서로를 깨워요" }]),
  ];
  const status = { value: "filling" };
  return {
    shares: new Map<string, unknown>(),
    status,
    repo: {
      getConstellation: async (id: string) => (id === "cons0123456789abcdef" ? { id, ownerId: "owner", sign: "leo", status: status.value, total: 156, startedAt: 1, completedAt: status.value === "complete" ? Date.parse("2026-10-20T03:00:00Z") : null } : null),
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
  status.value = "filling";
});
const params = (id: string) => ({ params: Promise.resolve({ id }) }) as PageProps<"/s/[id]">;
const save = (id: string, payload: SharePayload) => (shares.set(id, payload), id);

describe("/s/<id> for an owner's constellation", () => {
  it("while filling: the figure, the stars filled and the friends' nicknames, and no number (privacy §4: a sum of few is their scores)", async () => {
    const id = save("bbbbbbbbbbb1", { kind: "bonds", v: 1, constellationId: "cons0123456789abcdef" });
    render(await SharePage(params(id)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("용우님의 사자자리");
    expect(document.body.textContent).toContain("하늘");
    expect(document.body.textContent).toContain("바다");
    expect(document.body.textContent).toMatch(/별 2\/\d+/);
    expect(screen.queryByRole("meter")).toBeNull();
    expect(document.body.textContent).not.toMatch(/156|78점|87점|69점|합계|평균|비밀 한 줄/);
    expect(screen.getByRole("link", { name: /내 별자리 만들기/ }).getAttribute("href")).toBe("/bonds");
    const meta = await generateMetadata(params(id));
    expect(meta.openGraph?.title).toMatch(/^용우님의 사자자리 · 별 2\/\d+$/);
    expect(String(meta.openGraph?.description)).not.toMatch(/\d+점/);
  });

  it("once complete: the total and the average on a gauge too, as the share image's total always showed", async () => {
    status.value = "complete";
    const id = save("bbbbbbbbbbb4", { kind: "bonds", v: 1, constellationId: "cons0123456789abcdef" });
    render(await SharePage(params(id)));
    expect(document.body.textContent).toContain("인연 합계 156점");
    expect(screen.getByRole("meter", { name: "평균 인연 점수" }).getAttribute("aria-valuenow")).toBe("78");
    expect(document.body.textContent).not.toMatch(/87점|69점|비밀 한 줄/);
    expect((await generateMetadata(params(id))).openGraph?.title).toBe("용우님의 사자자리 완성 · 인연 156점");
  });

  it("draws the stars where they are (a removed star leaves its gap), and the score only once complete", () => {
    const live = { kind: "bonds" as const, sign: "leo" as const, ownerNickname: "용우", slots: 9, members: [{ slot: 0, nickname: "하늘" }, { slot: 3, nickname: "바다" }], total: null, average: null, complete: false, completedAt: null };
    const filling = shareOgData({ kind: "bonds", v: 1, constellationId: "c" }, "https://x.kr", live);
    expect(filling.lit).toEqual([0, 3]);
    expect(filling.big).toBeUndefined();
    expect(JSON.stringify(filling)).not.toMatch(/점/);
    const done = shareOgData({ kind: "bonds", v: 1, constellationId: "c" }, "https://x.kr", { ...live, total: 156, average: 78, complete: true });
    expect(done.big).toBe("인연 156점");
  });

  it("is gone when the constellation is", async () => {
    const id = save("bbbbbbbbbbb2", { kind: "bonds", v: 1, constellationId: "gone0123456789abcdef" });
    await expect(SharePage(params(id))).rejects.toThrow();
  });
});

describe("/s/<id> for a friend's own star", () => {
  it("shows their score big on the gauge, their card and whose constellation, but not the table: its reasons hint at the owner's 오행 and age", async () => {
    const id = save("bbbbbbbbbbb3", { kind: "bond", v: 1, constellationId: "cons0123456789abcdef", starId: "star0000000000000000" });
    render(await SharePage(params(id)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("하늘님과 용우님의 인연");
    expect(screen.getByRole("meter", { name: "인연 점수" }).getAttribute("aria-valuenow")).toBe("87");
    expect(screen.queryByRole("table")).toBeNull();
    expect(document.body.textContent).not.toMatch(/부족한|일간이|띠가|비밀 한 줄|바다/);
    expect(String((await generateMetadata(params(id))).openGraph?.description)).not.toMatch(/부족한|일간이|띠가/);
  });

  it("draws the constellation and the score big in its preview image", () => {
    const data = shareOgData({ kind: "bond", v: 1, constellationId: "c", starId: "s" }, "https://x.kr", {
      kind: "bond", sign: "leo", ownerNickname: "용우", friendNickname: "하늘", score: 87, card: { cardId: "cups-02", orientation: "upright" }, bondLine: "",
    });
    expect(data).toMatchObject({ headline: "하늘님과 용우님", big: "인연 87점", sign: "leo" });
    expect(data.body ?? "").not.toMatch(/부족한|띠가|일간이|일지가/);
  });
});
