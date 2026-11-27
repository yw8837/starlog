// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { SITE } from "./config";
import {
  FLOW_KEY,
  FLOW_LOGIN_BACKUP_KEY,
  NOW_PATH,
  backupFlowForLogin,
  newQuestionOnEntry,
  restoreFlowAfterLogin,
  sanitizeFlow,
  saveFlow,
  type FlowState,
} from "./flowState";
import { CUSTOM_MAX } from "./question";

/** 이어 읽기 in the tarot flow (spec 2026-11-26 beyond trend §3): /now's card and worry, kept in the browser's flow only. */

const KEEP = { cardId: "major-17-star", orientation: "reversed" } as const;
const base: FlowState = { who: "me", topicId: "money", when: "month", conditions: {}, note: "" };
const DRAW = {
  templateId: "self-flow",
  drawToken: "signed.token",
  cards: [
    { position: "지금의 나", ...KEEP },
    { position: "필요한 것", cardId: "major-09-hermit", orientation: "upright" },
    { position: "이 시기의 흐름", cardId: "wands-01", orientation: "upright" },
  ],
} as const;

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("the kept card in the flow", () => {
  it("keeps a known card with its side and a typed worry that fits 무엇 직접 쓰기, and nothing else", () => {
    expect(sanitizeFlow({ ...base, keep: { ...KEEP, worry: "먼저 연락해도 될까?", extra: 1 } }).keep).toEqual({ ...KEEP, worry: "먼저 연락해도 될까?" });
    expect(sanitizeFlow({ ...base, keep: KEEP }).keep).toEqual(KEEP);
    // Kept without 누구 too: the builder asks 누구 with the card already laid.
    expect(sanitizeFlow({ keep: KEEP }).keep).toEqual(KEEP);
  });

  it("drops an unknown card, a wrong side or a malformed keep, and a worry that is blank or longer than 직접 쓰기 takes", () => {
    for (const keep of [{ cardId: "major-99-nothing", orientation: "upright" }, { cardId: KEEP.cardId, orientation: "sideways" }, { cardId: KEEP.cardId }, "major-17-star", null]) {
      expect(sanitizeFlow({ ...base, keep }).keep, JSON.stringify(keep)).toBeUndefined();
    }
    expect(sanitizeFlow({ ...base, keep: { ...KEEP, worry: "   " } }).keep).toEqual(KEEP);
    expect(sanitizeFlow({ ...base, keep: { ...KEEP, worry: "가".repeat(CUSTOM_MAX + 1) } }).keep).toEqual(KEEP);
    expect(sanitizeFlow({ ...base, keep: { ...KEEP, worry: 42 } }).keep).toEqual(KEEP);
  });

  it("forgets the card while carry is off (§6): the flow is today's", () => {
    const beyond = SITE.features.beyond as { carry: boolean };
    beyond.carry = false;
    try {
      expect(sanitizeFlow({ ...base, keep: KEEP }).keep).toBeUndefined();
    } finally {
      beyond.carry = true;
    }
  });

  it("goes along with the login backup and comes back with it (the draw it was dealt in too)", () => {
    const flow = sanitizeFlow({ ...base, keep: KEEP, draw: DRAW });
    saveFlow(flow);
    backupFlowForLogin(flow, "nonce-1");
    expect(JSON.parse(localStorage.getItem(FLOW_LOGIN_BACKUP_KEY)!).flow.keep).toEqual(KEEP);
    sessionStorage.removeItem(FLOW_KEY);
    saveFlow(base);
    expect(restoreFlowAfterLogin({ login: "ok", resume: "nonce-1" })).toBe(true);
    const back = JSON.parse(sessionStorage.getItem(FLOW_KEY)!) as FlowState;
    expect(back.keep).toEqual(KEEP);
    expect(back.draw?.cards[0]).toMatchObject(KEEP);
  });

  it("starts a new question on entry except on a move inside the flow or /now's 이어 읽기 move that wrote a card", () => {
    expect(NOW_PATH).toBe("/now");
    expect(newQuestionOnEntry(true, "/tarot/new", base)).toBe(false);
    expect(newQuestionOnEntry(false, "/", base)).toBe(true);
    expect(newQuestionOnEntry(false, NOW_PATH, { ...base, keep: KEEP })).toBe(false);
    // From /now without a kept card (the plain link, or carry off): as before.
    expect(newQuestionOnEntry(false, NOW_PATH, base)).toBe(true);
    // A kept card from earlier, reached from anywhere else: a new question.
    expect(newQuestionOnEntry(false, "/", { ...base, keep: KEEP })).toBe(true);
    expect(newQuestionOnEntry(false, null, { ...base, keep: KEEP })).toBe(true);
  });
});
