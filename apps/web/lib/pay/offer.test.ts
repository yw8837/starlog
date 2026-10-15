import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountState, AccountUser } from "@/lib/account/client";
import { standardProduct } from "./catalog";
import { checkoutHref, unlockOffer } from "./offer";

const tarot = standardProduct("tarot");
const saju = standardProduct("saju");
const UNTIL = "2026-12-30T14:59:59.999Z";
const GIFT = { status: "unused", until: UNTIL } as const;
const account = (over: Partial<AccountState> = {}): AccountState => ({ payments: true, login: true, owner: false, user: null, ...over });
const user = (over: Partial<AccountUser> = {}): AccountUser => ({ nickname: "별", gift: null, unused: [], opening: [], ...over });

/** 오픈 기념 무료 runs through 2026-10-31 23:59:59 KST; these offers are read on 10월 14일 unless a test says otherwise. */
const LAST_FREE = Date.parse("2026-10-31T14:59:59Z");
const NOVEMBER = Date.parse("2026-10-31T15:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-10-14T03:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("unlock offer", () => {
  it("keeps 오픈 기념 무료 for tarot while sales are closed for this device and nothing is held", () => {
    expect(unlockOffer(undefined, tarot)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(null, tarot)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(account({ payments: false, login: false }), tarot)).toEqual({ mode: "opening", login: false });
  });

  it("offers no free saju reading while sales are closed for this device: nothing to open or pay here", () => {
    expect(unlockOffer(undefined, saju)).toEqual({ mode: "closed", login: false });
    expect(unlockOffer(null, saju)).toEqual({ mode: "closed", login: false });
    expect(unlockOffer(account({ payments: false, login: false }), saju)).toEqual({ mode: "closed", login: false });
    expect(unlockOffer(account({ payments: false, user: user() }), saju)).toEqual({ mode: "closed", login: false });
  });

  it("while sales are paused, offers buyers a quiet way to log in", () => {
    expect(unlockOffer(account({ payments: false, login: true }), tarot)).toEqual({ mode: "opening", login: true });
    expect(unlockOffer(account({ payments: false, login: true }), saju)).toEqual({ mode: "closed", login: true });
  });

  it("asks a guest to log in once sales are open, promising no signup gift (removed, owner 2026-10-14 evening)", () => {
    expect(unlockOffer(account(), tarot)).toEqual({ mode: "login", priceKrw: 2900 });
    expect(unlockOffer(account(), saju)).toEqual({ mode: "login", priceKrw: 4900 });
  });

  it("opens a purchase first, then the gift, then asks to pay", () => {
    expect(unlockOffer(account({ user: user({ gift: GIFT, unused: [{ orderId: "o1", productId: "tarot" }] }) }), tarot)).toEqual({ mode: "open-paid", orderId: "o1" });
    expect(unlockOffer(account({ user: user({ gift: GIFT }) }), tarot)).toEqual({ mode: "gift", until: UNTIL, priceKrw: 2900 });
    expect(unlockOffer(account({ user: user({ gift: { status: "used" } }) }), tarot)).toEqual({ mode: "pay", priceKrw: 2900 });
    expect(unlockOffer(account({ user: user() }), tarot)).toEqual({ mode: "pay", priceKrw: 2900 });
  });

  it("says when the purchase to open was given back after its reading was cut off while written: it opens again but is not refundable (F1)", () => {
    expect(unlockOffer(account({ user: user({ unused: [{ orderId: "o1", productId: "tarot", refundable: false }] }) }), tarot)).toEqual({ mode: "open-paid", orderId: "o1", refundable: false });
    expect(unlockOffer(account({ user: user({ unused: [{ orderId: "o1", productId: "saju", refundUntil: UNTIL }] }) }), saju)).toEqual({ mode: "open-paid", orderId: "o1" });
  });

  it("never offers the gift for saju: paying is the only way", () => {
    expect(unlockOffer(account({ user: user({ gift: GIFT }) }), saju)).toEqual({ mode: "pay", priceKrw: 4900 });
    expect(unlockOffer(account({ payments: false, user: user({ gift: GIFT }) }), saju)).toEqual({ mode: "closed", login: false });
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

  it("puts 오픈 기념 무료 first for tarot while this device has not used it, sales open or not; logging in, a gift held and paying follow it (owner 2026-10-14)", () => {
    expect(unlockOffer(account(), tarot, true)).toEqual({ mode: "login", priceKrw: 2900, first: true });
    expect(unlockOffer(account({ user: user({ gift: GIFT }) }), tarot, true)).toEqual({ mode: "gift", until: UNTIL, priceKrw: 2900, first: true });
    expect(unlockOffer(account({ user: user() }), tarot, true)).toEqual({ mode: "pay", priceKrw: 2900, first: true });
    expect(unlockOffer(account({ payments: false, user: user({ gift: GIFT }) }), tarot, true)).toEqual({ mode: "gift", until: UNTIL, priceKrw: 2900, first: true });
    // Sales closed: 오픈 기념 무료 as before.
    expect(unlockOffer(undefined, tarot, true)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(account({ payments: false, login: true }), tarot, true)).toEqual({ mode: "opening", login: true });
    // A purchase waiting, or a reading of this kind being opened, still comes first.
    expect(unlockOffer(account({ user: user({ unused: [{ orderId: "o1", productId: "tarot" }] }) }), tarot, true)).toEqual({ mode: "open-paid", orderId: "o1" });
    expect(unlockOffer(account({ user: user({ opening: [{ productId: "tarot", currency: "paid", orderId: "o1" }] }) }), tarot, true)).toEqual({ mode: "in-progress", currency: "paid" });
  });

  it("once this device used 오픈 기념 무료, and always for saju, offers what it did before", () => {
    expect(unlockOffer(account(), tarot, false)).toEqual({ mode: "login", priceKrw: 2900 });
    expect(unlockOffer(account({ user: user() }), tarot, false)).toEqual({ mode: "pay", priceKrw: 2900 });
    expect(unlockOffer(account(), saju, true)).toEqual({ mode: "login", priceKrw: 4900 });
    expect(unlockOffer(account({ user: user() }), saju, true)).toEqual({ mode: "pay", priceKrw: 4900 });
    expect(unlockOffer(undefined, saju, true)).toEqual({ mode: "closed", login: false });
  });

  it("ends 오픈 기념 무료 with October: from 11월 1일 0시 KST tarot offers what a used one does, and nothing free while sales are closed", () => {
    vi.setSystemTime(LAST_FREE);
    expect(unlockOffer(undefined, tarot, true)).toEqual({ mode: "opening", login: false });
    expect(unlockOffer(account({ user: user() }), tarot, true)).toEqual({ mode: "pay", priceKrw: 2900, first: true });
    vi.setSystemTime(NOVEMBER);
    expect(unlockOffer(undefined, tarot, true)).toEqual({ mode: "closed", login: false });
    expect(unlockOffer(account({ payments: false, login: true }), tarot, true)).toEqual({ mode: "closed", login: true });
    expect(unlockOffer(account(), tarot, true)).toEqual({ mode: "login", priceKrw: 2900 });
    expect(unlockOffer(account({ user: user() }), tarot, true)).toEqual({ mode: "pay", priceKrw: 2900 });
    // What the account holds still opens.
    expect(unlockOffer(account({ payments: false, user: user({ gift: GIFT }) }), tarot, true)).toEqual({ mode: "gift", until: UNTIL, priceKrw: 2900 });
  });

  it("links the checkout with the product and the way back", () => {
    expect(checkoutHref("saju", "/saju/chart")).toBe("/pay/checkout?product=saju&returnTo=%2Fsaju%2Fchart");
  });
});
