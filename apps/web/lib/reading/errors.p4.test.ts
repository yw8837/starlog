import { describe, expect, it } from "vitest";
import { parseApiError } from "./api";
import { CREDIT_CHECKING, creditKept, creditUnknown, describeApiError } from "./errors";

describe("P4 error copy", () => {
  it("knows the P4 codes", () => {
    expect(parseApiError(401, { code: "LOGIN_REQUIRED" }).code).toBe("LOGIN_REQUIRED");
    expect(parseApiError(402, { code: "NO_CREDIT" }).code).toBe("NO_CREDIT");
    expect(parseApiError(409, { code: "PAY_PENDING" }).code).toBe("PAY_PENDING");
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

  it("says what the check found", () => {
    expect(creditKept("paid")).toMatchObject({ title: "풀이를 다 적지 못했어요", body: "결제한 풀이는 그대로 남아 있어요. 다시 열거나 내 정보에서 환불받을 수 있어요.", action: "retry" });
    expect(creditKept("gift").body).toBe("가입 선물은 그대로예요. 한 번 더 시도해 주세요.");
    expect(creditUnknown("gift").body).toBe("몇 분 안에 내 정보의 가입 선물이나 기록에서 확인할 수 있어요.");
    for (const context of ["paid", "gift"] as const) expect(`${creditUnknown(context).title} ${creditUnknown(context).body}`).not.toMatch(/그대로/);
  });

  it("shows Toss's own message for a declined payment", () => {
    expect(describeApiError({ code: "PAY_FAILED", status: 402, message: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." })).toMatchObject({ title: "결제를 마치지 못했어요", body: "한도초과 혹은 잔액부족으로 결제에 실패했습니다." });
  });

  it("names the purchase and the signup gift when nothing opens the reading", () => {
    expect(describeApiError({ code: "NO_CREDIT", status: 402 })).toEqual({ title: "열 수 있는 결제한 풀이나 가입 선물이 없어요", body: "결제하고 열 수 있어요.", action: null });
    expect(describeApiError({ code: "PAYMENT_REQUIRED", status: 402 })).toEqual({ title: "전체 풀이는 결제하고 열 수 있어요", action: null });
  });
});
