import { describe, expect, it } from "vitest";
import { MODEL_NAMES, isSoftViolation } from "../style";
import { PROFILES, aiTellViolationsIntl } from "./index";
import { safetyViolations, voiceViolations } from "./safety";

const hard = (locale: "en" | "ja" | "zh-hant", text: string, user = "") => safetyViolations(locale, text, user);

describe("safety per locale", () => {
  it.each([
    ["en", "This will definitely work out, 100% guaranteed."],
    ["en", "It is your destiny to meet them."],
    ["en", "He secretly loves you."],
    ["en", "You will get married this year."],
    ["en", "Buy crypto this week."],
    ["en", "Text them on Friday at 3 pm."],
    ["ja", "必ずうまくいきます。"],
    ["ja", "これは運命です。"],
    ["ja", "彼はあなたのことが好きです。"],
    ["ja", "来年結婚します。"],
    ["ja", "株を買ってください。"],
    ["ja", "10月3日に連絡しましょう。"],
    ["zh-hant", "一定會成功，百分之百。"],
    ["zh-hant", "你們是命中注定。"],
    ["zh-hant", "他其實喜歡你。"],
    ["zh-hant", "你們明年會結婚。"],
    ["zh-hant", "去買股票吧。"],
    ["zh-hant", "星期五下午三點聯絡他。"],
  ] as const)("%s flags: %s", (locale, text) => {
    expect(hard(locale, text).length, text).toBeGreaterThan(0);
  });

  it.each([
    ["en", "The Wheel of Fortune turns: when a reply comes fast, keep it light; when it is slow, give it room."],
    ["en", "Rather than investing, check this month's spending first."],
    ["en", "It's hard to know what they feel; watch how the next chat goes."],
    ["ja", "運命の輪が回っています。返事が早ければ軽く、遅ければ少し待ってみましょう。"],
    ["ja", "相手の気持ちはわかりませんが、次の会話の流れを見てみましょう。"],
    ["zh-hant", "命運之輪正在轉動。回覆來得快就輕鬆回應，慢一點就多給一些時間。"],
    ["zh-hant", "對方的心意無法確定，可以看看下次聊天的氣氛。"],
  ] as const)("%s allows: %s", (locale, text) => {
    expect(hard(locale, text), text).toEqual([]);
  });

  it("lets users' own words be quoted back", () => {
    expect(hard("en", "You asked whether it's guaranteed. Let's look at what is building instead.", "is it guaranteed?")).toEqual([]);
  });
});

describe("voice and tells", () => {
  it("flags plain-form Japanese endings as soft, outside quotes", () => {
    const soft = voiceViolations("ja", "崖の端に立っている。空を見上げる。");
    expect(soft).toHaveLength(1);
    expect(isSoftViolation(soft[0]!)).toBe(true);
    expect(voiceViolations("ja", "崖の端に立っています。「今行く」と送ってみましょう。")).toEqual([]);
  });

  it("adds one soft finding at three distinct tells", () => {
    const out: string[] = [];
    aiTellViolationsIntl("en", ["In conclusion, it's important to note this card. Delve into the tapestry of your journey — the card tells you so."], out);
    expect(out).toHaveLength(1);
    expect(isSoftViolation(out[0]!)).toBe(true);
    const calm: string[] = [];
    aiTellViolationsIntl("en", ["The man lifts his lamp and looks at the path under his feet. Check the one step in front of you today."], calm);
    expect(calm).toEqual([]);
  });

  it("blinds model and vendor names in every script", () => {
    for (const name of ["Claude", "クロード", "アンソロピック", "チャットGPT", "克勞德", "语言模型", "語言模型", "言語モデル"]) expect(MODEL_NAMES.test(name), name).toBe(true);
  });

  it("gives every profile a language name and starting length factors", () => {
    expect(PROFILES.ja.languageName).toBe("Japanese");
    expect(PROFILES["zh-hant"].languageName).toBe("Traditional Chinese (Taiwan)");
    expect(PROFILES.en.lengthFactor).toBeCloseTo(0.42);
  });
});
