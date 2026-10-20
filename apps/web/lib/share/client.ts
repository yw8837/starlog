import { kstDate } from "@/lib/kst";
import { postJson } from "@/lib/reading/api";

/**
 * 결과 공유 from the browser (app/api/share). The chapter's signed token and its reading go with
 * every call: the server checks them, so only the device that holds a reading can share or stop it.
 * The device remembers each reading's live link (by the chapter's id), so the share sheet can show it
 * again and deleting the reading can stop it.
 */

export interface ShareableChapter {
  /** the saved reading's id on this device (lib/storage/chapters.ts) */
  id: string;
  chapterToken: string;
  reading: unknown;
}

export type ShareLinkResult = { ok: true; url: string; imageUrl: string } | { ok: false; message: string };

const FAILED = "공유 링크를 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요.";

/** localStorage: {chapter id: share id} for the links this device made and has not stopped. */
const SHARES_KEY = "starlog.shares";

function knownIds(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SHARES_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Remembers (or, with null, forgets) a chapter's share id; storage that is blocked or full keeps nothing. */
function remember(chapterId: string, shareId: string | null) {
  try {
    const ids = knownIds();
    if (shareId) ids[chapterId] = shareId;
    else delete ids[chapterId];
    localStorage.setItem(SHARES_KEY, JSON.stringify(ids));
  } catch {
    // best effort: the share itself is made or stopped either way
  }
}

/** The live link this device made for the reading, or null. */
export function knownShareLink(chapter: Pick<ShareableChapter, "id">): { url: string; imageUrl: string } | null {
  const id = knownIds()[chapter.id];
  return typeof id === "string" && /^[a-z0-9]{12}$/.test(id) ? shareUrls(`/s/${id}`) : null;
}

/** A shared reading's address on this site, and its link-preview image. */
export function shareUrls(path: string, origin: string = window.location.origin): { url: string; imageUrl: string } {
  const id = path.replace(/^\/s\//, "");
  return { url: new URL(path, origin).toString(), imageUrl: new URL(`/api/og/share/${id}`, origin).toString() };
}

/** Makes (or finds) the reading's share link; the server takes the design from the signed chapter. */
export async function createShareLink(chapter: ShareableChapter): Promise<ShareLinkResult> {
  const result = await postJson<{ id: string; path: string }>("/api/share", { chapterToken: chapter.chapterToken, reading: chapter.reading });
  if (!result.ok) return { ok: false, message: result.error.message || FAILED };
  remember(chapter.id, result.data.id);
  return { ok: true, ...shareUrls(result.data.path) };
}

/** Stops sharing the reading: its link stops answering. False when it could not be stopped. */
export async function stopShareLink(chapter: ShareableChapter): Promise<boolean> {
  try {
    const response = await fetch("/api/share", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ chapterToken: chapter.chapterToken, reading: chapter.reading }),
    });
    if (response.ok) remember(chapter.id, null);
    return response.ok;
  } catch {
    return false;
  }
}

/** A deleted reading takes its link down, when this device made one. Fire and forget: never throws. */
export function stopKnownShareLink(chapter: ShareableChapter): void {
  if (knownShareLink(chapter)) void stopShareLink(chapter);
}

/** 오늘의 한 장 among the links this device remembers: one per KST day (the device keeps only today's card). */
const dailyKey = (now: number) => `daily:${kstDate(now)}`;

/** The live link this device made for today's 오늘의 한 장, or null. */
export function knownDailyShareLink(now: number = Date.now()): { url: string; imageUrl: string } | null {
  return knownShareLink({ id: dailyKey(now) });
}

/**
 * Makes (or finds) the link to today's 오늘의 한 장 (app/api/share/daily). Nothing of the reading is
 * sent: the server makes the copy from the card it stored for this device.
 */
export async function createDailyShareLink(): Promise<ShareLinkResult> {
  const result = await postJson<{ id: string; path: string }>("/api/share/daily", {});
  if (!result.ok) return { ok: false, message: result.error.message || FAILED };
  remember(dailyKey(Date.now()), result.data.id);
  return { ok: true, ...shareUrls(result.data.path) };
}

/**
 * Stops sharing this device's 오늘의 한 장 of `day` (KST, today by default; a past day's too, review 2026-10-20 A6): its
 * link stops answering. False when it could not be stopped.
 */
export async function stopDailyShareLink(day: string = kstDate(Date.now())): Promise<boolean> {
  try {
    const response = await fetch("/api/share/daily", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ day }),
    });
    if (response.ok) remember(`daily:${day}`, null);
    return response.ok;
  } catch {
    return false;
  }
}
