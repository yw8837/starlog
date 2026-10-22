// @vitest-environment jsdom
import { getCard } from "@starlog/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decisionFor } from "@/lib/decision";
import type { ChapterContext } from "@/lib/security/chapterToken";
import { buildNowSharePayload, buildPremiumSharePayload, buildSajuFreePayload, buildTarotFreePayload, type SharePayload } from "@/lib/share/payload";
import { shareOgData } from "@/lib/share/og";
import SharePage, { generateMetadata } from "./page";

/** /s/<id> for every kind a share can now be (owner 2026-10-23): what was shared shows, never the home. */

const { shares } = vi.hoisted(() => ({ shares: new Map<string, SharePayload>() }));
vi.mock("@/lib/db", () => ({ accountDb: () => ({}), bondsRepo: () => ({}) }));
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

const tarotCtx: Extract<ChapterContext, { kind: "tarot" }> = {
  kind: "tarot",
  templateId: "relationship-contact",
  input: { topicId: "love", whoId: "us", question: "그 사람에게 먼저 연락해도 될까요?", conditions: [], note: "비밀 메모예요", deck: "starlog" },
  cards: [
    ["major-09-hermit", "upright"],
    ["major-17-star", "reversed"],
    ["cups-03", "upright"],
  ],
};

describe("/s/<id> for 지금의 한 장", () => {
  it("shows the card, the one line and why, and 나도 한 장 뽑아 보기 into /now", async () => {
    const payload = buildNowSharePayload({ cardId: "major-17-star", orientation: "reversed", pick: 0, deck: "starlog" })!;
    const id = save("nnnnnnnnnnn1", payload);
    render(await SharePage(params(id)));
    const entry = decisionFor("major-17-star", "reversed", "starlog");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(entry.answers[0]);
    expect(document.body.textContent).toContain(entry.why);
    expect(document.body.textContent).toContain("별 · 역방향");
    expect([...document.querySelectorAll("img")].some((img) => (img.getAttribute("src") ?? "").includes("/starlog/major-17-star"))).toBe(true);
    expect(screen.getByRole("link", { name: /나도 한 장 뽑아 보기/ }).getAttribute("href")).toBe("/now");
    const meta = await generateMetadata(params(id));
    expect(String(meta.title)).toBe("친구가 뽑은 지금의 한 장 · 별(역)");
    expect(meta.openGraph?.url).toBe(`/s/${id}`);
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(shareOgData(payload, "https://x.kr")).toMatchObject({ label: "친구가 뽑은 지금의 한 장", headline: "별(역)", body: entry.answers[0] });
  });
});

describe("/s/<id> for the free first tarot reading", () => {
  it("shows the cards and the free part only, says the rest stays with the sharer, and leads into a reading", async () => {
    const payload = buildTarotFreePayload(tarotCtx, { first: { heading: "은둔자 · 지금의 나", body: "혼자 생각을 고르는 때예요." }, second: { heading: "별(역) · 상대의 마음", body: "아직은 기대를" } });
    const id = save("fffffffffff1", payload);
    render(await SharePage(params(id)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("카드 세 장이 건넨 이야기");
    expect(document.body.textContent).toContain("혼자 생각을 고르는 때예요.");
    expect(document.body.textContent).toContain("아직은 기대를");
    expect(document.body.textContent).toContain("이어지는 이야기는 공유한 사람만 볼 수 있어요");
    expect(document.body.textContent).not.toContain("먼저 연락해도");
    expect(screen.getByRole("link", { name: /타로 보기/ })).toBeTruthy();
    expect(String((await generateMetadata(params(id))).title)).toBe("친구가 뽑은 카드 · 은둔자 · 별(역) · 컵 3");
  });
});

describe("/s/<id> for the free saju teaser", () => {
  it("shows the 맛보기's title and summary under its 운, and 내 사주도 보기", async () => {
    const payload = buildSajuFreePayload({ birth: { calendar: "solar", year: 1990, month: 1, day: 1, isLeapMonth: false, gender: "female", timeKnown: false, hour: null, minute: null, placeId: "seoul" } as never, topic: "love" }, { title: "천천히 데워지는 마음", summary: "가까운 사람에게 먼저 마음을 보여 줄수록 길이 열려요." });
    const id = save("sssssssssss1", payload);
    render(await SharePage(params(id)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("천천히 데워지는 마음");
    expect(document.body.textContent).toContain("연애운 맛보기");
    expect(document.body.textContent).toContain("가까운 사람에게 먼저 마음을 보여 줄수록 길이 열려요.");
    expect(screen.getByRole("link", { name: /사주 보기/ })).toBeTruthy();
    expect(shareOgData(payload, "https://x.kr")).toMatchObject({ label: "친구가 공유한 연애운 맛보기", headline: "천천히 데워지는 마음" });
  });
});

describe("/s/<id> for a premium reading", () => {
  it("켈틱 크로스: the product's name and its ten cards, never its text, with the product page to try", async () => {
    const cards = ["major-00-fool", "major-01-magician", "major-02-high-priestess", "major-03-empress", "major-04-emperor", "major-05-hierophant", "major-06-lovers", "major-07-chariot", "major-08-strength", "major-09-hermit"];
    const payload = buildPremiumSharePayload({ kind: "tarot-deep", input: tarotCtx.input, cards: cards.map((c) => [c, "upright"] as [string, "upright"]) }, {});
    const id = save("ppppppppppp1", payload);
    render(await SharePage(params(id)));
    expect(document.body.textContent).toContain("켈틱 크로스");
    for (const cardId of cards) expect(document.body.textContent).toContain(getCard(cardId).names.ko);
    expect(screen.getAllByRole("link").some((a) => (a.getAttribute("href") ?? "").includes("deep-tarot"))).toBe(true);
  });

  it("궁합: the relation and the product, nothing of either person", async () => {
    const id = save("ppppppppppp2", buildPremiumSharePayload({ kind: "match", me: { birth: {} as never }, partner: { sealed: "x", label: "민수" }, relation: "friend" }, {}));
    render(await SharePage(params(id)));
    expect(document.body.textContent).toContain("친구");
    expect(document.body.textContent).not.toContain("민수");
  });
});
