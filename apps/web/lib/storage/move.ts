import { postJson } from "@/lib/reading/api";
import { createLocalStore } from "@/lib/sessionStore";
import { linkServerId, type StoredChapter } from "./chapters";

/**
 * Account sync, the device side: readings this device kept move into the account only when its user asks (내 기록,
 * 내 정보), from the privacy revision of SYNC_REVISION_DATE (lib/legal.ts). Nothing of a record leaves the device before
 * that: then only its token and reading go (a saju record's teaser labels too), and the server rebuilds the account copy
 * from what it can vouch for (app/api/readings/move). A record it will not take stays here, and is offered no more.
 */

/** Records per request (lib/readings/move.ts MOVE_BATCH). */
const BATCH = 5;

/**
 * kept: records never offered again: the server would not take them, or their account copy was erased on request (계정에
 * 보관한 풀이 모두 지우기: moving them back would undo what the user asked); later: records the user put the offer off for.
 */
export interface MoveMarks {
  kept: string[];
  later: string[];
}

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
const marksStore = createLocalStore<MoveMarks>("starlog.move", (value) =>
  typeof value === "object" && value !== null ? { kept: ids((value as MoveMarks).kept), later: ids((value as MoveMarks).later) } : null,
);
const NO_MARKS: MoveMarks = { kept: [], later: [] };

export const moveMarks = (): MoveMarks => marksStore.read() ?? NO_MARKS;
export const useMoveMarks = (): MoveMarks => marksStore.useValue() ?? NO_MARKS;
export const clearMoveMarks = () => marksStore.clear();

/** After a logout: the next login offers again what was put off (what the server would not take stays marked). */
export function forgetPutOff(): void {
  const marks = marksStore.read();
  if (marks?.later.length) marksStore.save({ ...marks, later: [] });
}

/** This device's own standard tarot and saju records with a token (a premium reading is in the account from the start). */
export const isMovable = (chapter: StoredChapter): boolean => !chapter.serverId && (chapter.kind === "tarot" || chapter.kind === "saju") && chapter.chapterToken !== "";

/** What can be moved now: movable, and not one the server already would not take. */
export const movableNow = (chapters: readonly StoredChapter[], marks: MoveMarks): StoredChapter[] =>
  chapters.filter((chapter) => isMovable(chapter) && !marks.kept.includes(chapter.id));

/** These records stay on this device for good (sync.ts deleteAccountReadings: their account copies were erased). */
export function keepOnDevice(chapters: readonly StoredChapter[]): void {
  if (chapters.length === 0) return;
  const marks = moveMarks();
  marksStore.save({ ...marks, kept: [...new Set([...marks.kept, ...chapters.map((c) => c.id)])] });
}

/** 나중에: these records are not offered again (a record opened later is). */
export function putOffMove(chapters: readonly StoredChapter[]): void {
  const marks = moveMarks();
  marksStore.save({ ...marks, later: [...new Set([...marks.later, ...chapters.map((c) => c.id)])] });
}

const itemOf = (chapter: StoredChapter) => ({
  id: chapter.id,
  chapterToken: chapter.chapterToken,
  reading: chapter.reading,
  ...(chapter.kind === "saju" ? { title: chapter.title, summary: chapter.summary } : {}),
});

type MoveAnswer = { moved?: Array<{ id: string; readingId: string }>; kept?: Array<{ id: string }> };

/**
 * Moves `chapters` into the account, a few at a time: each one moved takes its account id (so it shows on every device and
 * leaves this one on a logout, like any account reading), each one kept is marked. Stops at the first request that fails;
 * what moved before it stays moved, and a retry sends the rest (the server finds the same rows again).
 */
export async function moveToAccount(chapters: readonly StoredChapter[], fetchImpl: typeof fetch = fetch): Promise<{ moved: number; kept: number; failed: boolean }> {
  let moved = 0;
  const kept: string[] = [];
  let failed = false;
  for (let start = 0; start < chapters.length; start += BATCH) {
    const res = await postJson<MoveAnswer>("/api/readings/move", { chapters: chapters.slice(start, start + BATCH).map(itemOf) }, { fetchImpl });
    if (!res.ok) {
      failed = true;
      break;
    }
    for (const item of res.data.moved ?? []) {
      if (typeof item.id !== "string" || typeof item.readingId !== "string" || !/^[a-z0-9]{20}$/.test(item.readingId)) continue;
      linkServerId(item.id, item.readingId);
      moved++;
    }
    for (const item of res.data.kept ?? []) if (typeof item.id === "string") kept.push(item.id);
  }
  keepOnDevice(chapters.filter((chapter) => kept.includes(chapter.id)));
  return { moved, kept: kept.length, failed };
}
