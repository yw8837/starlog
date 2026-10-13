import type { FrontDeck } from "@/lib/deck";
import { postJson } from "@/lib/reading/api";

/**
 * 결과 공유 from the browser (app/api/share). The chapter's signed token and its reading go with
 * every call: the server checks them, so only the device that holds a reading can share or stop it.
 */

export interface ShareableChapter {
  chapterToken: string;
  reading: unknown;
}

export type ShareLinkResult = { ok: true; url: string; imageUrl: string } | { ok: false; message: string };

const FAILED = "공유 링크를 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요.";

/** A shared reading's address on this site, and its link-preview image. */
export function shareUrls(path: string, origin: string = window.location.origin): { url: string; imageUrl: string } {
  const id = path.replace(/^\/s\//, "");
  return { url: new URL(path, origin).toString(), imageUrl: new URL(`/api/og/share/${id}`, origin).toString() };
}

/** Makes (or finds) the reading's share link. */
export async function createShareLink(chapter: ShareableChapter, deck: FrontDeck): Promise<ShareLinkResult> {
  const result = await postJson<{ id: string; path: string }>("/api/share", { chapterToken: chapter.chapterToken, reading: chapter.reading, deck });
  if (!result.ok) return { ok: false, message: result.error.message || FAILED };
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
    return response.ok;
  } catch {
    return false;
  }
}
