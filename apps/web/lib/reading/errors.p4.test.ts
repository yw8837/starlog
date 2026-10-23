import { describe, expect, it } from "vitest";
import { parseApiError } from "./api";
import { CREDIT_CHECKING, creditKept, creditUnknown, describeApiError } from "./errors";

describe("P4 error copy", () => {
  it("knows the P4 codes", () => {
    expect(parseApiError(401, { code: "LOGIN_REQUIRED" }).code).toBe("LOGIN_REQUIRED");
    expect(parseApiError(402, { code: "NO_CREDIT" }).code).toBe("NO_CREDIT");
    expect(parseApiError(409, { code: "PAY_PENDING" }).code).toBe("PAY_PENDING");
  });

  it("tells a buyer at the day's preview cap, in words that fit every premium reading (no 첫 장, no card), that the bought reading opens now (review 2026-10-20 A5)", () => {
    const error = parseApiError(429, { code: "BETA_LIMIT", scope: "buyer", resetsAt: "2026-10-21T00:00:00+09:00" });
    expect(error.scope).toBe("buyer");
    const view = describeApiError(error, "teaser");
    expect(view).toEqual({ title: "오늘 볼 수 있는 미리보기를 모두 봤어요", body: "결제한 풀이는 바로 열 수 있어요.", action: null });
    expect(`${view.title} ${view.body}`).not.toMatch(/첫 장|카드/);
  });

  it("never says a failed paid or gift reading kept what opened it before the account was checked", () => {
    for (const context of ["paid", "gift"] as const) {
      for (const error of [
        { code: "UPSTREAM" as const, status: 502 },
        { code: "QUALITY" as const, status: 502 },
        { code: "NETWORK" as const, status: 0 },
        { code: "TIMEOUT" as const, status: 0 },
        { code: "INVALID" as const, status: 502 },
      ]) {
        const view = describeApiError(error, context);
        expect(view).toEqual(CREDIT_CHECKING);
        expect(`${view.title} ${view.body ?? ""}`).not.toMatch(/그대로/);
      }
    }
  });

  it("says why a purchase or a signup gift opens no more, in the server's words (L-1)", () => {
    const paid = parseApiError(409, { code: "NOT_AVAILABLE", reason: "capped", message: "풀이가 여러 번 끝까지 나오지 않아 이 결제로는 더 열 수 없어요. 결제는 쓰이지 않았으니 문의해 주시면 기간과 상관없이 전액 환불해 드려요." });
    expect(describeApiError(paid, "paid")).toEqual({ title: "이 결제로는 더 열 수 없어요", body: "풀이가 여러 번 끝까지 나오지 않아 이 결제로는 더 열 수 없어요. 결제는 쓰이지 않았으니 문의해 주시면 기간과 상관없이 전액 환불해 드려요.", action: null });
    const gift = parseApiError(409, { code: "NOT_AVAILABLE", reason: "capped", message: "풀이가 여러 번 끝까지 나오지 않아 이 가입 선물로는 더 열 수 없어요. 문의해 주세요." });
    expect(describeApiError(gift, "gift")).toEqual({ title: "이 가입 선물로는 더 열 수 없어요", body: "풀이가 여러 번 끝까지 나오지 않아 이 가입 선물로는 더 열 수 없어요. 문의해 주세요.", action: null });
  });

  it("says what the check found", () => {
    expect(creditKept("paid")).toMatchObject({ title: "풀이를 다 적지 못했어요", body: "결제한 풀이는 그대로 남아 있어요. 다시 열어 끝까지 받을 수 있어요.", action: "retry" });
    // F1: a purchase left while it was written is no longer refundable, and the copy cannot tell which this is.
    expect(creditKept("paid").body).not.toMatch(/환불/);
    expect(creditUnknown("paid").body).toBe("몇 분 안에 내 정보의 결제한 풀이나 기록에 나타나요. 열리지 않은 결제는 다시 열 수 있고, 환불할 수 있는 결제면 내 정보에 환불받기가 보여요.");
    expect(creditKept("gift").body).toBe("가입 선물은 그대로예요. 한 번 더 시도해 주세요.");
    expect(creditUnknown("gift").body).toBe("몇 분 안에 내 정보의 가입 선물이나 기록에서 확인할 수 있어요.");
    for (const context of ["paid", "gift"] as const) expect(`${creditUnknown(context).title} ${creditUnknown(context).body}`).not.toMatch(/그대로/);
  });

  it("shows Toss's own message for a declined payment", () => {
    expect(describeApiError({ code: "PAY_FAILED", status: 402, message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." })).toMatchObject({ title: "결제를 마치지 못했어요", body: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." });
  });

  it("names the purchase, never a signup gift (removed, owner 2026-10-14 evening), when nothing opens the reading", () => {
    expect(describeApiError({ code: "NO_CREDIT", status: 402 })).toEqual({ title: "열 수 있는 결제한 풀이가 없어요", body: "결제하고 열 수 있어요.", action: null });
    expect(describeApiError({ code: "PAYMENT_REQUIRED", status: 402 })).toEqual({ title: "전체 풀이는 결제하고 열 수 있어요", action: null });
  });

  it("says a 오픈 기념 무료 reading takes no follow-ups in the server's words", () => {
    const message = "오픈 기념 무료 풀이는 내 기록에 보관돼요. 이어서 물어보기는 결제한 풀이에서 할 수 있어요.";
    expect(describeApiError({ code: "NOT_AVAILABLE", status: 409, message }, "followup")).toEqual({ title: "이 풀이에는 더 물어볼 수 없어요", body: message, action: null });
    expect(describeApiError({ code: "NOT_AVAILABLE", status: 409 })).toEqual({ title: "지금은 열 수 없는 상품이에요", action: "home" });
  });
});
