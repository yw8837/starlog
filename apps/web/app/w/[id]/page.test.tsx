// @vitest-environment jsdom
import { TEMPLATES } from "@starlog/core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE, won } from "@/lib/config";
import { FLOW_KEY, saveFlow, summarizeFlow } from "@/lib/flowState";
import { PREMIUM } from "@/lib/premium/products";
import { TOPIC_SECTIONS, sectionHook } from "@/lib/sajuTopics";
import { assertVoice } from "@/lib/voice/banned";
import { WORRIES, findWorry, presetFlow, worryMethod, type Worry } from "@/lib/worries";
import MarryWorryPage, { generateMetadata as marryMetadata } from "../marry/page";
import StayOrGoWorryPage, { generateMetadata as stayOrGoMetadata } from "../stay-or-go/page";
import WorryPage, { generateMetadata, generateStaticParams } from "./page";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT;${to}`);
  }),
}));
vi.mock("next/navigation", () => ({ ...nav, useRouter: () => router, usePathname: () => "/w/some" }));

/**
 * The premium screens' server gate (lib/premium/pageGate.ts), as this request would answer it: `visible` here (and `open`,
 * on sale), or a purchase `held` by the logged-in user.
 */
const gate = vi.hoisted(() => ({ visible: true, open: true, held: false, asked: [] as string[] }));
vi.mock("@/lib/premium/pageGate", () => ({
  premiumStateHere: async (id: string) => {
    gate.asked.push(id);
    return { visible: gate.visible, open: gate.visible && gate.open };
  },
  premiumPageOpen: async (id: string) => {
    gate.asked.push(id);
    return gate.visible || gate.held;
  },
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
/** The premium two have pages of their own (code review 2026-11-26 A1); the other ten are [id]'s. */
const page = (id: string) => (id === "marry" ? MarryWorryPage() : id === "stay-or-go" ? StayOrGoWorryPage() : WorryPage(params(id)));
const show = async (id: string) => render(await page(id));
const reflectTitle = (worry: Worry) => (worry.reading.kind === "tarot" ? "뽑기 전에 떠올려 봐" : "시작 전에 떠올려 봐");

beforeEach(() => {
  // No premium status is read in the browser: a request for one would fail, and nothing may depend on it.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.assign(gate, { visible: true, open: true, held: false, asked: [] });
  router.push.mockClear();
  router.replace.mockClear();
  nav.notFound.mockClear();
  nav.redirect.mockClear();
  sessionStorage.clear();
});

const section = (name: string) => screen.getByRole("region", { name });

/** Spec 2026-11-26 worry catalog §5.2 in §12.2's order, §11 (이 풀이가 보는 것 = the code's positions and headings). */
describe("a worry's page", () => {
  it("is built ahead for the ten that need no premium while the catalog is on; the premium two are not [id]'s", async () => {
    expect(generateStaticParams()).toEqual(WORRIES.filter((w) => w.id !== "marry" && w.id !== "stay-or-go").map((worry) => ({ id: worry.id })));
    // A static segment wins over [id]; reached through [id] anyway, they are a 404 that asks no gate.
    for (const id of ["marry", "stay-or-go"]) {
      await expect(WorryPage(params(id))).rejects.toThrow("404");
      expect((await generateMetadata(params(id))).robots, id).toMatchObject({ index: false });
    }
    expect(gate.asked).toEqual([]);
  });

  it.each(WORRIES.map((worry) => [worry.id, worry] as const))("%s: name and line, price, what it reads, the start, then the questions", async (_id, worry: Worry) => {
    const { container } = await show(worry.id);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(worry.name);
    const line = screen.getByText(worry.line);
    const price = section("가격과 무료로 보는 부분");
    const looks = section("이 풀이가 보는 것");
    // 뽑기 전에 for tarot, 시작 전에 for saju and 궁합, which draw no card (code review 2026-11-26 A4).
    const reflect = section(reflectTitle(worry));
    const start = container.querySelector("a[class*=btn], button[class*=btn]")!;
    const order = [h1, line, price, looks, start, reflect];
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, worry.id).toBeTruthy();

    // The way it is read and its price, both the catalog's; a login is said apart from paying.
    const method = worryMethod(worry);
    expect(within(price).getByText(`${method.name} 전체 풀이 ${won(method.krw)}`)).toBeTruthy();
    expect(price.textContent).toMatch(/로그인하면/);

    // The first question shows; the other two are folded under it.
    const [first, ...more] = worry.reflect;
    expect(within(reflect).getByText(first)).toBeTruthy();
    const details = reflect.querySelector("details")!;
    expect(details.open).toBe(false);
    expect([...details.querySelectorAll("li")].map((li) => li.textContent)).toEqual(more);
    expect(within(reflect).getByText("풀이 내용이 아니라, 시작하기 전에 혼자 떠올려 보는 질문이에요.")).toBeTruthy();

    // Every line on it passes the voice list (집안일 is housework, not the family R8 protects).
    for (const node of container.querySelectorAll("h1, h2, p, li, a, button")) assertVoice((node.textContent ?? "").replaceAll("집안일", ""));
  });

  it("shows a tarot worry's real question and the positions its cards are read in (켈틱 크로스 10장's ten for stay-or-go)", async () => {
    for (const worry of WORRIES.filter((w) => w.reading.kind === "tarot")) {
      await show(worry.id);
      const flow = presetFlow(worry);
      const summary = summarizeFlow(flow)!;
      const looks = section("이 풀이가 보는 것");
      expect(within(looks).getByText(summary.question), worry.id).toBeTruthy();
      const positions = TEMPLATES[flow.spread === "deep" ? "deep-tarot" : summary.template].positions;
      expect([...looks.querySelectorAll("ol li")].map((li) => li.textContent), worry.id).toEqual(positions);
      cleanup();
    }
  });

  it("shows a saju worry's real section headings and 궁합's real parts", async () => {
    for (const [id, topic] of [["solo", "love"], ["money-leak", "money"], ["job", "career"]] as const) {
      await show(id);
      // Each real heading, under its question where it has one (lib/sajuTopics.ts sectionHook).
      expect([...section("이 풀이가 보는 것").querySelectorAll("ol li")].map((li) => li.textContent), id).toEqual(TOPIC_SECTIONS[topic].map((heading) => `${sectionHook(heading) ?? ""}${heading}`));
      expect(section("이 풀이가 보는 것").querySelectorAll("ol li strong")).toHaveLength(5);
      cleanup();
    }
    await show("marry");
    expect([...section("이 풀이가 보는 것").querySelectorAll("ol li")].map((li) => li.textContent)).toEqual(PREMIUM.match.parts);
  });

  it("says inside 이 풀이가 보는 것 what job and moved-on read, then what they do not (§12.1)", async () => {
    for (const id of ["job", "moved-on"]) {
      await show(id);
      expect(within(section("이 풀이가 보는 것")).getByText(findWorry(id)!.scope!)).toBeTruthy();
      cleanup();
    }
  });

  it("links the existing sample only for the premium ones (no sample page exists for 타로 3장 or 사주)", async () => {
    const { container } = await show("marry");
    expect(screen.getByRole("link", { name: /샘플 전체 보기/ }).getAttribute("href")).toBe("/premium/match/sample");
    cleanup();
    await show("stay-or-go");
    expect(screen.getByRole("link", { name: /샘플 전체 보기/ }).getAttribute("href")).toBe("/premium/deep-tarot/sample");
    cleanup();
    await show("some");
    expect(screen.queryByRole("link", { name: /샘플/ })).toBeNull();
    expect(container).toBeTruthy();
  });

  it("names its title and description after the worry, with the price from the catalog", async () => {
    const meta = await generateMetadata(params("solo"));
    expect(meta.title).toBe("연애는 하고 싶은데");
    expect(meta.description).toBe(`'연애는 하고 싶은데' 고민을 사주 연애운 풀이로 봐요. 전체 풀이 ${won(SITE.price.sajuStandardKrw)}, 명식은 로그인 없이, 풀이 앞부분은 로그인하면 무료로 읽을 수 있어요.`);
    expect(meta.alternates?.canonical).toBe("/w/solo");
  });

  it("is a 404 for any other id", async () => {
    await expect(WorryPage(params("nope"))).rejects.toThrow("404");
    expect((await generateMetadata(params("nope"))).robots).toMatchObject({ index: false });
  });

  it("sends home while SITE.features.worries is off (§8)", async () => {
    const features = SITE.features as { worries: boolean };
    features.worries = false;
    try {
      await expect(WorryPage(params("some"))).rejects.toThrow("NEXT_REDIRECT;/");
      expect(generateStaticParams()).toEqual([]);
      await expect(MarryWorryPage()).rejects.toThrow("NEXT_REDIRECT;/");
      await expect(StayOrGoWorryPage()).rejects.toThrow("NEXT_REDIRECT;/");
      expect((await marryMetadata()).robots).toMatchObject({ index: false });
    } finally {
      features.worries = true;
    }
  });
});

describe("the start (§5.2, §12.2)", () => {
  it("writes a new question with the worry's values and opens the situation step, the cards of an earlier one gone", async () => {
    saveFlow({ who: "me", topicId: "money", when: "week", conditions: {}, note: "앞 질문", draw: { templateId: "self-flow", drawToken: "t", cards: [{ position: "지금의 나", cardId: "major-00", orientation: "upright" }] }, keep: { cardId: "major-00", orientation: "upright" } });
    await show("coworker");
    fireEvent.click(screen.getByRole("button", { name: /상황 고르기/ }));
    const kept = JSON.parse(sessionStorage.getItem(FLOW_KEY)!) as Record<string, unknown>;
    expect(kept).toMatchObject({ who: "us", topicId: "conflict", when: "month", conditions: { relation: "직장 동료" }, note: "" });
    expect(kept.draw).toBeUndefined();
    expect(kept.keep).toBeUndefined();
    expect(router.push).toHaveBeenCalledWith("/tarot/new/situation");
  });

  it("goes straight to the draw for a typed 무엇 (no situation chips)", async () => {
    await show("moved-on");
    fireEvent.click(screen.getByRole("button", { name: /카드 뽑기/ }));
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY)!)).toMatchObject({ who: "me", topicText: "전 애인 소식에 흔들리는 내 마음, 어떻게 추스를까" });
    expect(router.push).toHaveBeenCalledWith("/tarot/draw");
  });

  it("opens the birth input on a saju worry's topic", async () => {
    await show("money-leak");
    expect(screen.getByRole("link", { name: /생년월일 넣기/ }).getAttribute("href")).toBe("/saju/new?topic=money");
  });

  it("starts a premium worry where its product is open here, keeping the ten-card spread, with no status read in the browser", async () => {
    await show("stay-or-go");
    const start = screen.getByRole("button", { name: /상황 고르기/ }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY)!)).toMatchObject({ who: "me", topicId: "career", spread: "deep" });
    cleanup();
    await show("marry");
    expect(screen.getByRole("link", { name: /두 사람 생년월일 넣기/ }).getAttribute("href")).toBe("/premium/match/new");
    expect(gate.asked).toEqual(["tarot-deep", "match"]);
    // The browser's status request fails here (beforeEach: 503, read as null), and the start does not wait on it.
    expect(screen.getByRole("link", { name: /두 사람 생년월일 넣기/ }).getAttribute("aria-disabled")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("says 준비 중이에요 where the product is visible but not on sale", async () => {
    Object.assign(gate, { visible: true, open: false });
    await show("marry");
    expect(screen.getByRole("link", { name: /준비 중이에요/ }).getAttribute("aria-disabled")).toBe("true");
    cleanup();
    await show("stay-or-go");
    expect((screen.getByRole("button", { name: /준비 중이에요/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  // Code review 2026-11-26 A1: prerendered, these served the product, its price and contents with 200 before the browser
  // bounced home. Now nothing of them leaves the server where premium is hidden.
  it("is a 404 with noindex where the product is not visible here and nothing of it was bought", async () => {
    Object.assign(gate, { visible: false, held: false });
    for (const [id, open, meta] of [["marry", MarryWorryPage, marryMetadata], ["stay-or-go", StayOrGoWorryPage, stayOrGoMetadata]] as const) {
      await expect(open(), id).rejects.toThrow("404");
      expect((await meta()).robots, id).toMatchObject({ index: false });
    }
  });

  it("shows and starts for someone holding a purchase of it while premium is hidden here (the deepAllowed rule), never sent away", async () => {
    Object.assign(gate, { visible: false, held: true });
    await show("stay-or-go");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("오늘도 퇴사 생각");
    expect((screen.getByRole("button", { name: /상황 고르기/ }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    await show("marry");
    expect(screen.getByRole("link", { name: /두 사람 생년월일 넣기/ }).getAttribute("aria-disabled")).toBeNull();
    expect((await marryMetadata()).title).toBe("결혼 얘기 중인 우리");
    expect(router.replace).not.toHaveBeenCalled();
  });
});
