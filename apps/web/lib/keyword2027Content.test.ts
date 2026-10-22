import { BRANCHES, STEMS, mainHiddenStem } from "@starlog/core";
import { describe, expect, it } from "vitest";
import { SAME_PILLAR, branchRelations, pillarRelations, stemRelations, tenGod } from "./ai/prompts/saju";
import { blocklistViolations, nonHaeyoSentences } from "./ai/validate";
import { ILJU } from "./keyword2027";
import { BRANCH_MEETING, KEYWORD_CONTENT, STEM_GODS, STEM_MEETING, YEAR_GZ, meetingOf, reasonLines } from "./keyword2027Content";

/**
 * The 2027 mapping and the 60 fixed texts. The mapping is checked against the paid 2027 신년운세's own fact
 * functions (lib/ai/prompts/saju.ts: the 세운's ten gods and its relations to the natal chart), so this free test
 * never names a ten god or a relation the paid reading would not.
 */

const FIELDS = ["brings", "watch", "action"] as const;
/** Hangul syllables of a keyword, spaces left out. */
const syllables = (text: string) => text.replace(/\s/g, "").length;

describe("the 2027 mapping table", () => {
  it("is 丁未, the year the paid reading reads as of mid-2027", () => {
    expect(YEAR_GZ).toBe("丁未");
  });

  it("gives each day stem the ten gods of 丁 and of 未's 본기, as the paid reading computes them", () => {
    for (const stem of STEMS) {
      expect(STEM_GODS[stem], stem).toEqual({ stemGod: tenGod(stem, "丁"), branchGod: tenGod(stem, mainHiddenStem("未")) });
    }
    // Ten outcomes for the year's stem: one per day stem.
    expect(new Set(STEMS.map((s) => STEM_GODS[s].stemGod)).size).toBe(10);
  });

  it("names how 丁 meets the day stem exactly as the paid reading's stem relations do", () => {
    for (const stem of STEMS) {
      const types = stemRelations({ glyph: "丁", at: "세운 천간" }, { glyph: stem, at: "일간" }).map((r) => r.type);
      expect(STEM_MEETING[stem] ? [STEM_MEETING[stem]] : [], stem).toEqual(types);
    }
  });

  it("names how 未 meets the day branch exactly as the paid reading's branch relations do (원진 is not one of them)", () => {
    for (const branch of BRANCHES) {
      const types = branchRelations({ glyph: "未", at: "세운 지지" }, { glyph: branch, at: "일지" }).map((r) => r.type);
      expect([...BRANCH_MEETING[branch]], branch).toEqual(types);
    }
    // 丁未 meets a 丁未 day pillar as one 같은 간지, the paid reading's word for it.
    const same = pillarRelations(
      { at: "2027 세운", stem: { glyph: "丁", at: "세운 천간" }, branch: { glyph: "未", at: "세운 지지" } },
      [{ at: "일주", stem: { glyph: "丁", at: "일간" }, branch: { glyph: "未", at: "일지" } }],
    ).map((r) => r.type);
    expect(same).toEqual([SAME_PILLAR]);
    expect(meetingOf(ILJU.find((i) => i.hanja === "丁未")!)).toEqual([SAME_PILLAR]);
    expect(meetingOf(ILJU.find((i) => i.hanja === "乙未")!)).toEqual(["같은 글자"]);
  });

  it("gives every 일주 its own pair of (stem, how 未 meets the day branch): no two of the 60 derive the same", () => {
    const keys = ILJU.map((i) => `${STEM_GODS[i.stem].stemGod}|${i.branch}`);
    expect(new Set(keys).size).toBe(60);
  });
});

describe("the reason under each keyword", () => {
  it("names the two ten gods in plain words with the term in brackets, and the relation (or its absence)", () => {
    for (const ilju of ILJU) {
      const text = reasonLines(ilju).join(" ");
      const { stemGod, branchGod } = STEM_GODS[ilju.stem];
      expect(text, ilju.hanja).toContain(`(${stemGod})`);
      expect(text, ilju.hanja).toContain(`(${branchGod})`);
      expect(text, ilju.hanja).toContain(ilju.branch);
      const meeting = meetingOf(ilju);
      // Said as this test's scope, not as a fact about the whole chart (the paid reading reads all four pillars).
      if (meeting.length === 0) expect(text, ilju.hanja).toContain("이 테스트에서 따로 보는 관계가 없어요");
      for (const type of meeting) expect(text, ilju.hanja).toContain(type === SAME_PILLAR || type === "같은 글자" ? type.slice(0, 2) : `(${type.split("(")[0]})`);
      expect(nonHaeyoSentences(text), ilju.hanja).toEqual([]);
    }
    expect(reasonLines(ILJU.find((i) => i.hanja === "壬子")!).join(" ")).toContain("천간합");
    expect(reasonLines(ILJU.find((i) => i.hanja === "癸丑")!).join(" ")).toContain("천간충");
  });
});

describe("the 60 texts", () => {
  it("cover every 일주, nothing else", () => {
    expect(Object.keys(KEYWORD_CONTENT).sort()).toEqual(ILJU.map((i) => i.hanja).sort());
  });

  it("give one keyword of 2–6 Hangul syllables per 일주, no two the same", () => {
    const keywords = ILJU.map((i) => KEYWORD_CONTENT[i.hanja]!.keyword);
    for (const keyword of keywords) {
      expect(keyword).toMatch(/^[가-힣]+(?: [가-힣]+)*$/);
      expect(syllables(keyword), keyword).toBeGreaterThanOrEqual(2);
      expect(syllables(keyword), keyword).toBeLessThanOrEqual(6);
    }
    // N = 0: every keyword is a share card's headline; a repeated one would make two 일주 look like one template.
    expect(keywords.length - new Set(keywords).size).toBe(0);
  });

  // The paid reading's own bans (lib/ai/prompts/saju.ts): no 신살 label such as 귀인, no event read from a relation (이사), no graded year;
  // and no year that does things to the reader (…게 되는 해, …해 주는 해) or an 인연 that arrives: tendencies and conditions instead.
  it("write each line as one plain 해요체 sentence under 40 characters: no terms, no hanja, no scores, no promises", () => {
    for (const ilju of ILJU) {
      const content = KEYWORD_CONTENT[ilju.hanja]!;
      for (const field of FIELDS) {
        const line = content[field];
        const where = `${ilju.hanja}.${field}: ${line}`;
        expect(line.length, where).toBeLessThanOrEqual(40);
        expect(line, where).toMatch(/요\.$/);
        expect(line, where).not.toMatch(/[()一-龥A-Za-z%]|\d+\s?점|대박|보장|확실|무조건|반드시|행운이|건강|질병|병원|합격|재회|수익|귀인|좋은 해|나쁜 해|이사|이동|나타나|운명|인연이 닿|게 되는 해|해 주는 해|넓어지는 해/);
        expect(nonHaeyoSentences(line), where).toEqual([]);
        const out: string[] = [];
        blocklistViolations(line, "", out);
        expect(out, where).toEqual([]);
      }
    }
  });

  it("do not read like one template: no line repeats, and no ending carries more than a third of a field", () => {
    const all = ILJU.flatMap((i) => FIELDS.map((f) => KEYWORD_CONTENT[i.hanja]![f]));
    expect(new Set(all).size).toBe(all.length);
    for (const field of FIELDS) {
      const endings = new Map<string, number>();
      for (const ilju of ILJU) {
        const end = KEYWORD_CONTENT[ilju.hanja]![field].replace(/\s/g, "").slice(-5);
        endings.set(end, (endings.get(end) ?? 0) + 1);
      }
      const [top, count] = [...endings.entries()].sort((a, b) => b[1] - a[1])[0]!;
      expect(count, `${field}: "${top}"`).toBeLessThanOrEqual(20);
    }
  });
});
