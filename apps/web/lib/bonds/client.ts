import { computeChart, isSignId, kstWeekId, sunSign, type BondBirth, type SignId } from "@starlog/core";
import { SITE } from "@/lib/config";

/**
 * Browser side of 별자리 인연: calls to /api/bonds/*, the Korean copy for their error codes, the
 * invite link and share, and two small per-device memories (my sun sign, the newest star seen).
 * Birth dates go only into POST bodies, never into URLs or storage.
 */

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; code: string; field?: string; retryAt?: string };

/** `path` under /api/bonds/, or an absolute path such as "/api/lucky". */
export async function bondsApi<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path.startsWith("/") ? path : `/api/bonds/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as ApiResult<T> | null;
    if (data && typeof data === "object" && "ok" in data) return data;
    return { ok: false, code: res.status === 404 ? "NOT_FOUND" : "SERVER" };
  } catch {
    return { ok: false, code: "NETWORK" };
  }
}

const MESSAGES: Record<string, string> = {
  BAD_CODE: "코드를 다시 확인해 주세요",
  CHOOSING: "다음 별자리를 고르는 중이에요. 조금 뒤에 다시 와 주세요",
  ALL_DONE: "열두 별자리가 모두 채워졌어요. 함께해 줘서 고마워요",
  SELF_JOIN: "내 초대코드로는 내 별자리에 참여할 수 없어요",
  ALREADY_JOINED: "이 기기로 이미 이 별자리에 참여했어요",
  DAILY_STAR_LIMIT: "오늘은 이 별자리에 별이 많이 들어왔어요. 내일 다시 참여해 주세요",
  FILLING_EXISTS: "이미 채우는 별자리가 있어요",
  SIGN_COMPLETED: "이미 완성한 별자리예요",
  NO_FILLING: "지금 채우는 별자리가 없어요",
  COOLDOWN: "새로 채우기는 한 시간에 한 번 할 수 있어요",
  INVITE_COOLDOWN: "코드는 한 시간에 다섯 번까지 새로 만들 수 있어요. 잠시 뒤에 다시 해 주세요",
  DAILY_ACTION_LIMIT: "오늘은 별을 지우거나 별자리를 바꾸는 일을 많이 했어요. 내일 다시 해 주세요",
  BAD_ORIGIN: "스타로그 화면에서 다시 시도해 주세요",
  NOT_FOUND: "찾을 수 없어요. 처음부터 다시 시도해 주세요",
  NO_OWNER: "별자리 인연을 먼저 시작해 주세요",
  RATE_LIMIT: "요청이 잠깐 많았어요. 1분 뒤에 다시 시도해 주세요",
  NETWORK: "연결이 잠시 불안정해요. 다시 시도해 주세요",
};

const FIELD_MESSAGES: Record<string, string> = {
  nickname: "이 닉네임은 쓸 수 없어요. 2~10자의 다른 별명을 지어 주세요",
  message: "한 줄은 40자 안에서, 다른 말로 남겨 주세요",
  birth: "생년월일을 다시 확인해 주세요",
};

/** For a failure no code explains: loading, unless the caller says what it was doing. */
const LOAD_FAILED = "지금은 별자리를 불러올 수 없어요. 잠시 뒤에 다시 시도해 주세요";
/** A friend's 별 되기 that failed for no known reason (F-12): it was the joining that failed, not a load. */
export const JOIN_FAILED = "별자리에 참여하지 못했어요. 잠시 뒤에 다시 시도해 주세요";

export function bondsMessage(result: { code: string; field?: string; retryAt?: string }, fallback: string = LOAD_FAILED): string {
  if (result.code === "BAD_INPUT") return (result.field && FIELD_MESSAGES[result.field]) || "입력한 내용을 다시 확인해 주세요";
  if (result.code === "COOLDOWN" && result.retryAt) return `${MESSAGES.COOLDOWN}. ${clock(Date.parse(result.retryAt))}부터 다시 할 수 있어요`;
  return MESSAGES[result.code] ?? fallback;
}

/** "오후 3:05" in Korean time. */
export function clock(ms: number): string {
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(ms);
}

/** "10월 1일" in Korean time. */
export function monthDay(ms: number): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(ms);
}

export const inviteUrl = (code: string) => `${SITE.url}/b/${code}`;

export type ShareOutcome = "shared" | "copied" | "failed" | "cancelled";

/**
 * The system share sheet where there is one (title, text and the link; never a file, so no app keeps an image and drops
 * the link); otherwise the link goes to the clipboard.
 */
export async function shareLink(text: string, url: string, title: string = SITE.nameKo): Promise<ShareOutcome> {
  const data = { title, text, url };
  if (typeof navigator.share === "function" && (typeof navigator.canShare !== "function" || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      if ((error as { name?: unknown } | null)?.name === "AbortError") return "cancelled";
    }
  }
  return copyText(url);
}

export async function copyText(text: string): Promise<"copied" | "failed"> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

// ---- per-device memories (best effort; private mode may refuse) ----

/** /lucky keeps this week's numbers on the device under this key (no birth date). */
export const LUCKY_STORE_KEY = "starlog.lucky";
const SUN_KEY = "starlog.bonds.sun";
const SEEN_KEY = "starlog.bonds.seen";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the badge just does not show
  }
}

/** The tropical sun sign of a birth date (lunar dates through their solar day), or null when invalid. */
export function sunSignOf(birth: BondBirth): SignId | null {
  try {
    if (birth.calendar === "solar") return sunSign(birth.month, birth.day);
    const chart = computeChart({ ...birth, time: null, gender: "female", place: { name: "서울", longitude: 126.978 } });
    const [, m, d] = chart.solarDate.split("-").map(Number) as [number, number, number];
    return sunSign(m, d);
  } catch {
    return null;
  }
}

export const rememberSunSign = (sign: SignId) => write(SUN_KEY, sign);
export function savedSunSign(): SignId | null {
  const value = read(SUN_KEY);
  return isSignId(value) ? value : null;
}

/** The newest star time this device has seen on the owner page (new stars sparkle until then). */
export const seenUntil = (): number => Number(read(SEEN_KEY)) || 0;
export const markSeen = (ms: number) => write(SEEN_KEY, String(ms));

/** This week's lucky numbers if /lucky already showed them on this device, else null. */
export function storedLuckyNumbers(): number[] | null {
  try {
    const value = JSON.parse(read(LUCKY_STORE_KEY) ?? "null") as { weekId?: string; numbers?: { n: number }[] } | null;
    if (!value || value.weekId !== kstWeekId(Date.now()) || !Array.isArray(value.numbers)) return null;
    return value.numbers.map((x) => x.n);
  } catch {
    return null;
  }
}
