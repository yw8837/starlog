// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountState } from "@/lib/account/client";
import { premiumOffer } from "@/lib/premium/offer";
import { PremiumUnlock } from "./PremiumUnlock";

/** A set paid with Google Play in the Starlog app, its other reading opened (review L21): its part is refunded through 문의. */

afterEach(cleanup);

const OPEN = { open: true, opensAt: null };
const account: AccountState = {
  payments: true,
  login: true,
  owner: false,
  user: { nickname: "별", gift: null, opening: [], unused: [{ orderId: "o-set", productId: "newyear-2027", refundable: false, noRefund: "play-part", set: true, provider: "play" }] },
};

describe("PremiumUnlock: a Play set's part", () => {
  it("is offered by premiumOffer as not refundable, saying why", () => {
    expect(premiumOffer(account, "newyear-2027", OPEN)).toEqual({ mode: "open-paid", refundable: false, noRefund: "play-part", set: true });
  });

  it("says the part is refunded on request, links the contact page, and offers no 환불받기", () => {
    render(<PremiumUnlock id="newyear-2027" account={account} status={OPEN} returnTo="/x" onOpen={vi.fn()} error={{ title: "실패", action: "retry" }} refundHref="/me#purchases" />);
    expect(screen.getByText("앱에서 결제한 세트는 하나를 열면 남은 풀이를 문의로 환불해 드려요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "문의하기" }).getAttribute("href")).toBe("/contact");
    expect(screen.queryByRole("link", { name: "환불받기" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/몫만 환불받을 수 있어요|하나를 열었으면 열지 않은 풀이 몫/);
  });

  it("a Play set with neither reading opened: the same line as 내 정보, not the web set's part amounts (owner 2026-11-13)", () => {
    const both: AccountState = {
      ...account,
      user: {
        ...account.user!,
        unused: [
          { orderId: "o-set", productId: "newyear-2027", refundUntil: "2099-12-08T14:59:59.999Z", refundAmount: 18900, set: true, provider: "play" },
          { orderId: "o-set", productId: "match", refundUntil: "2099-12-08T14:59:59.999Z", refundAmount: 18900, set: true, provider: "play" },
        ],
      },
    };
    render(<PremiumUnlock id="newyear-2027" account={both} status={OPEN} returnTo="/x" onOpen={vi.fn()} />);
    expect(screen.getByText("세트로 산 풀이예요. 둘 다 열지 않았으면 전액 환불되고, 하나를 열면 남은 풀이 몫은 문의로 환불해 드려요.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/몫 [\d,]+원만 환불받을 수 있어요|하나를 열었으면 열지 않은 풀이 몫/);
  });
});
