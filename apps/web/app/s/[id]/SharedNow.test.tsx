// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SITE } from "@/lib/config";
import { buildNowSharePayload, type SharedNow } from "@/lib/share/payload";
import { shareOgData } from "@/lib/share/og";
import { NOW_TYPES, nowType } from "@/lib/tarotType";
import { assertVoice } from "@/lib/voice/banned";
import { SharedNowView } from "./SharedKinds";

/** 별명 이어뽑기 on the receiving side (spec 2026-11-26 beyond trend §1, §7): the shared /s/<id> now-view and its picture. */

const CARD = { cardId: "major-17-star", orientation: "reversed" } as const;
const nicknamed = buildNowSharePayload({ ...CARD, pick: 1, deck: "starlog", nick: true })!;
const plain = buildNowSharePayload({ ...CARD, pick: 1, deck: "starlog" })!;
const slug = nowType(CARD.cardId, CARD.orientation);
const nickBox = () => screen.queryByRole("region", { name: "친구가 받은 별명" });

afterEach(cleanup);

describe("the shared 지금의 한 장 with a nickname", () => {
  it("shows the nickname large, then 나도 한 장 뽑기 to /now?with=<slug> and the line that nothing goes back", () => {
    render(<SharedNowView share={nicknamed} />);
    const box = nickBox()!;
    expect(box).toBeTruthy();
    const name = within(box).getByText(NOW_TYPES[slug].name);
    const button = within(box).getByRole("link", { name: /나도 한 장 뽑기/ });
    expect(button.getAttribute("href")).toBe(`/now?with=${slug}`);
    expect(within(box).getByText("로그인 없이 무료. 친구한테 내 결과가 가지는 않아요.")).toBeTruthy();
    expect(name.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Near the top: before the card and its why.
    expect(box.compareDocumentPosition(screen.getByText(nicknamed.why)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The way in at the end of the page carries the nickname too, so both buttons lead to the same place.
    expect(screen.getByRole("link", { name: /나도 한 장 뽑아 보기/ }).getAttribute("href")).toBe(`/now?with=${slug}`);
    for (const node of box.querySelectorAll("p, a")) assertVoice(node.textContent ?? "");
  });

  it("stays as it was without a nickname, and while handoff is off (§6)", () => {
    render(<SharedNowView share={plain} />);
    expect(nickBox()).toBeNull();
    expect(screen.queryByText(NOW_TYPES[slug].name)).toBeNull();
    expect(screen.getByRole("link", { name: /나도 한 장 뽑아 보기/ }).getAttribute("href")).toBe("/now");
    cleanup();
    const beyond = SITE.features.beyond as { handoff: boolean };
    beyond.handoff = false;
    try {
      render(<SharedNowView share={nicknamed} />);
      expect(nickBox()).toBeNull();
      expect(document.querySelector('a[href*="with="]')).toBeNull();
    } finally {
      beyond.handoff = true;
    }
  });
});

describe("the shared 지금의 한 장's picture", () => {
  const origin = "https://starlog.yeolmaeapps.kr";

  it("draws the nickname as its headline, the card and its line under it", () => {
    const data = shareOgData(nicknamed as SharedNow, origin);
    expect(data.label).toBe("친구가 받은 별명");
    expect(data.headline).toBe(NOW_TYPES[slug].name);
    const body = `별(역) · ${nicknamed.answer}`;
    expect(data.body).toBe(body.length > 72 ? `${body.slice(0, 71)}…` : body);
    expect(data.cards).toEqual([{ cardId: CARD.cardId, src: `${origin}/cards/og/starlog/${CARD.cardId}.jpg`, reversed: true }]);
  });

  it("is as before without a nickname, and while handoff is off", () => {
    const before = { label: "친구가 뽑은 지금의 한 장", headline: "별(역)" };
    expect(shareOgData(plain, origin)).toMatchObject(before);
    const beyond = SITE.features.beyond as { handoff: boolean };
    beyond.handoff = false;
    try {
      expect(shareOgData(nicknamed, origin)).toMatchObject(before);
    } finally {
      beyond.handoff = true;
    }
  });
});
