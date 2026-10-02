import { describe, expect, it } from "vitest";
import { scriptViolations } from "./script";
import { beyondUser, measure, mentionsIn, overlap, sentencesOf, tokens } from "./text";

describe("locale text", () => {
  it("measures English in words and CJK in characters without spaces", () => {
    expect(measure("en", "The lamp is held high, isn't it?")).toBe(7);
    expect(measure("ja", "ランプを 高く掲げる。")).toBe(10);
    expect(measure("zh-hant", "高舉 燈籠。")).toBe(5);
  });

  it("splits sentences on the language's own punctuation", () => {
    expect(sentencesOf("ja", "崖の端に立っています。空を見上げて！どうしますか？")).toHaveLength(3);
    expect(sentencesOf("en", "He stands. He looks up! Now?")).toHaveLength(3);
  });

  it("matches phrases by stems in English and by bigrams in CJK", () => {
    expect(tokens("en", "The dogs were jumping")).toEqual(["dog", "jump"]);
    expect(mentionsIn("en", "Your crush texted back yesterday.", "my crush texts")).toBe(true);
    expect(mentionsIn("ja", "片思い中の気持ちが揺れています。", "片思い中")).toBe(true);
    expect(overlap("zh-hant", "他站在懸崖邊，抬頭看天空。", "站在懸崖的邊緣，抬頭看著天空")).toBeGreaterThan(0.5);
    expect(overlap("zh-hant", "今天適合整理房間。", "站在懸崖的邊緣，抬頭看著天空")).toBeLessThan(0.15);
  });

  it("counts only what the user did not write", () => {
    expect(beyondUser(/guaranteed/i, "It's not guaranteed.", "is it guaranteed?")).toEqual([]);
    expect(beyondUser(/guaranteed/i, "It's guaranteed.", "")).toEqual(["guaranteed"]);
  });
});

describe("script checks", () => {
  it("rejects Hangul outside the user's own words in every locale", () => {
    expect(scriptViolations("en", "Your 연애 card is bright.", "")).toHaveLength(1);
    expect(scriptViolations("en", "You wrote '민지', and the card agrees.", "민지랑")).toEqual([]);
  });

  it("asks for kana in Japanese and rejects kana and simplified characters in Traditional Chinese", () => {
    expect(scriptViolations("ja", "愚者正位置。", "")).toHaveLength(1);
    expect(scriptViolations("ja", "愚者が正位置で出ました。", "")).toEqual([]);
    expect(scriptViolations("zh-hant", "這張牌說明你們的关系会变。", "")).toHaveLength(1);
    expect(scriptViolations("zh-hant", "這張牌是正位。ありがとう", "")).toHaveLength(1);
    expect(scriptViolations("zh-hant", "這張牌是正位，畫面很明亮。", "")).toEqual([]);
  });
});
