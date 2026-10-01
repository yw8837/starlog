import { describe, expect, it } from "vitest";
import { INVITE_ALPHABET, checkMessage, checkNickname, newInviteCode, normalizeCode } from "./text";

describe("bonds text rules", () => {
  it("makes 6-char codes without look-alike characters and normalizes input", () => {
    for (let i = 0; i < 200; i++) expect(newInviteCode()).toMatch(new RegExp(`^[${INVITE_ALPHABET}]{6}$`));
    expect(INVITE_ALPHABET).not.toMatch(/[01OIL]/);
    expect(normalizeCode(" k7m4qx ")).toBe("K7M4QX");
    expect(normalizeCode("k7m-4qx")).toBe("K7M4QX");
    expect(normalizeCode("K7M4Q")).toBeNull();
    expect(normalizeCode("K7M4Q0")).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });

  it("accepts 2-10 char nicknames and optional 40-char messages", () => {
    expect(checkNickname(" 용우 ")).toEqual({ ok: true, value: "용우" });
    expect(checkNickname("가")).toEqual({ ok: false, reason: "LENGTH" });
    expect(checkNickname("가".repeat(11))).toEqual({ ok: false, reason: "LENGTH" });
    expect(checkMessage("")).toEqual({ ok: true, value: null });
    expect(checkMessage("   ")).toEqual({ ok: true, value: null });
    expect(checkMessage(undefined)).toEqual({ ok: true, value: null });
    expect(checkMessage("가".repeat(40))).toEqual({ ok: true, value: "가".repeat(40) });
    expect(checkMessage("가".repeat(41))).toEqual({ ok: false, reason: "LENGTH" });
  });

  it("blocks control characters, links, impersonation and swear words (spaced out too)", () => {
    expect(checkNickname("용\u0000우")).toEqual({ ok: false, reason: "BLOCKED" });
    expect(checkNickname("운영자")).toEqual({ ok: false, reason: "BLOCKED" });
    expect(checkNickname("시 발")).toEqual({ ok: false, reason: "BLOCKED" });
    expect(checkNickname("FUCK")).toEqual({ ok: false, reason: "BLOCKED" });
    expect(checkMessage("여기로 와 http://spam.example")).toEqual({ ok: false, reason: "BLOCKED" });
    expect(checkMessage("늘 고마워, 병신 같은 소리지만")).toEqual({ ok: false, reason: "BLOCKED" });
    expect(checkMessage("늘 고마워!")).toEqual({ ok: true, value: "늘 고마워!" });
    expect(checkNickname(12)).toEqual({ ok: false, reason: "LENGTH" });
  });

  it("collapses inner whitespace", () => {
    expect(checkNickname("별   하나")).toEqual({ ok: true, value: "별 하나" });
  });
});
