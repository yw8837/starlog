import { describe, expect, it } from "vitest";
import type { AccountState, AccountUser } from "@/lib/account/client";
import { standardProduct } from "./catalog";
import { checkoutHref, unlockOffer } from "./offer";

const tarot = standardProduct("tarot");
const account = (over: Partial<AccountState> = {}): AccountState => ({ payments: true, login: true, owner: false, user: null, ...over });
const user = (over: Partial<AccountUser> = {}): AccountUser => ({ nickname: "별", stardust: 0, stardustExpiresAt: null, unused: [], opening: [], ...over });

describe("unlock offer", () => {
  it("keeps the 오픈 기념 reading while sales are closed for this device and nothing is held", () => {
    expect(unlockOffer(undefined, tarot, 10)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(null, tarot, 10)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(account({ payments: false, login: false }), tarot, 10)).toEqual({ mode: "opening", login: false });
  });

  it("while sales are paused, offers buyers a quiet way to log in", () => {
    expect(unlockOffer(account({ payments: false, login: true }), tarot, 10)).toEqual({ mode: "opening", login: true });
  });

  it("asks a guest to log in once sales are open", () => {
    expect(unlockOffer(account(), tarot, 10)).toEqual({ mode: "login", priceKrw: 2900, giftUnits: 10 });
  });

  it("opens a purchase first, then 별조각, then asks to pay", () => {
    expect(unlockOffer(account({ user: user({ stardust: 10, unused: [{ orderId: "o1", productId: "tarot" }] }) }), tarot, 10)).toEqual({ mode: "open-paid", orderId: "o1" });
    expect(unlockOffer(account({ user: user({ stardust: 10 }) }), tarot, 10)).toEqual({ mode: "stardust", units: 10, balance: 10, priceKrw: 2900 });
    expect(unlockOffer(account({ user: user({ stardust: 9 }) }), tarot, 10)).toEqual({ mode: "pay", priceKrw: 2900 });
  });

  it("while a reading of this kind is being opened, offers nothing to buy or open", () => {
    const busy = user({ stardust: 10, unused: [{ orderId: "o2", productId: "tarot" }], opening: [{ productId: "tarot", currency: "paid", orderId: "o1" }] });
    expect(unlockOffer(account({ user: busy }), tarot, 10)).toEqual({ mode: "in-progress", currency: "paid" });
    expect(unlockOffer(account({ payments: false, user: user({ opening: [{ productId: "tarot", currency: "stardust", orderId: null }] }) }), tarot, 10)).toEqual({ mode: "in-progress", currency: "stardust" });
    expect(unlockOffer(account({ user: user({ stardust: 10, opening: [{ productId: "saju", currency: "stardust", orderId: null }] }) }), tarot, 10)).toMatchObject({ mode: "stardust" });
  });

  it("does not count a purchase of the other reading", () => {
    expect(unlockOffer(account({ user: user({ unused: [{ orderId: "o1", productId: "saju" }] }) }), tarot, 10)).toEqual({ mode: "pay", priceKrw: 2900 });
  });

  it("lets held credit open a reading after sales close", () => {
    expect(unlockOffer(account({ payments: false, user: user({ stardust: 10 }) }), tarot, 10)).toMatchObject({ mode: "stardust" });
    expect(unlockOffer(account({ payments: false, user: user() }), tarot, 10)).toEqual({ mode: "opening", login: false });
  });

  it("links the checkout with the product and the way back", () => {
    expect(checkoutHref("saju", "/saju/chart")).toBe("/pay/checkout?product=saju&returnTo=%2Fsaju%2Fchart");
  });
});
