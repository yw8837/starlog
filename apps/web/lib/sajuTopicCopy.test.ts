import { describe, expect, it } from "vitest";
import { sajuFreeLine, sajuPricingLine, sajuPrivacyItem, sajuPrivacySent } from "./sajuTopicCopy";

describe("copy that follows the flag (spec §5.4, owner cut §0)", () => {
  it("names the 운 only from the on build", () => {
    expect(sajuPricingLine("on")).toBe("사주팔자·연애운·재회운·재물운·직장운 가운데 고른 풀이 하나");
    expect(sajuPricingLine("owner")).toBe("명식을 주제별로 읽은 풀이, 오행과 십신, 지금의 10년(대운)");
    // owner 2026-11-04: the 명식 without a login, the 맛보기 with one, and no day count on screen.
    expect(sajuFreeLine("on")).toBe(
      "사주는 명식(네 기둥, 오행 분포, 일간)을 로그인 없이 무료로 볼 수 있어요. 사주팔자와 연애운, 재회운, 재물운, 직장운의 맛보기는 로그인하면 무료로 볼 수 있어요.",
    );
    expect(sajuFreeLine("off")).toBe("사주는 명식(네 기둥, 오행 분포, 일간)을 로그인 없이 무료로 볼 수 있고, 맛보기는 로그인하면 무료로 볼 수 있어요.");
    expect(sajuPrivacySent("on")).toBe("고른 운과 요즘 상황(고른 칩)");
    expect(sajuPrivacySent("off")).toBe("요즘 상황(고른 칩)");
    expect(sajuPrivacyItem("on")).toBe("고른 운(연애운·재회운·재물운·직장운)과 요즘 상황(연애·일 상태, 고른 경우)");
    expect(sajuPrivacyItem("owner")).toBe("요즘 상황(연애·일 상태, 고른 경우)");
  });

  it("never mentions a written concern or a beta", () => {
    for (const mode of ["on", "owner", "off"] as const) {
      for (const text of [sajuPricingLine(mode), sajuFreeLine(mode), sajuPrivacySent(mode), sajuPrivacyItem(mode)]) {
        expect(text).not.toMatch(/고민|베타/);
      }
    }
  });
});
