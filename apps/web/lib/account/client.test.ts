import { afterEach, describe, expect, it } from "vitest";
import { loginHref, loginMessage, parseAccount, refreshAccount, resetAccountForTests } from "./client";

afterEach(() => resetAccountForTests());

describe("account client", () => {
  it("reads /api/me and refuses odd shapes", () => {
    const body = {
      payments: true,
      login: true,
      owner: false,
      user: { nickname: "별", stardust: 10, stardustExpiresAt: "2026-12-30T14:59:59.999Z", unused: [{ orderId: "o1", productId: "tarot" }], opening: [{ productId: "saju", currency: "paid", orderId: "o2" }] },
    };
    expect(parseAccount(body)).toEqual(body);
    expect(parseAccount({ payments: false, login: false, owner: false, user: null })).toEqual({ payments: false, login: false, owner: false, user: null });
    expect(parseAccount({ payments: "yes" })).toBeNull();
    expect(parseAccount({ payments: true, login: true, owner: false, user: { nickname: 1 } })).toBeNull();
  });

  it("reads the readings being opened, and takes a missing or odd list as none", () => {
    const user = { nickname: "별", stardust: 0, stardustExpiresAt: null, unused: [] };
    const read = (opening: unknown) => parseAccount({ payments: true, login: true, owner: false, user: { ...user, opening } })?.user?.opening;
    expect(parseAccount({ payments: true, login: true, owner: false, user })?.user?.opening).toEqual([]);
    expect(read("x")).toEqual([]);
    expect(read([{ productId: "tarot", currency: "stardust", orderId: null }, { productId: "tarot", currency: "moon", orderId: null }, { productId: 1, currency: "paid", orderId: "o1" }, null])).toEqual([
      { productId: "tarot", currency: "stardust", orderId: null },
    ]);
    expect(read([{ productId: "tarot", currency: "paid" }])).toEqual([{ productId: "tarot", currency: "paid", orderId: null }]);
  });

  it("marks the review account, and nobody else", () => {
    const user = { nickname: "심사용 계정", stardust: 0, stardustExpiresAt: null, unused: [], opening: [] };
    const read = (extra: Record<string, unknown>) => parseAccount({ payments: true, login: true, owner: false, user: { ...user, ...extra } })?.user;
    expect(read({ review: true })).toEqual({ ...user, review: true });
    expect(read({ review: "yes" })).toEqual(user);
    expect(read({})).toEqual(user);
  });

  it("marks a Google account, and nobody else", () => {
    const user = { nickname: "별손님", stardust: 10, stardustExpiresAt: null, unused: [], opening: [] };
    const read = (extra: Record<string, unknown>) => parseAccount({ payments: true, login: true, owner: false, user: { ...user, ...extra } })?.user;
    expect(read({ google: true })).toEqual({ ...user, google: true });
    expect(read({ google: "yes" })).toEqual(user);
    expect(read({})).toEqual(user);
  });

  it("keeps each unopened purchase's refund deadline, and leaves an odd one out", () => {
    const user = { nickname: "별", stardust: 0, stardustExpiresAt: null, opening: [] };
    const read = (unused: unknown) => parseAccount({ payments: true, login: true, owner: false, user: { ...user, unused } })?.user?.unused;
    expect(read([{ orderId: "o1", productId: "tarot", refundUntil: "2026-10-13T14:59:59.999Z" }, { orderId: "o2", productId: "saju", refundUntil: 7 }])).toEqual([
      { orderId: "o1", productId: "tarot", refundUntil: "2026-10-13T14:59:59.999Z" },
      { orderId: "o2", productId: "saju" },
    ]);
  });

  it("asks /api/me once for many callers, and treats a failure as unknown", async () => {
    let calls = 0;
    const ok = (async () => {
      calls++;
      return Response.json({ payments: true, login: true, owner: false, user: null });
    }) as typeof fetch;
    const [a, b] = await Promise.all([refreshAccount(ok), refreshAccount(ok)]);
    expect(calls).toBe(1);
    expect(a).toEqual({ payments: true, login: true, owner: false, user: null });
    expect(b).toBe(a);
    const down = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    expect(await refreshAccount(down)).toBeNull();
  });

  it("builds the login link and the messages for ?login=", () => {
    expect(loginHref("/tarot/result")).toBe("/login?next=%2Ftarot%2Fresult");
    expect(loginMessage("ok")).toBeNull();
    expect(loginMessage(null)).toBeNull();
    expect(loginMessage("cancel")).toBe("로그인을 취소했어요");
    expect(loginMessage("failed")).toBe("로그인하지 못했어요. 다시 시도해 주세요.");
    expect(loginMessage("closed")).toBe("지금은 새로 가입할 수 없어요");
    expect(loginMessage("unavailable")).toBe("지금은 로그인할 수 없어요. 잠시 뒤에 다시 시도해 주세요.");
    expect(loginMessage("busy")).toBe("요청이 잠깐 많았어요. 1분 뒤에 다시 시도해 주세요.");
    expect(loginMessage("in-app")).toBe("Google 로그인은 카카오톡 밖의 브라우저에서 해 주세요.");
  });
});
