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

/** `PHONE`: looks like a phone number (a nickname only) */
export type TextCheck<T> = { ok: true; value: T } | { ok: false; reason: "LENGTH" | "BLOCKED" | "PHONE" };

/** Control characters: a name or message with one is refused. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
/**
 * Invisible or blank-looking characters that fake an empty or look-alike name: Hangul fillers
 * (U+3164, U+115F, U+1160, U+FFA0), braille blank, soft hyphen, grapheme joiner, zero-width and bidi
 * controls, and tag characters. They are removed before anything is checked. The zero-width joiner (U+200D) stays only
 * inside an emoji sequence (👩‍👩‍👧‍👦 is one picture: QA 2026-10-27 saw it split); anywhere else it goes too.
 */
const INVISIBLE = /[\u00ad\u034f\u115f\u1160\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2069\u2800\u3164\ufeff\uffa0]|[\u{E0000}-\u{E007F}]/gu;
const STRAY_JOINER = /\u200d(?!\p{Extended_Pictographic})|(?<![\p{Extended_Pictographic}\ufe0f])\u200d/gu;
const LINK = /https?:|www\.|\.(com|net|kr|io|me|ly)\b/i;
/** Compared folded (see `fold`). A small list; the owner can remove any star. */
const PROFANITY = [
  "시발", "씨발", "씨바", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "븅신", "좆", "존나", "ㅈㄴ", "개새끼", "지랄", "ㅈㄹ", "미친놈", "미친년",
  "닥쳐", "꺼져", "염병", "엿먹", "섹스", "야동",
  "fuck", "shit", "bitch", "sex", "porn", "dick", "pussy",
];
/** Only in public names: words that are fine inside a sentence ("보지 뭐") or that impersonate the service. */
const NICKNAME_ONLY = ["보지", "자지", "운영자", "관리자", "스타로그", "starlog", "admin"];

/**
 * The form a text is compared in: NFKC (fullwidth and other look-alikes folded; Hangul compatibility
 * jamo become conjoining jamo, on both sides), lower case, no spaces or punctuation. Only for checks:
 * what is stored keeps the user's own characters ("ㅋㅋㅋ" stays U+314B).
 */
const fold = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

function isBlocked(text: string, words: readonly string[]): boolean {
  if (LINK.test(text.normalize("NFKC"))) return true;
  const folded = fold(text);
  return words.some((word) => folded.includes(fold(word)));
}

/** NFC, invisible characters removed, trimmed, inner runs of whitespace as one space. */
function tidy(raw: string): string {
  return raw.normalize("NFC").replace(INVISIBLE, "").replace(STRAY_JOINER, "").trim().replace(/[ \t\u00a0\u3000]+/g, " ");
}

const length = (text: string) => Array.from(text).length;
/** Seven or more digits in a row (separators ignored) look like a phone number: not in a public name. */
const PHONE_LIKE = (text: string) => /\d{7,}/.test(text.normalize("NFKC").replace(/[\s.\-_()]/g, ""));

export function checkNickname(raw: unknown): TextCheck<string> {
  if (typeof raw !== "string") return { ok: false, reason: "LENGTH" };
  if (CONTROL.test(raw)) return { ok: false, reason: "BLOCKED" };
  const value = tidy(raw);
  // a phone number is said as one, even when it is also too long
  if (PHONE_LIKE(value)) return { ok: false, reason: "PHONE" };
  const n = length(value);
  if (n < NICKNAME_MIN || n > NICKNAME_MAX) return { ok: false, reason: "LENGTH" };
  if (isBlocked(value, [...PROFANITY, ...NICKNAME_ONLY])) return { ok: false, reason: "BLOCKED" };
  return { ok: true, value };
}

/** The optional one-line message: null when empty. */
export function checkMessage(raw: unknown): TextCheck<string | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, reason: "LENGTH" };
  if (CONTROL.test(raw.replace(/\n/g, " "))) return { ok: false, reason: "BLOCKED" };
  const value = tidy(raw.replace(/\s*\n\s*/g, " "));
  if (value === "") return { ok: true, value: null };
  if (length(value) > MESSAGE_MAX) return { ok: false, reason: "LENGTH" };
  return isBlocked(value, PROFANITY) ? { ok: false, reason: "BLOCKED" } : { ok: true, value };
}

/** Why a nickname cannot be used, as the forms say it before anything is sent (QA 2026-10-27). */
export function nicknameProblem(raw: string): string | null {
  const check = checkNickname(raw);
  if (check.ok) return null;
  if (check.reason === "LENGTH") return `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 지어 주세요`;
  if (check.reason === "PHONE") return "전화번호처럼 보이는 별명은 쓸 수 없어요. 다른 별명을 지어 주세요";
  return "쓸 수 없는 별명이에요. 욕설, 운영자처럼 보이는 이름, 링크 없이 다른 별명을 지어 주세요";
}

const ORDINALS = ["첫", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "열한", "열두"];
/** "첫 번째 별", "두 번째 별" (QA 2026-10-27: not "1번째 별"). */
export const ordinalStar = (n: number) => (ORDINALS[n - 1] ? `${ORDINALS[n - 1]} 번째 별` : `${n}번째 별`);
