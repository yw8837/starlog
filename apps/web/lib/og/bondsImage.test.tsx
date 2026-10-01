import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { CONSTELLATIONS } from "@starlog/core";
import { boxesOverlap } from "@/components/bonds/art/labels";
import { bondsShareImage, bondsShareText, type BondsShareData } from "./bondsImage";
import { inviteOgImage } from "./cardsImage";

const NAMES = ["민지", "하늘이", "도윤", "서아별", "별빛나리", "지우", "Momo"];

function walk(node: ReactNode, visit: (el: ReactElement<{ style?: Record<string, unknown>; children?: ReactNode }>) => void): void {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
  if (!isValidElement(node)) return;
  const el = node as ReactElement<{ style?: Record<string, unknown>; children?: ReactNode }>;
  visit(el);
  walk(el.props.children, visit);
}

function texts(node: ReactNode): string[] {
  const out: string[] = [];
  const add = (child: ReactNode) => {
    if (typeof child === "string" || typeof child === "number") out.push(String(child));
    else if (Array.isArray(child)) child.forEach(add);
  };
  walk(node, (el) => add(el.props.children));
  return out;
}

/** The nickname pills: absolutely placed boxes whose only child is a string. */
function pillBoxes(node: ReactNode) {
  const boxes: { x: number; y: number; w: number; h: number; text: string }[] = [];
  walk(node, (el) => {
    const st = el.props.style;
    if (st?.position === "absolute" && typeof st.width === "number" && st.borderRadius === 9999 && typeof el.props.children === "string") {
      boxes.push({ x: st.left as number, y: st.top as number, w: st.width, h: st.height as number, text: el.props.children });
    }
  });
  return boxes;
}

describe("constellation share image", () => {
  for (const size of ["feed", "story"] as const) {
    it(`puts every friend's nickname on its own star, without overlaps (${size}, all 12 signs)`, () => {
      for (const c of CONSTELLATIONS) {
        const data: BondsShareData = {
          sign: c.id, nicknames: NAMES.slice(0, c.slots), total: 400, ownerNickname: "용우", completedAt: Date.UTC(2026, 9, 1), host: "starlog.yeolmaeapps.kr",
        };
        const tree = bondsShareImage(data, size);
        const pills = pillBoxes(tree);
        expect(pills.map((p) => p.text)).toEqual(NAMES.slice(0, c.slots));
        for (const [i, a] of pills.entries()) for (const b of pills.slice(i + 1)) expect(boxesOverlap(a, b), `${c.id}: ${a.text}/${b.text}`).toBe(false);
      }
    });
  }

  it("shows the sign, the total, the owner and the date, and nothing else about the friends", () => {
    const data: BondsShareData = {
      sign: "aries", nicknames: ["민지", "하늘", "도윤", "서아"], total: 342, ownerNickname: "용우", completedAt: Date.UTC(2026, 9, 1, 3), host: "starlog.yeolmaeapps.kr",
    };
    const all = texts(bondsShareImage(data, "feed")).join(" ");
    for (const part of ["양자리", "Aries", "342", "용우님의 양자리", "2026년 10월 1일 완성", "starlog.yeolmaeapps.kr"]) expect(all).toContain(part);
    // the only numbers are the total and the date
    expect(all.match(/\d+/g)!.sort()).toEqual(["1", "10", "2026", "342"].sort());
    const subset = bondsShareText(data);
    for (const ch of Array.from(all.replace(/\s/g, ""))) expect(subset.serif + subset.sans).toContain(ch);
  });

  it("draws the generic invite card for an unknown code", () => {
    const all = texts(inviteOgImage({ ownerNickname: null, sign: null, filled: 0, host: "starlog.yeolmaeapps.kr" })).join(" ");
    expect(all).toContain("별자리 인연 초대");
    expect(texts(inviteOgImage({ ownerNickname: "용우", sign: "leo", filled: 2, host: "x" })).join(" ")).toContain("용우님의 사자자리 2/6");
  });
});
