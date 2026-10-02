import { describe, expect, it } from "vitest";
import { MessageSyntaxError, argumentNames, formatMessage, hasJosa, parseMessage } from "./format";

describe("formatMessage", () => {
  it("interpolates strings and formats numbers for the locale", () => {
    expect(formatMessage("안녕, {name}", { name: "민지" })).toBe("안녕, 민지");
    expect(formatMessage("{n}개", { n: 2900 })).toBe("2,900개");
    expect(formatMessage("{n} readings", { n: 1234 }, "en")).toBe("1,234 readings");
    expect(formatMessage("{year}年", { year: "2026" }, "ja")).toBe("2026年");
  });

  it("picks plural cases: exact first, then the locale's category, then other; # is the count", () => {
    const en = "{n, plural, =0 {No readings} one {# reading} other {# readings}}";
    expect(formatMessage(en, { n: 0 }, "en")).toBe("No readings");
    expect(formatMessage(en, { n: 1 }, "en")).toBe("1 reading");
    expect(formatMessage(en, { n: 1000 }, "en")).toBe("1,000 readings");
    expect(formatMessage("{n, plural, other {#回}}", { n: 1 }, "ja")).toBe("1回");
    expect(formatMessage("남은 횟수 {n, plural, other {#번}}", { n: 3 })).toBe("남은 횟수 3번");
  });

  it("keeps arguments inside plural cases", () => {
    expect(formatMessage("{n, plural, one {{who} has # star} other {{who} has # stars}}", { n: 2, who: "Mina" }, "en")).toBe("Mina has 2 stars");
  });

  it("adds Korean particles only in Korean", () => {
    expect(formatMessage("{card, josa, 을/를} 골랐어요", { card: "바보" })).toBe("바보를 골랐어요");
    expect(formatMessage("{card, josa, 을/를} 골랐어요", { card: "별" })).toBe("별을 골랐어요");
    expect(formatMessage("{card, josa, 이/가}", { card: "The Fool" }, "en")).toBe("The Fool");
  });

  it("rejects malformed messages", () => {
    for (const bad of ["{", "}", "{1x}", "{n, plural, one {x}}", "{n, select, a {x} other {y}}", "{n, josa, 에/에서}", "{n, plural, one {x} other {y}"]) {
      expect(() => parseMessage(bad), bad).toThrow(MessageSyntaxError);
    }
  });

  it("throws on a missing value outside production", () => {
    expect(() => formatMessage("{name}님", {})).toThrow(/missing value "name"/);
  });

  it("reports argument names and josa use", () => {
    expect(argumentNames(parseMessage("{b} {a, josa, 을/를} {n, plural, other {{c}}}"))).toEqual(["a", "b", "c", "n"]);
    expect(hasJosa(parseMessage("{a, josa, 을/를}"))).toBe(true);
    expect(hasJosa(parseMessage("{a}"))).toBe(false);
  });
});
