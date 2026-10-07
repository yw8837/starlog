import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { CONSTELLATIONS } from "@starlog/core";
import { boxesOverlap } from "@/components/bonds/art/labels";
import { SHARE_SIZES, bondsShareImage, bondsShareText, bondsShareVersion, type BondsShareData } from "./bondsImage";
import { inviteOgImage } from "./cardsImage";

const NAMES = ["민지", "하늘이", "도윤", "서아별", "별빛나리", "지우", "Momo"];
/** The longest nicknames there are (NICKNAME_MAX, 10 characters), Hangul and the widest Latin. */
const LONG = ["가나다라마바사아자차", "별빛이쏟아지는밤하늘", "WWWWWWWWWW", "불꽃속성알감자입니다", "MomoMomoMo", "하늘하늘하늘하늘하늘", "달빛아래고양이한마리"];

type Props = { style?: Record<string, unknown>; children?: ReactNode };

function walk(node: ReactNode, visit: (el: ReactElement<Props>) => void): void {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
  if (!isValidElement(node)) return;
  const el = node as ReactElement<Props>;
  visit(el);
  walk(el.props.children, visit);
}

/** Every string and number the picture draws, in tree order. */
function texts(node: ReactNode): string[] {
  const out: string[] = [];
  const add = (child: ReactNode) => {
    if (typeof child === "string" || typeof child === "number") out.push(String(child));
    else if (Array.isArray(child)) child.forEach(add);
  };
  walk(node, (el) => add(el.props.children));
  return out;
}

/** The nickname pills: absolutely placed, round boxes. Each gives its box and every text it draws. */
function pillBoxes(node: ReactNode) {
  const boxes: { x: number; y: number; w: number; h: number; text: string }[] = [];
  walk(node, (el) => {
    const st = el.props.style;
    if (st?.position === "absolute" && typeof st.width === "number" && st.borderRadius === 9999) {
      const parts = texts(el);
      if (parts.length === 0) return; // the star-field dots are round and absolute too, but draw no text
      boxes.push({ x: st.left as number, y: st.top as number, w: st.width, h: st.height as number, text: parts.join(" ") });
    }
  });
  return boxes;
}

const base = (sign: BondsShareData["sign"], n: number, extra: Partial<BondsShareData> = {}): BondsShareData => ({
  sign, nicknames: NAMES.slice(0, n), total: 400, rank: 3, ownerNickname: "용우", completedAt: Date.UTC(2026, 9, 1), host: "starlog.yeolmaeapps.kr", ...extra,
});

describe("constellation share image", () => {
  for (const size of ["feed", "story"] as const) {
    it(`puts every friend's nickname, and nothing else, on its own star, without overlaps (${size}, all 12 signs)`, () => {
      for (const c of CONSTELLATIONS) {
        const pills = pillBoxes(bondsShareImage(base(c.id, c.slots), size));
        expect(pills.map((p) => p.text)).toEqual(NAMES.slice(0, c.slots));
        for (const [i, a] of pills.entries()) for (const b of pills.slice(i + 1)) expect(boxesOverlap(a, b), `${c.id}: ${a.text}/${b.text}`).toBe(false);
      }
    });

    it(`keeps 10-character nicknames whole, inside the picture and apart (${size}, all 12 signs)`, () => {
      const { width, height } = SHARE_SIZES[size];
      for (const c of CONSTELLATIONS) {
        const pills = pillBoxes(bondsShareImage(base(c.id, c.slots, { nicknames: LONG.slice(0, c.slots) }), size));
        expect(pills.map((p) => p.text)).toEqual(LONG.slice(0, c.slots));
        for (const p of pills) {
          expect(p.x >= 0 && p.y >= 0 && p.x + p.w <= width && p.y + p.h <= height, `${c.id}: ${p.text}`).toBe(true);
        }
        for (const [i, a] of pills.entries()) for (const b of pills.slice(i + 1)) expect(boxesOverlap(a, b), `${c.id}: ${a.text}/${b.text}`).toBe(false);
      }
    });
  }

  it("shows the owner and sign, my total and my all-time rank, the date and the friends' nicknames: no friend's score, no birth date", () => {
    const data = base("aries", 4, { nicknames: ["민지", "하늘", "도윤", "서아"], total: 342, rank: 3, completedAt: Date.UTC(2026, 9, 1, 3) });
    const all = texts(bondsShareImage(data, "feed")).join(" ");
    for (const part of ["양자리", "Aries", "342", "용우님의 양자리", "양자리 3위", "2026년 10월 1일 완성", "starlog.yeolmaeapps.kr", "민지", "하늘", "도윤", "서아"]) {
      expect(all).toContain(part);
    }
    // the only numbers are my total, my rank and the date
    expect(all.match(/\d+/g)!.sort()).toEqual(["1", "10", "2026", "3", "342"].sort());
    expect(all).not.toMatch(/생년|생일|태어|19\d\d/);
    // and every character drawn is in the glyph subsets the route asks for
    const subset = bondsShareText(data);
    for (const ch of Array.from(all.replace(/\s/g, ""))) expect(subset.serif + subset.sans).toContain(ch);
  });

  it("draws a 3-digit total and the rank whole beside 10-character nicknames, every glyph in the subsets (both sizes)", () => {
    for (const size of ["feed", "story"] as const) {
      const data = base("pisces", 7, { nicknames: LONG, total: 693, rank: 128 });
      const drawn = texts(bondsShareImage(data, size));
      // the total and the rank capsule are one text each, never cut
      expect(drawn).toContain("693");
      expect(drawn).toContain("물고기자리 128위");
      for (const name of LONG.slice(0, 7)) expect(drawn).toContain(name);
      const subset = bondsShareText(data);
      expect(subset.serif).toContain("693");
      for (const ch of Array.from(drawn.join("").replace(/\s/g, ""))) expect(subset.serif + subset.sans).toContain(ch);
    }
  });

  it("leaves the rank line out when the owner is not ranked (the name is kept off the rankings)", () => {
    const all = texts(bondsShareImage(base("leo", 6, { rank: null }), "story")).join(" ");
    expect(all).not.toMatch(/\d+위/);
    expect(all).toContain("용우님의 사자자리");
    const subset = bondsShareText(base("leo", 6, { rank: null }));
    for (const ch of Array.from(all.replace(/\s/g, ""))) expect(subset.serif + subset.sans).toContain(ch);
  });

  it("changes its version whenever the picture would: rank, total, a member or a name", () => {
    const a = bondsShareVersion(base("aries", 4));
    expect(bondsShareVersion(base("aries", 4))).toBe(a);
    for (const changed of [
      base("aries", 4, { rank: 2 }),
      base("aries", 4, { rank: null }),
      base("aries", 4, { total: 401 }),
      base("aries", 4, { ownerNickname: "용우2" }),
      base("aries", 4, { nicknames: NAMES.slice(0, 4).map((name, i) => (i === 3 ? "다른별" : name)) }),
      base("aries", 4, { nicknames: NAMES.slice(0, 3) }),
      base("aries", 4, { completedAt: Date.UTC(2026, 9, 2) }),
    ]) {
      expect(bondsShareVersion(changed)).not.toBe(a);
    }
  });

  it("draws the generic invite card for an unknown code", () => {
    const all = texts(inviteOgImage({ ownerNickname: null, sign: null, filled: 0, host: "starlog.yeolmaeapps.kr" })).join(" ");
    expect(all).toContain("별자리 인연 초대");
    expect(texts(inviteOgImage({ ownerNickname: "용우", sign: "leo", filled: 2, host: "x" })).join(" ")).toContain("용우님의 사자자리 2/6");
  });
});
