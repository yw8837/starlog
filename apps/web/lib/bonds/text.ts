/**
 * Input rules for 별자리 인연: invite codes, nicknames (shown in the public ranking and on share
 * images) and the optional one-line message. Pure; shared by the service and the forms.
 */

/** No look-alikes (0 O 1 I L); codes are case-insensitive. */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 6;
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 10;
export const MESSAGE_MAX = 40;

/** A random code; rejection sampling keeps every character equally likely. */
export function newInviteCode(): string {
  const limit = 256 - (256 % INVITE_ALPHABET.length);
  let code = "";
  while (code.length < INVITE_CODE_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte >= limit) continue;
      code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
      if (code.length === INVITE_CODE_LENGTH) break;
    }
  }
  return code;
}

const CODE_PATTERN = new RegExp(`^[${INVITE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

/** The canonical code (upper case, spaces and hyphens dropped), or null when it cannot be one. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 32) return null;
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export type TextCheck<T> = { ok: true; value: T } | { ok: false; reason: "LENGTH" | "BLOCKED" };

// Control and invisible formatting characters (zero-width, bidi overrides) never belong in a name.
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/;
const LINK = /https?:|www\.|\.(com|net|kr|io|me|ly)\b/i;
/** Matched after spaces and punctuation are removed, lower-cased. A small list; the owner can remove any star. */
const BLOCKED_WORDS = [
  "시발", "씨발", "씨바", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "븅신", "좆", "존나", "ㅈㄴ", "개새끼", "새끼", "지랄", "ㅈㄹ", "미친놈", "미친년",
  "닥쳐", "꺼져", "염병", "엿먹", "섹스", "야동", "보지", "자지",
  "fuck", "shit", "bitch", "sex", "porn", "dick", "pussy",
  "운영자", "관리자", "스타로그", "starlog", "admin",
];

function isBlocked(text: string): boolean {
  if (CONTROL.test(text) || LINK.test(text)) return true;
  const squeezed = text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  return BLOCKED_WORDS.some((word) => squeezed.includes(word));
}

/** Trimmed, NFC, inner runs of whitespace as one space. */
function tidy(raw: string): string {
  return raw.normalize("NFC").trim().replace(/[ \t 　]+/g, " ");
}

const length = (text: string) => Array.from(text).length;

export function checkNickname(raw: unknown): TextCheck<string> {
  if (typeof raw !== "string") return { ok: false, reason: "LENGTH" };
  if (CONTROL.test(raw)) return { ok: false, reason: "BLOCKED" };
  const value = tidy(raw);
  const n = length(value);
  if (n < NICKNAME_MIN || n > NICKNAME_MAX) return { ok: false, reason: "LENGTH" };
  return isBlocked(value) ? { ok: false, reason: "BLOCKED" } : { ok: true, value };
}

/** The optional one-line message: null when empty. */
export function checkMessage(raw: unknown): TextCheck<string | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, reason: "LENGTH" };
  if (CONTROL.test(raw.replace(/\n/g, " "))) return { ok: false, reason: "BLOCKED" };
  const value = tidy(raw.replace(/\s*\n\s*/g, " "));
  if (value === "") return { ok: true, value: null };
  if (length(value) > MESSAGE_MAX) return { ok: false, reason: "LENGTH" };
  return isBlocked(value) ? { ok: false, reason: "BLOCKED" } : { ok: true, value };
}
