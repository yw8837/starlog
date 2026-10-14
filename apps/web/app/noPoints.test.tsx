// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import FaqPage, { metadata as faqMeta } from "@/app/faq/page";
import HelpPage, { metadata as helpMeta } from "@/app/help/page";
import { LoginPanel } from "@/app/login/LoginPanel";
import { MeView } from "@/app/me/MeView";
import PricingPage, { metadata as pricingMeta } from "@/app/pricing/page";
import PrivacyPage, { metadata as privacyMeta } from "@/app/privacy/page";
import RefundPage, { metadata as refundMeta } from "@/app/refund/page";
import TermsPage, { metadata as termsMeta } from "@/app/terms/page";
import glossary from "@content/i18n/glossary.json";
import { UnlockSheet } from "@/components/tarot/UnlockSheet";
import { resetAccountForTests } from "@/lib/account/client";
import { errorPayload, type ErrorCode } from "@/lib/api/http";
import { LOCALES } from "@/lib/i18n/locales";
import { MESSAGES } from "@/lib/i18n/messages";
import { llmsFullTxt, llmsTxt } from "@/lib/llms";
import type { UnlockOffer } from "@/lib/pay/offer";
import type { ApiErrorCode } from "@/lib/reading/api";
import { CREDIT_CHECKING, creditKept, creditUnknown, describeApiError, type ErrorContext } from "@/lib/reading/errors";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

/**
 * No points, credits, balances or top-ups anywhere a user can read (owner 2026-10-08; Toss reviews
 * per-reading payments only). Guide article bodies are left out: the Moon card's 달빛 is a meaning.
 * So is 달빛 수호 문양, the name of one of the four card backs in 내 정보 → 카드 디자인.
 */
const POINTS = /별조각|달빛(?! 수호 문양)|충전|포인트|크레딧|잔액/;
/** The same words in the screens' other languages. */
const POINTS_INTL = /stardust|moonlight|\bpoints?\b|\bcredits?\b|\bbalance\b|ポイント|残高|クレジット|點數|餘額|儲值/i;

const textOf = (node: ReactElement) => render(node).container.textContent ?? "";
const metaText = (meta: Metadata) => `${String(meta.title ?? "")} ${meta.description ?? ""}`;

// jsdom has no <dialog> methods; Modal calls showModal()/close().
beforeAll(() => {
  const proto = (window.HTMLDialogElement ?? window.HTMLElement).prototype as HTMLElement & { showModal?: () => void; close?: () => void };
  proto.showModal ??= function (this: HTMLElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetAccountForTests();
});

/** /api/me answers `me`; 결제 내역 has one paid order; anything else is empty. */
function account(me: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/me") return Response.json(me);
    if (url === "/api/pay/orders") {
      return Response.json({ orders: [{ orderId: "o1", productId: "tarot", amount: 2900, status: "paid", createdAt: Date.parse("2026-10-08T03:00:00Z"), receiptUrl: null, method: "카드", refundable: true, opened: false }] });
    }
    return Response.json({});
  }));
}

describe("no points, credits or balances anywhere a user can read", () => {
  it("in the terms, refund policy, privacy policy, pricing, FAQ and help, and their titles and descriptions", () => {
    const pages: Array<[string, ReactElement, Metadata]> = [
      ["terms", <TermsPage key="t" />, termsMeta],
      ["refund", <RefundPage key="r" />, refundMeta],
      ["privacy", <PrivacyPage key="p" />, privacyMeta],
      ["pricing", <PricingPage key="pr" />, pricingMeta],
      ["faq", <FaqPage key="f" />, faqMeta],
      ["help", <HelpPage key="h" />, helpMeta],
    ];
    for (const [name, page, meta] of pages) {
      expect(textOf(page), name).not.toMatch(POINTS);
      expect(metaText(meta), name).not.toMatch(POINTS);
      cleanup();
    }
  });

  it("on the login page", () => {
    expect(textOf(<LoginPanel next="/" status={null} navigate={() => {}} />)).not.toMatch(POINTS);
  });

  it("on every unlock sheet, tarot and saju, in every mode", () => {
    const offers = {
      opening: [{ mode: "opening", login: false }, { mode: "opening", login: true }],
      closed: [{ mode: "closed", login: false }, { mode: "closed", login: true }],
      login: [{ mode: "login", priceKrw: 2900, gift: true }, { mode: "login", priceKrw: 4900, gift: false }],
      "in-progress": [{ mode: "in-progress", currency: "paid" }, { mode: "in-progress", currency: "gift" }],
      "open-paid": [{ mode: "open-paid", orderId: "o1" }],
      gift: [{ mode: "gift", until: "2026-12-30T14:59:59.999Z", priceKrw: 2900 }, { mode: "gift", until: null, priceKrw: 2900 }],
      pay: [{ mode: "pay", priceKrw: 2900 }],
    } satisfies { [M in UnlockOffer["mode"]]: Array<Extract<UnlockOffer, { mode: M }>> };
    for (const kind of ["tarot", "saju"] as const) {
      for (const offer of Object.values(offers).flat()) {
        for (const extra of [{ remaining: 1 }, { remaining: 0, owner: true, error: creditKept("gift"), refundHref: "/me#purchases" }, { remaining: undefined, checking: true, error: CREDIT_CHECKING, onCheck: () => {} }]) {
          const text = textOf(<UnlockSheet kind={kind} offer={offer} onUnlock={() => {}} loginHref="/login" payHref="/pay/checkout" {...extra} />);
          expect(text, `${kind} ${JSON.stringify(offer)}`).not.toMatch(POINTS);
          cleanup();
        }
      }
    }
  });

  it("in 내 정보, logged out (sales open or not) and logged in with the gift unused, used or gone, its dialogs included", async () => {
    const guestOpen = { payments: true, login: true, owner: false, user: null };
    account(guestOpen);
    render(<MeView status={null} />);
    await screen.findByRole("link", { name: "로그인하기" });
    expect(document.body.textContent).not.toMatch(POINTS);
    cleanup();
    resetAccountForTests();

    account({ payments: false, login: false, owner: false, user: null });
    render(<MeView status={null} />);
    await screen.findByText("처음 한 번은 타로 전체 풀이를 무료로 열 수 있어요");
    expect(document.body.textContent).not.toMatch(POINTS);
    cleanup();
    resetAccountForTests();

    for (const gift of [{ status: "unused", until: "2026-12-30T14:59:59.999Z" }, { status: "used" }, null]) {
      // No refundUntil: 환불받기 shows whatever today's date is.
      account({ ...guestOpen, user: { nickname: "별빛", gift, unused: [{ orderId: "o1", productId: "tarot" }], opening: [] } });
      render(<MeView status={null} />);
      await screen.findByRole("heading", { name: "별빛" });
      await screen.findByRole("heading", { name: "결제 내역" });
      fireEvent.click(screen.getByRole("button", { name: "환불받기" }));
      fireEvent.click(screen.getByRole("button", { name: "회원 탈퇴" }));
      fireEvent.click(screen.getByRole("button", { name: "계정에 보관한 풀이 모두 지우기" }));
      expect(document.body.textContent, JSON.stringify(gift)).not.toMatch(POINTS);
      cleanup();
      resetAccountForTests();
    }
  });

  it("in every error a reading, a payment or a refund can show, and every server message", () => {
    const server = {
      BAD_REQUEST: 1, BAD_TOKEN: 1, BETA_LIMIT: 1, RATE_LIMIT: 1, AI_UNAVAILABLE: 1, REFUSED: 1, QUALITY: 1, UPSTREAM: 1, LOGIN_REQUIRED: 1, PAYMENT_REQUIRED: 1,
      NO_CREDIT: 1, PAY_FAILED: 1, FORBIDDEN: 1, NOT_AVAILABLE: 1, PAY_PENDING: 1, NOT_REFUNDABLE: 1, REFUND_WINDOW_CLOSED: 1, PAY_UNAVAILABLE: 1,
    } satisfies Record<ErrorCode, 1>;
    const client = { ...server, NETWORK: 1, TIMEOUT: 1, INVALID: 1 } satisfies Record<ApiErrorCode, 1>;
    const contexts = { reading: 1, teaser: 1, "tarot-draw": 1, followup: 1, daily: 1, paid: 1, gift: 1 } satisfies Record<ErrorContext, 1>;
    for (const code of Object.keys(server) as ErrorCode[]) expect(String(errorPayload(code).body.message), code).not.toMatch(POINTS);
    for (const code of Object.keys(client) as ApiErrorCode[]) {
      for (const context of Object.keys(contexts) as ErrorContext[]) {
        for (const scope of [undefined, "network", "chapter"] as const) {
          const view = describeApiError({ code, status: 400, ...(scope ? { scope } : {}) }, context);
          expect(`${view.title} ${view.body ?? ""}`, `${code} ${context}`).not.toMatch(POINTS);
        }
      }
    }
    for (const context of ["paid", "gift"] as const) {
      for (const view of [creditKept(context), creditUnknown(context)]) expect(`${view.title} ${view.body ?? ""}`).not.toMatch(POINTS);
    }
  });

  it("in llms.txt, and in llms-full.txt outside the guide article bodies", () => {
    expect(llmsTxt()).not.toMatch(POINTS);
    const full = llmsFullTxt();
    const guides = full.indexOf("\n## 가이드 글\n");
    const faq = full.indexOf("\n## 자주 묻는 질문\n");
    expect(guides).toBeGreaterThan(0);
    expect(faq).toBeGreaterThan(guides);
    expect(full.slice(0, guides)).not.toMatch(POINTS);
    expect(full.slice(faq)).not.toMatch(POINTS);
  });

  it("in the screens' message catalog, which keeps no currency names in any language", () => {
    expect(JSON.stringify(MESSAGES.ko)).not.toMatch(POINTS);
    for (const locale of LOCALES) {
      expect(MESSAGES[locale].common, locale).not.toHaveProperty("currency");
      expect(JSON.stringify(MESSAGES[locale]), locale).not.toMatch(POINTS);
      expect(JSON.stringify(MESSAGES[locale]), locale).not.toMatch(POINTS_INTL);
    }
  });

  it("in the translators' glossary, so no language brings the old currency names back", () => {
    const terms = JSON.stringify(glossary);
    expect(terms).not.toMatch(POINTS);
    expect(terms).not.toMatch(POINTS_INTL);
    expect(glossary.terms).not.toHaveProperty("moonlight");
    expect(glossary.terms).not.toHaveProperty("stardust");
  });
});
