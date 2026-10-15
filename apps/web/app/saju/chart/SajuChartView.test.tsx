// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { resetAccountForTests } from "@/lib/account/client";
import { chartFor } from "@/components/saju/useSajuChart";
import { saveTeaser } from "@/lib/reading/teaserCache";
import type { SajuTopicId } from "@/lib/reading/types";
import { DAY_MASTER_TIPS, SAJU_CONCEPT_TIPS } from "@/lib/reading/waitingTips";
import { clearSajuProfile, sajuTeaserKey, saveSajuProfile } from "@/lib/sajuFlow";
import { DEFAULT_SAJU_FORM, sanitizeSajuForm } from "@/lib/sajuForm";
import { SAJU_PROLOGUE_SECTIONS } from "@/lib/sajuPrologue";
import { OTHER_TOPICS_LABEL, TEASER_LIMIT_NOTICE, TOPIC_SECTIONS, UNLOCK_SCOPE_LINE, topicLockedToc } from "@/lib/sajuTopics";
import { clearChapters, listChapters, saveChapter, type NewChapter } from "@/lib/storage/chapters";
import { SajuChartView } from "./SajuChartView";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ID = "abcdefghij0123456789";
const ORDER = "Ab3_dEf-Gh5iJk7Lm9No1Pq2";
const BIRTH = sanitizeSajuForm({ ...DEFAULT_SAJU_FORM, year: 1994, month: 5, day: 17 })!;

/** Saved birth data and its 사주팔자 teaser, as the chart page left them. */
function seed() {
  saveSajuProfile(BIRTH);
  saveTeaser("saju", sajuTeaserKey(BIRTH, {}), { title: "고요한 물", summary: "첫 장 요약", lockedToc: ["성향", "올해"] });
}

const user = (over: Record<string, unknown> = {}) => ({ nickname: "별", gift: null, unused: [], opening: [], ...over });
const meBody = (over: Record<string, unknown> = {}) => ({ payments: true, login: true, owner: false, user: user(over) });
const GIFT = { status: "unused", until: "2026-12-30T14:59:59.999Z" };
const savedReading = (topic?: SajuTopicId) => ({
  id: ID,
  createdAt: Date.now(),
  chapter: { kind: "saju", birth: BIRTH, ...(topic ? { topic } : {}), title: "고요한 물", summary: "첫 장 요약", reading: { sections: [{ heading: "성향", body: "본문" }] }, chapterToken: "t0", createdAt: 1, turns: [], followUpsLeft: 3 },
});

type Body = Record<string, unknown>;
type Routes = {
  me: Array<() => Response | Promise<Response>>;
  reading?: (body: Body) => Response | Promise<Response>;
  readings?: () => Response;
  teaser?: (body: Body) => Response | Promise<Response>;
};

function stub(routes: Routes) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Body) : {};
    if (url === "/api/me") return (routes.me.length > 1 ? routes.me.shift()! : routes.me[0]!)();
    if (url === "/api/saju/reading") return routes.reading ? routes.reading(body) : Promise.reject(new TypeError("offline"));
    if (url === "/api/saju/teaser") return routes.teaser ? routes.teaser(body) : Promise.reject(new TypeError("offline"));
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
  vi.unstubAllEnvs();
  resetAccountForTests();
  sessionStorage.clear();
  clearSajuProfile();
  clearChapters();
  router.push.mockClear();
  router.replace.mockClear();
});

describe("SajuChartView and the signup gift (tarot only)", () => {
  it("offers a member holding an unused gift only paying, with no gift line", async () => {
    seed();
    stub({ me: [() => Response.json(meBody({ gift: GIFT }))] });
    render(<SajuChartView />);
    const sheet = await screen.findByRole("region", { name: "전체 풀이에 담긴 것" });
    expect(await within(sheet).findByRole("link", { name: "4,900원 결제하고 보기" })).toBeTruthy();
    expect(within(sheet).queryAllByRole("button")).toEqual([]);
    expect(sheet.textContent).not.toMatch(/선물|무료로 보기/);
  });

  it("asks a guest to log in to pay, without promising a free reading", async () => {
    seed();
    stub({ me: [() => Response.json({ payments: true, login: true, owner: false, user: null })] });
    render(<SajuChartView />);
    const sheet = await screen.findByRole("region", { name: "전체 풀이에 담긴 것" });
    expect(await within(sheet).findByRole("link", { name: "로그인하고 전체 풀이 보기" })).toBeTruthy();
    expect(sheet.textContent).toContain("로그인하면 바로 결제하고 열 수 있어요");
    expect(sheet.textContent).not.toMatch(/선물|무료로 드려요/);
  });
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

  it("once the check finds the purchase kept, 환불받기 goes to 결제한 풀이 in 내 정보, where its button is", async () => {
    seed();
    stub({ me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "saju" }] }))] });
    render(<SajuChartView />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    expect(await screen.findByText(/결제한 풀이는 그대로 남아 있어요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "환불받기" }).getAttribute("href")).toBe("/me#purchases");
  });

  it("checking again on a reading being opened that turns out kept offers it again with the refund link", async () => {
    seed();
    stub({
      me: [
        () => Response.json(meBody({ opening: [{ productId: "saju", currency: "paid", orderId: ORDER }] })),
        () => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "saju" }] })),
      ],
    });
    render(<SajuChartView />);
    fireEvent.click(await screen.findByRole("button", { name: "다시 확인하기" }));
    expect(await screen.findByText(/결제한 풀이는 그대로 남아 있어요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "환불받기" }).getAttribute("href")).toBe("/me#purchases");
    expect(await screen.findByRole("button", { name: "결제한 풀이 열기" })).toBeTruthy();
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

/** A guest while sales are closed here: the saju sheet offers no free reading (오픈 기념 무료 is tarot only). */
const OPENING_ME = () => Response.json({ payments: false, login: false, owner: false, user: null });
const OWNER_ME = () => Response.json({ payments: false, login: false, owner: true, user: null });
const teaserFor = (topic: SajuTopicId, title: string) => ({
  title, summary: `${title} 요약`, lockedToc: topicLockedToc(topic), topic, freshUntil: new Date(Date.now() + 86_400_000).toISOString(),
});
const sectionsOf = (topic: SajuTopicId) => TOPIC_SECTIONS[topic].map((heading) => ({ heading, body: "본문" }));
const readingOf = (topic: SajuTopicId) => ({
  reading: { sections: sectionsOf(topic), observation: { heading: "앞으로 몇 주 · 확인해 볼 신호", body: "신호" }, followUps: [] },
  chapterToken: "t1",
});
const seedTopic = (topic: SajuTopicId, title: string) => saveTeaser("saju", sajuTeaserKey(BIRTH, { topic }), teaserFor(topic, title));
const row = () => screen.getByRole("group", { name: OTHER_TOPICS_LABEL });
const tap = (name: string) => fireEvent.click(within(row()).getByRole("button", { name }));
const PAY_LINK = /결제하고 보기/;

describe("SajuChartView with the row 다른 운도 볼 수 있어요 (saju-topics owner cut §0)", () => {
  it("shows the 사주팔자 first exactly as today, with the four buttons right under it", async () => {
    seed();
    stub({ me: [OPENING_ME] });
    render(<SajuChartView />);
    expect(await screen.findByText("첫 장")).toBeTruthy();
    expect(screen.getByText("고요한 물")).toBeTruthy();
    expect(within(row()).getAllByRole("button").map((b) => b.textContent)).toEqual(["연애운", "재회운", "재물운", "직장운"]);
    expect(screen.getByText("고요한 물").compareDocumentPosition(row()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row().compareDocumentPosition(screen.getByRole("region", { name: "전체 풀이에 담긴 것" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "사주팔자로 돌아가기" })).toBeNull();
  });

  it("shows a 운's teaser in place with its own list and sheet, and the way back returns to 첫 장", async () => {
    seed();
    seedTopic("money", "흙 속의 쇠");
    stub({ me: [() => Response.json(meBody())] });
    render(<SajuChartView />);
    await screen.findByText("첫 장");
    tap("재물운");
    expect(await screen.findByText("재물운 · 맛보기")).toBeTruthy();
    expect(screen.getByText("흙 속의 쇠")).toBeTruthy();
    expect(screen.getByText("소제목 8개 · 약 2,500~3,000자")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "재물운 전체 풀이에 담긴 것" })).toBeTruthy();
    // The price and the pay link wait for the account (/api/me).
    expect(await screen.findByText("재물운 전체 풀이 · 4,900원")).toBeTruthy();
    expect(screen.getByText(UNLOCK_SCOPE_LINE)).toBeTruthy();
    expect(screen.getByRole("link", { name: PAY_LINK }).getAttribute("href")).toBe("/pay/checkout?product=saju&returnTo=%2Fsaju%2Fchart%3Ftopic%3Dmoney");
    fireEvent.click(screen.getByRole("button", { name: "사주팔자로 돌아가기" }));
    expect(await screen.findByText("첫 장")).toBeTruthy();
    expect(screen.getByText("고요한 물")).toBeTruthy();
    expect(screen.queryByText(UNLOCK_SCOPE_LINE)).toBeNull();
    expect(screen.getByRole("link", { name: PAY_LINK }).getAttribute("href")).toBe("/pay/checkout?product=saju&returnTo=%2Fsaju%2Fchart");
  });

  it("puts the way back to the 사주팔자 at the top of a 운's reading as a button, above its teaser and outside the row (owner 2026-10-14)", async () => {
    seed();
    seedTopic("money", "흙 속의 쇠");
    stub({ me: [OPENING_ME] });
    render(<SajuChartView />);
    await screen.findByText("첫 장");
    tap("재물운");
    const eyebrow = await screen.findByText("재물운 · 맛보기");
    const back = screen.getByRole("button", { name: "사주팔자로 돌아가기" });
    expect(back.className).toMatch(/secondary/);
    expect(back.compareDocumentPosition(eyebrow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row().contains(back)).toBe(false);
  });

  it("keeps the address on the 운 on screen, without scrolling, so a reload shows the same one (review 2026-10-14)", async () => {
    seed();
    seedTopic("money", "흙 속의 쇠");
    stub({ me: [OPENING_ME] });
    render(<SajuChartView initialTopic="money" />);
    await screen.findByText("재물운 · 맛보기");
    fireEvent.click(screen.getByRole("button", { name: "사주팔자로 돌아가기" }));
    expect(router.replace).toHaveBeenLastCalledWith("/saju/chart", { scroll: false });
    tap("재물운");
    expect(router.replace).toHaveBeenLastCalledWith("/saju/chart?topic=money", { scroll: false });
  });

  it("sends the example chart's 태어난 날 입력하기 straight to the birth input, not the topic step", async () => {
    stub({ me: [OPENING_ME] });
    render(<SajuChartView />);
    expect((await screen.findByRole("link", { name: /태어난 날 입력하기/ })).getAttribute("href")).toBe("/saju/new?new=1");
  });

  it("is step 3 of 3 with the topic step on, and its back link returns to the birth step on the 운 on screen", async () => {
    seed();
    seedTopic("money", "흙 속의 쇠");
    stub({ me: [OPENING_ME] });
    render(<SajuChartView />);
    await screen.findByText("첫 장");
    expect(screen.getByText("3단계 중", { exact: false }).textContent).toContain("3단계 중");
    const back = () => screen.getByRole("link", { name: "입력으로 돌아가기" });
    expect(back().getAttribute("href")).toBe("/saju/new");
    tap("재물운");
    await screen.findByText("재물운 · 맛보기");
    expect(back().getAttribute("href")).toBe("/saju/new?topic=money");
  });

  it("a 운 already kept on this device sends nothing; a new one sends one request with only its id", async () => {
    seed();
    seedTopic("career", "곧은 나무");
    const sent: Body[] = [];
    stub({ me: [OPENING_ME], teaser: (body) => (sent.push(body), Response.json(teaserFor("love", "봄의 촛불"))) });
    render(<SajuChartView />);
    await screen.findByText("첫 장");
    tap("직장운");
    expect(await screen.findByText("직장운 · 맛보기")).toBeTruthy();
    expect(sent).toHaveLength(0);
    tap("연애운");
    expect(await screen.findByText("봄의 촛불")).toBeTruthy();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ topic: "love" });
    expect(sent[0]).not.toHaveProperty("situation");
    expect(sent[0]).not.toHaveProperty("loveStatus");
    tap("직장운");
    expect(await screen.findByText("곧은 나무")).toBeTruthy();
    expect(sent).toHaveLength(1);
  });

  it("says the day's teasers are used up in place, and a 운 already seen still shows", async () => {
    seed();
    seedTopic("money", "흙 속의 쇠");
    stub({ me: [OPENING_ME], teaser: () => Response.json({ code: "BETA_LIMIT", message: "x" }, { status: 429 }) });
    render(<SajuChartView />);
    await screen.findByText("첫 장");
    tap("재회운");
    expect(await screen.findByText(TEASER_LIMIT_NOTICE, { selector: "#teaser-limit" })).toBeTruthy();
    expect(within(row()).getByRole("button", { name: "재회운" }).getAttribute("aria-pressed")).toBe("true");
    tap("재물운");
    expect(await screen.findByText("흙 속의 쇠")).toBeTruthy();
  });

  it("offers a guest no free saju reading while sales are closed, and asks the server for none", async () => {
    seed();
    seedTopic("money", "흙 속의 쇠");
    const reading = vi.fn(() => Response.json(readingOf("money")));
    stub({ me: [OPENING_ME], reading });
    render(<SajuChartView />);
    await screen.findByText("첫 장");
    for (const topic of [null, "재물운"]) {
      if (topic) tap(topic);
      const sheet = await screen.findByRole("region", { name: /전체 풀이에 담긴 것$/ });
      await within(sheet).findByText("전체 풀이는 결제하고 열 수 있어요");
      expect((within(sheet).getByRole("button", { name: "전체 풀이 보기" }) as HTMLButtonElement).disabled).toBe(true);
      expect(sheet.textContent).not.toMatch(/첫 이용|오픈 기념|처음 한 번|무료로 열|남았어요/);
    }
    expect(reading).not.toHaveBeenCalled();
  });

  it("opens the 운 on screen with the owner pass: the body carries the topic and the saved record keeps it", async () => {
    seed();
    seedTopic("money", "흙 속의 쇠");
    let opened: Body | null = null;
    stub({
      me: [OWNER_ME],
      reading: (body) => {
        opened = body;
        return Response.json(readingOf("money"));
      },
    });
    render(<SajuChartView />);
    await screen.findByText("첫 장");
    tap("재물운");
    fireEvent.click(await screen.findByRole("button", { name: "운영자로 무료 열기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(opened).toMatchObject({ topic: "money", unlock: { method: "owner" } });
    expect(opened).not.toHaveProperty("loveStatus");
    expect(listChapters().at(-1)).toMatchObject({ kind: "saju", topic: "money", title: "흙 속의 쇠" });
  });

  it("while the 사주팔자 reading is written, deals its cards: the part being written, the user's own 일간, then 사주 상식", async () => {
    seed();
    stub({ me: [OWNER_ME], reading: () => new Promise<Response>(() => {}) });
    render(<SajuChartView />);
    fireEvent.click(await screen.findByRole("button", { name: "운영자로 무료 열기" }));
    const cards = await screen.findByRole("region", { name: "기다리는 동안 읽을거리" });
    const shown = () => within(cards).getByRole("group");
    expect(within(shown()).getByText("지금 적는 중")).toBeTruthy();
    expect(within(shown()).getByText("타고난 바탕")).toBeTruthy();
    expect(within(shown()).getByText(`1 / ${SAJU_PROLOGUE_SECTIONS.length + 1}`)).toBeTruthy();
    const chart = chartFor(BIRTH);
    const dayMaster = "chart" in chart ? chart.chart.dayMaster : null;
    const dots = within(cards).getAllByRole("button");
    expect(dots).toHaveLength(1 + 3 + SAJU_CONCEPT_TIPS.length);
    fireEvent.click(dots[1]!);
    await waitFor(() => expect(within(shown()).getByText(`${dayMaster!.stem} ${dayMaster!.ko}`)).toBeTruthy());
    expect(within(shown()).getByText("내 일간")).toBeTruthy();
    expect(within(shown()).getByText(DAY_MASTER_TIPS[dayMaster!.ko]![0]!)).toBeTruthy();
    expect(screen.getByText("보통 1분 안팎")).toBeTruthy();
    expect(screen.getByText("이 화면을 열어 둔 채로 기다려 주세요.")).toBeTruthy();
  });

  it("links the reading opened on this device for the same 운 only", async () => {
    seed();
    seedTopic("money", "흙 속의 쇠");
    seedTopic("love", "봄의 촛불");
    saveChapter({ kind: "saju", birth: BIRTH, title: "흙 속의 쇠", summary: "요약", topic: "money", reading: { sections: sectionsOf("money") }, chapterToken: "t" } as NewChapter);
    stub({ me: [OPENING_ME] });
    render(<SajuChartView />);
    await screen.findByText("첫 장");
    expect(screen.queryByRole("link", { name: /열어 둔 풀이 보기/ })).toBeNull();
    tap("재물운");
    expect(await screen.findByRole("link", { name: /열어 둔 풀이 보기/ })).toBeTruthy();
    tap("연애운");
    await screen.findByText("봄의 촛불");
    expect(screen.queryByRole("link", { name: /열어 둔 풀이 보기/ })).toBeNull();
  });

  it("starts on a 운 when the address says so (back from checkout or login), and keeps it in the return links", async () => {
    seed();
    seedTopic("money", "흙 속의 쇠");
    stub({ me: [() => Response.json(meBody())] });
    render(<SajuChartView initialTopic="money" />);
    expect(await screen.findByText("재물운 · 맛보기")).toBeTruthy();
    expect(await screen.findByRole("link", { name: PAY_LINK })).toBeTruthy();
    expect(screen.getByRole("link", { name: PAY_LINK }).getAttribute("href")).toBe("/pay/checkout?product=saju&returnTo=%2Fsaju%2Fchart%3Ftopic%3Dmoney");
  });

  it("after checkout (?unlock=paid&topic=money) opens the 운 that was paid for", async () => {
    seed();
    seedTopic("money", "흙 속의 쇠");
    let opened: Body | null = null;
    stub({
      me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "saju" }] }))],
      reading: (body) => {
        opened = body;
        return Response.json(readingOf("money"));
      },
    });
    render(<SajuChartView autoUnlock="paid" initialTopic="money" />);
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(opened).toMatchObject({ topic: "money", unlock: { method: "paid" } });
    expect(listChapters().at(-1)).toMatchObject({ kind: "saju", topic: "money" });
    // Only ?unlock= leaves the address; the 운 stays, so a reload during the opening comes back to it.
    expect(router.replace).toHaveBeenCalledWith("/saju/chart?topic=money");
  });

  it("after checkout on the 사주팔자 (?unlock=paid) opens it and takes only ?unlock out of the address", async () => {
    seed();
    let opened: Body | null = null;
    stub({
      me: [() => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "saju" }] }))],
      reading: (body) => {
        opened = body;
        return Response.json({ reading: { sections: [{ heading: "성향", body: "본문" }], followUps: [] }, chapterToken: "t1" });
      },
    });
    render(<SajuChartView autoUnlock="paid" />);
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith("/saju/chart");
    expect(opened).toMatchObject({ unlock: { method: "paid" } });
    expect(opened).not.toHaveProperty("topic");
    expect(listChapters().at(-1)).not.toHaveProperty("topic");
  });

  it("after a reload (back on the 사주팔자) with a 운 being opened, 다시 확인하기 finds the delivered 운 reading instead of offering to pay", async () => {
    seed();
    stub({
      me: [() => Response.json(meBody({ opening: [{ productId: "saju", currency: "paid", orderId: ORDER }] })), () => Response.json(meBody())],
      readings: () => Response.json({ readings: [savedReading("money")], next: null }),
    });
    render(<SajuChartView />);
    fireEvent.click(await screen.findByRole("button", { name: "다시 확인하기" }));
    // Found: the person goes to the paid reading. Not found, the check ends "none" and a new payment is offered.
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
  });

  /**
   * 재물운's purchase is refused as still taken, the account then says one is being opened, the person
   * moves to 연애운, and by the time 다시 확인하기 is pressed the account holds a `delivered` 운 reading.
   */
  async function pressCheckAgainOnLoveAfterOpeningMoney(delivered: SajuTopicId) {
    seed();
    seedTopic("money", "흙 속의 쇠");
    seedTopic("love", "봄의 촛불");
    let held = false;
    stub({
      me: [
        () => Response.json(meBody({ unused: [{ orderId: ORDER, productId: "saju" }] })), // the page opens: a purchase to open
        () => Response.json(meBody()), // the refused opening's first check: nothing held, nothing being opened
        () => Response.json(meBody({ opening: [{ productId: "saju", currency: "paid", orderId: ORDER }] })), // the refreshed account: one is being opened
        () => Response.json(meBody()), // the check after 다시 확인하기
      ],
      reading: () => Response.json({ code: "NO_CREDIT" }, { status: 402 }),
      readings: () => Response.json({ readings: held ? [savedReading(delivered)] : [], next: null }),
    });
    render(<SajuChartView initialTopic="money" />);
    fireEvent.click(await screen.findByRole("button", { name: "결제한 풀이 열기" }));
    await screen.findByRole("button", { name: "다시 확인하기" });
    tap("연애운");
    await screen.findByText("봄의 촛불");
    held = true;
    fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));
  }

  it("remembers the 운 it was opening: 다시 확인하기 looks for that reading while another 운 is on screen", async () => {
    await pressCheckAgainOnLoveAfterOpeningMoney("money");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/chapter/${ID}`));
  });

  it("does not take another 운's reading for the one it was opening", async () => {
    await pressCheckAgainOnLoveAfterOpeningMoney("love");
    // Nothing of 재물운 came of it and nothing is being opened any more: a new payment is offered, nothing is opened.
    expect(await screen.findByRole("link", { name: PAY_LINK })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("with the topics off shows today's page: no row, 첫 장, even with ?topic=", async () => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "off");
    seed();
    stub({ me: [OPENING_ME] });
    render(<SajuChartView initialTopic="money" />);
    expect(await screen.findByText("첫 장")).toBeTruthy();
    expect(screen.getByText("고요한 물")).toBeTruthy();
    expect(screen.queryByRole("group", { name: OTHER_TOPICS_LABEL })).toBeNull();
    expect(screen.getByText("2단계 중", { exact: false })).toBeTruthy();
    expect(screen.getByRole("link", { name: "입력으로 돌아가기" }).getAttribute("href")).toBe("/saju/new");
  });

  it("in owner mode with the owner pass shows the row under the 사주팔자 teaser already on the device, asking for nothing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "owner");
    seed();
    const sent: Body[] = [];
    stub({
      me: [() => Response.json({ payments: false, login: false, owner: true, user: null })],
      teaser: (body) => (sent.push(body), Response.json(teaserFor("money", "다른 제목"))),
    });
    render(<SajuChartView />);
    expect(await screen.findByText("고요한 물")).toBeTruthy();
    expect(row()).toBeTruthy();
    expect(sent).toHaveLength(0);
  });

  it("in owner mode asks for no teaser until the account is known: nothing kept on the device, a slow /api/me, a 운 in the address", async () => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "owner");
    saveSajuProfile(BIRTH);
    const sent: Body[] = [];
    let answerAccount = () => {};
    const slowAccount = new Promise<Response>((resolve) => {
      answerAccount = () => resolve(Response.json({ payments: false, login: false, owner: true, user: null }));
    });
    stub({ me: [() => slowAccount], teaser: (body) => (sent.push(body), Response.json(teaserFor("money", "재물 제목"))) });
    render(<SajuChartView initialTopic="money" />);
    // The chart is up and waiting; the account has not answered, so nothing is asked for yet.
    expect(await screen.findByText("명식을 다시 살피고 있어요")).toBeTruthy();
    expect(sent).toHaveLength(0);
    answerAccount();
    expect(await screen.findByText("재물운 · 맛보기")).toBeTruthy();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ topic: "money" });
    expect(within(row()).getByRole("button", { name: "재물운" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("in owner mode without the owner pass keeps today's page", async () => {
    vi.stubEnv("NEXT_PUBLIC_SAJU_TOPICS", "owner");
    seed();
    stub({ me: [OPENING_ME] });
    render(<SajuChartView />);
    expect(await screen.findByText("고요한 물")).toBeTruthy();
    expect(screen.queryByRole("group", { name: OTHER_TOPICS_LABEL })).toBeNull();
  });

  it("shows no row on a non-Korean screen", async () => {
    seed();
    stub({ me: [OPENING_ME] });
    render(
      <LocaleProvider locale="en" messages={{}}>
        <SajuChartView />
      </LocaleProvider>,
    );
    expect(await screen.findByText("고요한 물")).toBeTruthy();
    expect(screen.queryByRole("group", { name: OTHER_TOPICS_LABEL })).toBeNull();
  });
});
