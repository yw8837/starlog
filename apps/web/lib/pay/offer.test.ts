import { describe, expect, it } from "vitest";
import type { AccountState, AccountUser } from "@/lib/account/client";
import { standardProduct } from "./catalog";
import { checkoutHref, unlockOffer } from "./offer";

const tarot = standardProduct("tarot");
const saju = standardProduct("saju");
const UNTIL = "2026-12-30T14:59:59.999Z";
const GIFT = { status: "unused", until: UNTIL } as const;
const account = (over: Partial<AccountState> = {}): AccountState => ({ payments: true, login: true, owner: false, user: null, ...over });
const user = (over: Partial<AccountUser> = {}): AccountUser => ({ nickname: "별", gift: null, unused: [], opening: [], ...over });

describe("unlock offer", () => {
  it("keeps the 오픈 기념 reading while sales are closed for this device and nothing is held", () => {
    expect(unlockOffer(undefined, tarot)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(null, tarot)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(account({ payments: false, login: false }), tarot)).toEqual({ mode: "opening", login: false });
  });

  it("while sales are paused, offers buyers a quiet way to log in", () => {
    expect(unlockOffer(account({ payments: false, login: true }), tarot)).toEqual({ mode: "opening", login: true });
  });

  it("asks a guest to log in once sales are open, naming the gift for tarot only", () => {
    expect(unlockOffer(account(), tarot)).toEqual({ mode: "login", priceKrw: 2900, gift: true });
    expect(unlockOffer(account(), saju)).toEqual({ mode: "login", priceKrw: 4900, gift: false });
  });

  it("opens a purchase first, then the gift, then asks to pay", () => {
    expect(unlockOffer(account({ user: user({ gift: GIFT, unused: [{ orderId: "o1", productId: "tarot" }] }) }), tarot)).toEqual({ mode: "open-paid", orderId: "o1" });
    expect(unlockOffer(account({ user: user({ gift: GIFT }) }), tarot)).toEqual({ mode: "gift", until: UNTIL, priceKrw: 2900 });
    expect(unlockOffer(account({ user: user({ gift: { status: "used" } }) }), tarot)).toEqual({ mode: "pay", priceKrw: 2900 });
    expect(unlockOffer(account({ user: user() }), tarot)).toEqual({ mode: "pay", priceKrw: 2900 });
  });

  it("never offers the gift for saju: paying is the only way", () => {
    expect(unlockOffer(account({ user: user({ gift: GIFT }) }), saju)).toEqual({ mode: "pay", priceKrw: 4900 });
    expect(unlockOffer(account({ payments: false, user: user({ gift: GIFT }) }), saju)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(account({ user: user({ gift: GIFT, unused: [{ orderId: "o1", productId: "saju" }] }) }), saju)).toEqual({ mode: "open-paid", orderId: "o1" });
  });

  it("while a reading of this kind is being opened, offers nothing to buy or open", () => {
    const busy = user({ gift: GIFT, unused: [{ orderId: "o2", productId: "tarot" }], opening: [{ productId: "tarot", currency: "paid", orderId: "o1" }] });
    expect(unlockOffer(account({ user: busy }), tarot)).toEqual({ mode: "in-progress", currency: "paid" });
    expect(unlockOffer(account({ payments: false, user: user({ opening: [{ productId: "tarot", currency: "gift", orderId: null }] }) }), tarot)).toEqual({ mode: "in-progress", currency: "gift" });
    expect(unlockOffer(account({ user: user({ gift: GIFT, opening: [{ productId: "saju", currency: "paid", orderId: "o3" }] }) }), tarot)).toMatchObject({ mode: "gift" });
  });

  it("does not count a purchase of the other reading", () => {
    expect(unlockOffer(account({ user: user({ unused: [{ orderId: "o1", productId: "saju" }] }) }), tarot)).toEqual({ mode: "pay", priceKrw: 2900 });
  });

  it("lets what is held open a reading after sales close", () => {
    expect(unlockOffer(account({ payments: false, user: user({ gift: GIFT }) }), tarot)).toMatchObject({ mode: "gift" });
    expect(unlockOffer(account({ payments: false, user: user() }), tarot)).toEqual({ mode: "opening", login: false });
  });

  it("links the checkout with the product and the way back", () => {
    expect(checkoutHref("saju", "/saju/chart")).toBe("/pay/checkout?product=saju&returnTo=%2Fsaju%2Fchart");
  });
});
