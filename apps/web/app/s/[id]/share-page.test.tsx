// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TAROT_SAMPLE } from "@/lib/fixtures";
import type { ChapterContext } from "@/lib/security/chapterToken";
import { buildDailySharePayload, buildSharePayload, type SharePayload } from "@/lib/share/payload";
import NotFound from "./not-found";
import SharePage, { generateMetadata } from "./page";

// The test D1 needs a file URL that jsdom does not give, so the store is a map here; the store itself
// is tested against D1 in app/api/share/share.test.ts.
const { shares } = vi.hoisted(() => ({ shares: new Map<string, SharePayload>() }));
vi.mock("@/lib/db", () => ({ accountDb: () => ({}) }));
vi.mock("@/lib/share/store", () => ({
  SHARE_ID: /^[a-z0-9]{12}$/,
  findShare: async (_db: unknown, id: string) => (shares.has(id) ? { id, payload: shares.get(id), createdAt: 0 } : null),
}));

function saveShare(id: string, payload: SharePayload): string {
  shares.set(id, payload);
  return id;
}

const tarotCtx: ChapterContext = {
  kind: "tarot",
  templateId: "relationship-contact",
  input: { topicId: "love", whoId: "us", question: "그 사람에게 먼저 연락해도 될까요?", conditions: [], note: "비밀 메모예요" },
  cards: [
    ["major-09-hermit", "upright"],
    ["major-17-star", "reversed"],
    ["cups-03", "upright"],
  ],
};
const sajuCtx = {
  kind: "saju",
  birth: { calendar: "solar", year: 1990, month: 1, day: 1, isLeapMonth: false, timeKnown: false, hour: null, minute: null, gender: "female", placeId: "seoul" },
  topic: "love",
} as ChapterContext;
const sajuReading = {
  glance: { goesWell: "사람을 모으는 일", watchOut: "서두르는 말", remedy: "아침에 햇볕 쬐기", thisYear: "올해는 마음을 표현할수록 길이 열려요.", thisYearAction: "새 모임에 나가 보기" },
  sections: [{ heading: "타고난 바탕 · 태어난 계절", body: "1990년 1월 1일, 한겨울에 태어난 해의 기운이에요." }],
  observation: { heading: "돌아보기", body: "이번 주에 먼저 연락한 사람을 떠올려 봐요." },
};

afterEach(() => {
  cleanup();
  shares.clear();
});

const params = (id: string) => ({ params: Promise.resolve({ id }) }) as PageProps<"/s/[id]">;

describe("/s/[id]", () => {
  it("shows a shared tarot reading as its result screen: the cards in the design it was read with and the whole reading, no question", async () => {
    const id = saveShare("aaaaaaaaaaa1", buildSharePayload(tarotCtx, TAROT_SAMPLE.paid, "starlog"));
    render(await SharePage(params(id)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("카드 세 장이 건넨 이야기");
    expect(document.body.textContent).toContain(TAROT_SAMPLE.paid.verdict);
    expect(document.body.textContent).toContain("질문과 직접 쓴 말, 고른 상황은 공유한 사람만 볼 수 있어요.");
    expect(document.body.textContent).not.toContain("먼저 연락해도 될까요");
    const faces = [...document.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? "").filter((src) => src.includes("major-09-hermit"));
    expect(faces[0]).toContain("/cards/starlog/");
    expect(screen.getByRole("link", { name: /타로 보기/ }).getAttribute("href")).toBe("/tarot/new?new=1");
  });

  it("shows a shared saju reading without the birth data or the chart", async () => {
    const id = saveShare("aaaaaaaaaaa2", buildSharePayload(sajuCtx, sajuReading));
    render(await SharePage(params(id)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("연애운 풀이");
    expect(document.body.textContent).toContain("올해는 마음을 표현할수록 길이 열려요.");
    expect(document.body.textContent).toContain("생년월일과 태어난 시각, 명식, 고른 상황은 공유한 사람만 볼 수 있어요.");
    expect(document.body.textContent).not.toMatch(/1990|1월 1일/);
  });

  it("puts a way to the Starlog home at the top and at the end, for tarot and saju (owner 2026-10-14)", async () => {
    for (const [id, payload] of [
      ["aaaaaaaaaab1", buildSharePayload(tarotCtx, TAROT_SAMPLE.paid, "starlog")],
      ["aaaaaaaaaab2", buildSharePayload(sajuCtx, sajuReading)],
    ] as const) {
      render(await SharePage(params(saveShare(id, payload))));
      const home = screen.getAllByRole("link", { name: "스타로그 홈으로" });
      expect(home.map((a) => a.getAttribute("href"))).toEqual(["/", "/"]);
      expect(home[0]!.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      cleanup();
    }
  });

  it("previews the link with the cards drawn, and keeps the page out of search", async () => {
    const id = saveShare("aaaaaaaaaaa3", buildSharePayload(tarotCtx, TAROT_SAMPLE.paid, "starlog"));
    const meta = await generateMetadata(params(id));
    expect(meta.title).toBe("친구가 뽑은 카드 · 은둔자 · 별(역) · 컵 3");
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: `/api/og/share/${id}`, width: 1200, height: 630 })]);
  });

  const daily = buildDailySharePayload(
    {
      card: { cardId: "major-17-star", orientation: "reversed", keyword: "희망" },
      summary: "작은 빛 하나를 따라가 보는 하루",
      body: "별 카드는 밤하늘 아래 물을 붓는 사람을 그려요. 서두르지 않아도 괜찮다는 이야기예요.",
      areas: { love: "먼저 안부를 건네 보세요", money: "작은 지출을 적어 봐요", work: "한 가지만 끝내 봐요" },
      lucky: { color: "하늘색", number: 7 },
      tip: "물 한 잔을 천천히 마셔 보세요",
      deck: "starlog",
    },
    "2026-10-20",
  );

  it("shows a shared 오늘의 한 장 as the sender saw it: the day, the card face in its design, its name and the whole reading", async () => {
    render(await SharePage(params(saveShare("aaaaaaaaaad1", daily))));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("10월 20일의 한 장");
    const text = document.body.textContent ?? "";
    expect(text).toContain("친구가 공유한 오늘의 한 장");
    expect(text).toContain("별 · 역방향");
    for (const part of ["희망", "작은 빛 하나를 따라가 보는 하루", daily.kind === "daily" ? daily.reading.body : "", "먼저 안부를 건네 보세요", "작은 지출을 적어 봐요", "한 가지만 끝내 봐요", "하늘색", "7", "물 한 잔을 천천히 마셔 보세요"]) {
      expect(text).toContain(part);
    }
    const faces = [...document.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? "").filter((src) => src.includes("major-17-star"));
    expect(faces[0]).toContain("/cards/starlog/");
    expect(text).not.toMatch(/베타|Claude|Anthropic|GPT|정확도|적중/);
  });

  it("invites the visitor to draw their own card on /today, the one gold button of the page", async () => {
    const { container } = render(await SharePage(params(saveShare("aaaaaaaaaad2", daily))));
    const draw = screen.getByRole("link", { name: /오늘의 한 장 뽑기/ });
    expect(draw.getAttribute("href")).toBe("/today");
    const primaries = [...container.querySelectorAll("a, button")].filter((el) => /primary/.test(el.className));
    expect(primaries).toEqual([draw]);
    expect(screen.getAllByRole("link", { name: "스타로그 홈으로" }).map((a) => a.getAttribute("href"))).toEqual(["/", "/"]);
  });

  it("previews a shared 오늘의 한 장 with its card and today's line", async () => {
    const id = saveShare("aaaaaaaaaad3", daily);
    const meta = await generateMetadata(params(id));
    expect(meta.title).toBe("친구가 뽑은 오늘의 한 장 · 별(역)");
    expect(meta.description).toBe("작은 빛 하나를 따라가 보는 하루");
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: `/api/og/share/${id}`, width: 1200, height: 630 })]);
  });

  it("answers 404 for a link that was never made or was stopped, kept out of search", async () => {
    await expect(SharePage(params("abcdefghijkl"))).rejects.toThrow();
    await expect(SharePage(params("../../etc"))).rejects.toThrow();
    expect((await generateMetadata(params("abcdefghijkl"))).robots).toEqual({ index: false, follow: false });
  });

  it("shows a stopped or unknown link as a friendly page with a way home", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("공유가 멈췄거나 없는 풀이예요");
    expect(screen.getByRole("link", { name: "홈으로" }).getAttribute("href")).toBe("/");
  });
});

