// @vitest-environment jsdom
import { DEFAULT_REVERSAL_RATE, createDeck } from "@starlog/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE } from "@/lib/config";
import { drawNow } from "@/lib/decision";
import { FLOW_KEY } from "@/lib/flowState";
import { ENTRY_TAROT_HREF, NEW_TAROT_HREF } from "@/lib/freshStart";
import { NOW_TYPES, nowType, pairLine, type NowTypeSlug } from "@/lib/tarotType";
import { assertVoice } from "@/lib/voice/banned";
import { NowOracle } from "./NowOracle";

/** 지금의 한 장 with 별명 이어뽑기 (§1) and 이어 읽기 (§3), spec 2026-11-26 beyond trend. */

const tableCards = () => screen.getAllByRole("button", { name: /^카드 \d+$/ });

function settle() {
  for (let i = 0; i < 3; i++) act(() => vi.runAllTimers());
}

/** Types the worry, picks the table card in `slot` and returns the draw the page shows for it. */
function draw(worry: string, slot = 6, seed = "now-seed-first") {
  if (worry) fireEvent.change(screen.getByLabelText("고민 한 줄"), { target: { value: worry } });
  const card = tableCards()[slot]!;
  const deckIndex = Number(card.dataset.card);
  fireEvent.click(card);
  settle();
  return drawNow(createDeck(seed, DEFAULT_REVERSAL_RATE), deckIndex, 0.5, "starlog");
}

/** /now opened from a friend's link (or not). */
function open(search = "") {
  window.history.replaceState(null, "", `/now${search}`);
  render(<NowOracle instant />);
}

const pairBox = () => screen.queryByRole("region", { name: "둘의 별명" });
const SPICY = "오늘 먼저 연락해도 될까?";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_SPLIT_HOSTS", "");
  // Every deck of these tests is the same one (several screens open per test).
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => "now-seed-first" as ReturnType<Crypto["randomUUID"]>);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
  localStorage.clear();
});

describe("둘의 별명 on /now?with=", () => {
  it("puts the friend's nickname left, mine right, one fixed line, and the share as 내 별명 보내기", () => {
    const friend: NowTypeSlug = "now-earth-rethink";
    open(`?with=${friend}`);
    const expected = draw(SPICY);
    const mine = nowType(expected.cardId, expected.orientation);
    const box = pairBox()!;
    expect(box).toBeTruthy();
    const sides = [...box.querySelectorAll("[class*=pairSide]")].map((side) => side.textContent);
    expect(sides).toEqual([`친구${NOW_TYPES[friend].name}`, `나${NOW_TYPES[mine].name}`]);
    expect(within(box).getByText(pairLine(friend, mine))).toBeTruthy();
    // The existing share, named for what it sends; no second share button under the actions.
    expect(within(box).getByRole("button", { name: "내 별명 보내기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "공유하기" })).toBeNull();
    // Under 타로로 판정, before the way on. No score, no verdict about the two.
    const verdict = screen.getByRole("region", { name: "타로로 판정" });
    expect(verdict.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.compareDocumentPosition(screen.getByRole("button", { name: "한 번 더 뽑기" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(box.textContent).not.toMatch(/점|궁합|%/);
    for (const node of box.querySelectorAll("p, button")) assertVoice(node.textContent ?? "");
  });

  it("is not there without a nickname of mine (a heavy worry), for crisis words, or for a slug that is not one of the 12", () => {
    open("?with=now-fire-go");
    draw("수술 받아도 될까");
    expect(pairBox()).toBeNull();
    expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();
    cleanup();
    open("?with=now-fire-go");
    draw("요즘 살고 싶지 않아요");
    expect(pairBox()).toBeNull();
    cleanup();
    for (const bad of ["now-fire", "NOW-FIRE-GO", "<script>", ""]) {
      open(`?with=${encodeURIComponent(bad)}`);
      draw(SPICY);
      expect(pairBox(), bad).toBeNull();
      expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();
      cleanup();
    }
  });

  it("is not there while handoff is off (§6)", () => {
    const beyond = SITE.features.beyond as { handoff: boolean };
    beyond.handoff = false;
    try {
      open("?with=now-fire-go");
      draw(SPICY);
      expect(pairBox()).toBeNull();
      expect(screen.getByRole("button", { name: "공유하기" })).toBeTruthy();
    } finally {
      beyond.handoff = true;
    }
  });
});

describe("이 카드로 이어 읽기 on /now", () => {
  it("writes the card and the worry into the flow (never the address) and opens the builder", () => {
    open();
    const expected = draw(SPICY);
    const carry = screen.getByRole("link", { name: /이 카드로 이어 읽기 · 타로 3장/ });
    expect(carry.getAttribute("href")).toBe(ENTRY_TAROT_HREF);
    expect(carry.getAttribute("href")).not.toMatch(/\?/);
    fireEvent.click(carry);
    const flow = JSON.parse(sessionStorage.getItem(FLOW_KEY)!);
    expect(flow.keep).toEqual({ cardId: expected.cardId, orientation: expected.orientation, worry: SPICY });
    expect(flow.who).toBeUndefined();
    expect(flow.draw).toBeUndefined();
  });

  it("carries the card alone when nothing was typed, or when the worry is longer than 무엇 직접 쓰기 takes", () => {
    open();
    const expected = draw("");
    fireEvent.click(screen.getByRole("link", { name: /이 카드로 이어 읽기/ }));
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY)!).keep).toEqual({ cardId: expected.cardId, orientation: expected.orientation });
    cleanup();
    sessionStorage.clear();
    open();
    const long = "회사 동료가 자꾸 내 일을 떠넘기는데 이번에는 꼭 말해야 할까?";
    expect(long.length).toBeGreaterThan(30);
    draw(long);
    fireEvent.click(screen.getByRole("link", { name: /이 카드로 이어 읽기/ }));
    expect(JSON.parse(sessionStorage.getItem(FLOW_KEY)!).keep.worry).toBeUndefined();
  });

  it("keeps the old 카드 3장으로 보기 for crisis words, and everywhere while carry is off (§6)", () => {
    open();
    draw("요즘 살고 싶지 않아요");
    expect(screen.getByRole("link", { name: /카드 3장으로 보기/ }).getAttribute("href")).toBe(NEW_TAROT_HREF);
    expect(screen.queryByRole("link", { name: /이어 읽기/ })).toBeNull();
    cleanup();
    const beyond = SITE.features.beyond as { carry: boolean };
    beyond.carry = false;
    try {
      open();
      draw(SPICY);
      expect(screen.getByRole("link", { name: /카드 3장으로 보기/ }).getAttribute("href")).toBe(NEW_TAROT_HREF);
      expect(screen.queryByRole("link", { name: /이어 읽기/ })).toBeNull();
    } finally {
      beyond.carry = true;
    }
  });
});
