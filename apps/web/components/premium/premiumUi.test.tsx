// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountState } from "@/lib/account/client";
import { premiumOffer } from "@/lib/premium/offer";
import { resetPremiumStatusForTests, usePremiumStatus } from "@/lib/premium/status";
import { DeepTarotArticle } from "./DeepTarotArticle";
import { MatchArticle } from "./MatchArticle";
import { NewYearArticle } from "./NewYearArticle";
import { PremiumProgress } from "./PremiumProgress";
import { PremiumUnlock } from "./PremiumUnlock";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
});

type Unused = { orderId: string; productId: string; refundable?: false };
const user = (unused: Unused[] = [], opening: Array<{ productId: string; currency: "paid" }> = []) =>
  ({ nickname: "별", gift: null, unused, opening: opening.map((o) => ({ ...o, orderId: null })) }) as unknown as NonNullable<AccountState["user"]>;
const account = (over: Partial<AccountState> = {}): AccountState => ({ payments: true, login: true, owner: false, user: null, ...over });
const OPEN = { open: true, opensAt: null };
const NOV15 = Date.parse("2026-11-15T00:00:00+09:00");
const OCT = Date.parse("2026-10-20T12:00:00+09:00");
/** Gold primaries and the rest, in order (the Button's module class names say which). */
const actions = (root: HTMLElement) =>
  [...root.querySelectorAll("a, button")].map((el) => [el.textContent, /primary/.test(el.className) ? "primary" : /secondary/.test(el.className) ? "secondary" : /ghost/.test(el.className) ? "ghost" : "link"]);

describe("premiumOffer", () => {
  it("follows P4: a reading being opened, then a held purchase (sales closed or not), then login or pay, then the sales state", () => {
    expect(premiumOffer(account({ user: user([], [{ productId: "match", currency: "paid" }]) }), "match", OPEN, OCT)).toEqual({ mode: "in-progress" });
    expect(premiumOffer(account({ user: user([{ orderId: "o", productId: "match" }]) }), "match", { open: false, opensAt: null }, OCT)).toEqual({ mode: "open-paid" });
    expect(premiumOffer(account({ user: user([{ orderId: "o", productId: "match", refundable: false }]) }), "match", OPEN, OCT)).toEqual({ mode: "open-paid", refundable: false });
    expect(premiumOffer(account(), "match", OPEN, OCT)).toEqual({ mode: "login", priceKrw: 7900 });
    expect(premiumOffer(account({ user: user() }), "tarot-deep", OPEN, OCT)).toEqual({ mode: "pay", priceKrw: 7900 });
    expect(premiumOffer(account(), "newyear-2027", { open: false, opensAt: NOV15 }, OCT)).toEqual({ mode: "soon", opensAt: NOV15 });
    expect(premiumOffer(account(), "newyear-2027", { open: false, opensAt: NOV15 }, NOV15 + 1)).toEqual({ mode: "closed" });
    expect(premiumOffer(account(), "match", undefined, OCT)).toEqual({ mode: "loading" });
    expect(premiumOffer(undefined, "match", OPEN, OCT)).toEqual({ mode: "loading" });
  });

  it("says the sales state could not be read (null) instead of loading forever; a held purchase still opens", () => {
    expect(premiumOffer(account(), "match", null, OCT)).toEqual({ mode: "unknown" });
    expect(premiumOffer(account({ user: user([{ orderId: "o", productId: "match" }]) }), "match", null, OCT)).toEqual({ mode: "open-paid" });
  });
});

describe("premium status when it cannot be read", () => {
  /** The panel as a preview screen wires it: the status hook's value for this product. */
  function Panel() {
    const status = usePremiumStatus();
    return <PremiumUnlock id="match" account={account({ user: user() })} status={status === null ? null : status?.match} returnTo="/x" onOpen={vi.fn()} />;
  }

  it("offers 다시 확인하기 after a failed status call, asks again, and then sells", async () => {
    const answers = [
      () => Promise.reject(new TypeError("offline")),
      () => Promise.resolve(Response.json({ products: [{ id: "match", open: true, visible: true, opensAt: null }] })),
    ];
    const fetchMock = vi.fn(() => answers.shift()!());
    vi.stubGlobal("fetch", fetchMock);
    render(<Panel />);
    expect(await screen.findByText("지금 열 수 있는지 확인하지 못했어요")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));
    expect(await screen.findByRole("link", { name: "7,900원 결제하고 보기" })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

describe("PremiumUnlock", () => {
  it("asks a guest to log in first, with the price and what one purchase holds, one gold button", () => {
    const { container } = render(<PremiumUnlock id="match" account={account()} status={OPEN} returnTo="/premium/match/preview" onOpen={vi.fn()} />);
    expect(screen.getByRole("link", { name: "로그인하고 결제하기" }).getAttribute("href")).toBe("/login?next=%2Fpremium%2Fmatch%2Fpreview");
    expect(screen.getByText("7,900원")).toBeTruthy();
    expect(screen.getByText("사주 궁합과 카드 5장 풀이 전체 · 약 5,000자")).toBeTruthy();
    expect(screen.getByText("이어서 물어보기 5번")).toBeTruthy();
    expect(actions(container).filter(([, v]) => v === "primary")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "결제와 환불 안내" }).getAttribute("href")).toBe("/refund");
  });

  it("sends a logged-in user to checkout for this product and back to the preview", () => {
    render(<PremiumUnlock id="tarot-deep" account={account({ user: user() })} status={OPEN} returnTo="/premium/deep-tarot/result" onOpen={vi.fn()} />);
    expect(screen.getByRole("link", { name: "7,900원 결제하고 보기" }).getAttribute("href")).toBe("/pay/checkout?product=tarot-deep&returnTo=%2Fpremium%2Fdeep-tarot%2Fresult");
  });

  it("opens a purchase already made even while sales are closed, and says 이어서 받기 when parts are written", () => {
    const onOpen = vi.fn();
    const held = account({ user: user([{ orderId: "o", productId: "newyear-2027" }]) });
    const { rerender } = render(<PremiumUnlock id="newyear-2027" account={held} status={{ open: false, opensAt: null }} returnTo="/x" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "결제한 풀이 열기" }));
    expect(onOpen).toHaveBeenCalledWith("paid");
    rerender(<PremiumUnlock id="newyear-2027" account={held} status={{ open: false, opensAt: null }} returnTo="/x" onOpen={onOpen} resumable />);
    expect(screen.getByRole("button", { name: "이어서 받기" })).toBeTruthy();
  });

  it("says a purchase cut off while written can open again but not be refunded, and hides 환불받기 for it", () => {
    render(
      <PremiumUnlock id="match" account={account({ user: user([{ orderId: "o", productId: "match", refundable: false }]) })} status={OPEN} returnTo="/x" onOpen={vi.fn()}
        error={{ title: "풀이를 다 적지 못했어요", action: "retry" }} refundHref="/me#purchases" />,
    );
    expect(screen.getByText(/환불은 할 수 없어요/)).toBeTruthy();
    expect(screen.getByText("풀이를 다 적지 못했어요")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "환불받기" })).toBeNull();
  });

  it("offers 환불받기 after a failed opening of a refundable purchase", () => {
    render(<PremiumUnlock id="match" account={account({ user: user([{ orderId: "o", productId: "match" }]) })} status={OPEN} returnTo="/x" onOpen={vi.fn()} error={{ title: "실패", action: "retry" }} refundHref="/me#purchases" />);
    expect(screen.getByRole("link", { name: "환불받기" }).getAttribute("href")).toBe("/me#purchases");
  });

  it("waits while another opening holds the purchase, with nothing to buy or open", () => {
    const { container } = render(<PremiumUnlock id="match" account={account({ owner: true, user: user([], [{ productId: "match", currency: "paid" }]) })} status={OPEN} returnTo="/x" onOpen={vi.fn()} onCheck={vi.fn()} />);
    expect(screen.getByText("열고 있는 풀이가 있어요")).toBeTruthy();
    expect(actions(container).map(([t]) => t)).toEqual(["다시 확인하기", "결제와 환불 안내"]);
  });

  it("says when a closed product opens, with no buy button, and offers the owner a quiet free open", () => {
    const onOpen = vi.fn();
    const { container } = render(<PremiumUnlock id="newyear-2027" account={account({ owner: true })} status={{ open: false, opensAt: NOV15 }} now={OCT} returnTo="/x" onOpen={onOpen} />);
    expect(screen.getByText("11월 15일 0시에 열려요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "운영자로 무료 열기" }));
    expect(onOpen).toHaveBeenCalledWith("owner");
    expect(actions(container).filter(([, v]) => v === "primary")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/베타|오픈 기념/);
  });

  it("goes to the saved reading instead when this one was opened already", () => {
    render(<PremiumUnlock id="tarot-deep" account={account({ user: user() })} status={OPEN} returnTo="/x" onOpen={vi.fn()} openedHref="/chapter/abc" />);
    expect(screen.getByRole("link", { name: /열어 둔 풀이 보기/ }).getAttribute("href")).toBe("/chapter/abc");
    expect(screen.queryByRole("link", { name: /결제하고 보기/ })).toBeNull();
  });
});

describe("PremiumProgress", () => {
  it("names the part on the waiting card and in the caption, the whole reading's usual wait, and the 3-times rule", () => {
    render(<PremiumProgress id="newyear-2027" part={1} state={{ caption: "4월을 적고 있어요", fraction: 0.5, reached: 3 }} />);
    expect(screen.getByRole("status").textContent).toBe("2/3 · 4월을 적고 있어요");
    const card = screen.getByRole("group", { name: /번째/ });
    expect(within(card).getByText("1월~6월")).toBeTruthy();
    expect(within(card).getByText("2 / 3")).toBeTruthy();
    expect(screen.getByText(/보통 4분 안팎/)).toBeTruthy();
    expect(screen.getByText("다 받기 전에 화면을 닫거나 연결이 끊겨도 3번까지 다시 열어 받을 수 있어요.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/처음부터 다시 써요/);
  });
});

const section = (heading: string) => ({ heading, body: `${heading} 본문이에요.` });

describe("the three reading layouts", () => {
  it("lays out the year, the four areas and twelve months in order", () => {
    render(<NewYearArticle reading={{
      title: "차근차근 쌓아 가는 해", overview: section("2027 정미년과 나의 명식"), luck: section("지금의 10년 속 2027년"),
      areas: { heading: "영역별로 보면", work: section("일"), money: section("돈"), relations: section("관계"), health: section("몸과 생활 리듬") },
      lucky: section("2027년을 가볍게 돕는 것"),
      months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, heading: `${i + 1}월 · 월`, body: `${i + 1}월 본문이에요.` })),
      closing: section("한 해를 보내는 방법"), observation: section("첫 달에 확인해 볼 신호"), followUps: [],
    }} />);
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings[0]).toBe("2027 정미년과 나의 명식");
    expect(headings.filter((h) => /^\d+월 · /.test(h ?? ""))).toHaveLength(12);
    expect(headings.indexOf("1월 · 월")).toBeLessThan(headings.indexOf("12월 · 월"));
    expect(headings.slice(-2)).toEqual(["한 해를 보내는 방법", "첫 달에 확인해 볼 신호"]);
  });

  it("shows the 10-card layout, then each position with its card, then the readings across positions", () => {
    const POS = ["지금의 나", "가로막는 것", "바탕", "지나온 것", "바라는 것", "다가올 것", "나의 태도", "주변", "바람과 걱정", "결과의 방향"];
    const cards = POS.map((position, i) => ({ position, cardId: `cups-0${(i % 9) + 1}`, orientation: "upright" as const }));
    render(<DeepTarotArticle cards={cards} reading={{
      verdict: "천천히 가도 괜찮아요", positions: cards.map((c) => ({ position: c.position, cardId: c.cardId, heading: `${c.position} 카드`, body: "본문이에요." })),
      crossing: section("지금과 가로막는 것"), axes: { heading: "두 갈래", vertical: section("세로"), horizontal: section("가로") },
      staff: section("기둥"), timing: section("시기"), action: section("오늘 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
    }} />);
    expect(screen.getByText("천천히 가도 괜찮아요")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "카드 10장 배치" })).getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("10번 · 결과의 방향")).toBeTruthy();
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings.indexOf("결과의 방향 카드")).toBeLessThan(headings.indexOf("지금과 가로막는 것"));
    expect(headings).toEqual(expect.arrayContaining(["두 갈래", "세로", "가로", "기둥", "시기", "오늘 해 볼 일", "확인해 볼 신호"]));
  });

  it("keeps the 궁합's saju and card sources visibly apart, then sets them side by side", () => {
    const cards = ["나의 마음", "그 사람 쪽 흐름", "두 사람 사이", "엇갈리는 지점", "함께 가꿀 방향"].map((position, i) => ({ position, cardId: `wands-0${i + 1}`, orientation: "upright" as const }));
    render(<MatchArticle cards={cards} reading={{
      verdict: "속도를 맞춰 가요", saju: { dayMasters: section("두 사람의 일간"), elements: section("오행"), pillars: section("기둥 사이"), luck: section("두 사람의 10년") },
      cards: cards.map((c) => ({ ...c, heading: `${c.position} 카드`, body: "본문이에요." })),
      connection: section("다섯 장의 연결"), bridge: section("사주와 카드를 나란히"), action: section("이번 주 해 볼 일"), observation: section("확인해 볼 신호"), followUps: [],
    }} />);
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2.slice(0, 2)).toEqual(["사주로 본 두 사람", "카드로 본 지금"]);
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings.indexOf("두 사람의 10년")).toBeLessThan(headings.indexOf("카드로 본 지금"));
    expect(headings.indexOf("함께 가꿀 방향 카드")).toBeLessThan(headings.indexOf("사주와 카드를 나란히"));
  });
});
