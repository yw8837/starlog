import { describe, expect, it } from "vitest";
import { CRISIS_CONTACTS } from "@/lib/crisis";
import { HOTLINES, crisisLead, hotlineLines, isCrisisAnyLanguage } from "./crisis";
import { LOCALES } from "./locales";

describe("crisis", () => {
  it.each(["죽고 싶어", "I want to die", "thinking about suicide", "死にたい", "消えたい", "想死", "不想活了", "我想自殺"])("detects %s in any locale", (text) => {
    expect(isCrisisAnyLanguage(text)).toBe(true);
  });

  it.each(["죽음 카드가 나왔어요", "The Death card came up", "死神のカード", "死神牌出現了", "I'm dying to know"])("lets %s through", (text) => {
    expect(isCrisisAnyLanguage(text)).toBe(false);
  });

  it("keeps the Korean lines exactly and adds Korea's 109 to every other locale", () => {
    expect(HOTLINES.ko.map((h) => h.number)).toEqual(CRISIS_CONTACTS.map((c) => c.number));
    for (const locale of LOCALES.filter((l) => l !== "ko")) expect(HOTLINES[locale].some((h) => h.number === "109"), locale).toBe(true);
  });

  it("pairs each Korean line of lib/crisis.ts with its official page, in that file's order", () => {
    expect(HOTLINES.ko.map((h) => [h.number, h.source])).toEqual([
      ["109", "https://www.129.go.kr/109"],
      ["1577-0199", "https://www.mohw.go.kr/menu.es?mid=a10706040100"],
      ["1388", "https://www.mogef.go.kr/cc/ccy/cc_ccy_f001.do"],
      ["1588-9191", "https://www.lifeline.or.kr/business/phone.php"],
    ]);
  });

  it("cites an official source and a check date for every number outside the Korean list", () => {
    for (const locale of LOCALES.filter((l) => l !== "ko")) {
      for (const line of HOTLINES[locale]) {
        expect(line.source, `${locale} ${line.name}`).toMatch(/^https:\/\//);
        expect(line.checked, `${locale} ${line.name}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("writes the lead and the lines in each language", () => {
    expect(crisisLead("ja")).toContain("人と話して");
    expect(hotlineLines("en")[0]).toContain("988");
  });
});
