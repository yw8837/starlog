import { describe, expect, it } from "vitest";
import { gaLocation } from "./analytics";
import { metaPageAllowed } from "./metaPixel";
import { NOW_TYPES, NOW_TYPE_SLUGS, PAIR_LINES, nowWithHref, nowWithSlug, pairLine } from "./tarotType";

/** 별명 이어뽑기 (spec 2026-11-26 beyond trend §1, §5, §7): the /now?with= slug and 둘의 별명's one line. */

describe("the slug a /now?with= link carries", () => {
  it("takes the 12 nicknames' slugs and ignores anything else", () => {
    for (const slug of NOW_TYPE_SLUGS) expect(nowWithSlug(slug)).toBe(slug);
    for (const value of [null, undefined, "", "now-fire", "NOW-FIRE-GO", " now-fire-go", "now-fire-go ", "now-fire-go&x=1", "../now-fire-go", "toString", "now-fire-go,now-air-go"]) {
      expect(nowWithSlug(value), String(value)).toBeNull();
    }
    expect(nowWithHref("now-air-wait")).toBe("/now?with=now-air-wait");
  });

  it("goes to no analytics as it is: GA gets /now (the query cleaned), and the Meta pixel sends no page view for it", () => {
    const href = "https://starlog.yeolmaeapps.kr/now?with=now-water-rethink";
    expect(gaLocation(href)).toBe("https://starlog.yeolmaeapps.kr/now");
    expect(metaPageAllowed(href)).toBe(false);
    expect(metaPageAllowed("https://starlog.yeolmaeapps.kr/now")).toBe(true);
  });
});

describe("둘의 별명's one line", () => {
  it("is one of four fixed lines, by same or different element and same or different lean", () => {
    expect(PAIR_LINES).toEqual({
      same: { same: "원소도 방향도 같네. 카드끼리 짰어?", other: "같은 원소인데 화살표가 딴 데 보네." },
      other: { same: "다른 원소로 와서 같은 쪽에 섰네.", other: "원소도 방향도 제각각. 판 좀 넓힐까?" },
    });
    expect(pairLine("now-fire-go", "now-fire-go")).toBe("원소도 방향도 같네. 카드끼리 짰어?");
    expect(pairLine("now-fire-go", "now-fire-wait")).toBe("같은 원소인데 화살표가 딴 데 보네.");
    expect(pairLine("now-fire-go", "now-water-go")).toBe("다른 원소로 와서 같은 쪽에 섰네.");
    expect(pairLine("now-fire-go", "now-water-wait")).toBe("원소도 방향도 제각각. 판 좀 넓힐까?");
  });

  it("follows the rule for all 144 pairs, the same whichever side is the friend", () => {
    for (const a of NOW_TYPE_SLUGS) {
      for (const b of NOW_TYPE_SLUGS) {
        const element = NOW_TYPES[a].element === NOW_TYPES[b].element ? "same" : "other";
        const lean = NOW_TYPES[a].lean === NOW_TYPES[b].lean ? "same" : "other";
        expect(pairLine(a, b), `${a} ${b}`).toBe(PAIR_LINES[element][lean]);
        expect(pairLine(b, a)).toBe(pairLine(a, b));
      }
    }
  });
});
