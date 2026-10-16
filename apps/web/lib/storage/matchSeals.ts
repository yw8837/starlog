import { createLocalStore } from "@/lib/sessionStore";

/**
 * 궁합 partners' seals kept on this device across a logout (review 2026-10-17 H3), by the reading's account id. A seal
 * is the partner's birth as this server sealed it (AES-GCM, opaque here) inside the chapter token; a logout takes the
 * chapter and its token off the device (both carry readable text), but keeps the seal until the chapter's follow-up
 * days end, so a login again on this device can ask the server for a token (lib/storage/sync.ts restoreMatchTokens).
 */

export const MATCH_SEALS_KEY = "starlog.match-seals";

interface Seal {
  sealed: string;
  /** the chapter token's expiry (epoch ms) */
  exp: number;
}
type Seals = Record<string, Seal>;

const isSeal = (value: unknown): value is Seal =>
  typeof value === "object" && value !== null && typeof (value as Seal).sealed === "string" && typeof (value as Seal).exp === "number";

function parseSeals(value: unknown): Seals | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter(([, seal]) => isSeal(seal))) as Seals;
}

const store = createLocalStore<Seals>(MATCH_SEALS_KEY, parseSeals);

/** The seals still inside their follow-up days; the others are dropped from storage. */
function live(now: number): Seals {
  const all = store.read() ?? {};
  const kept = Object.fromEntries(Object.entries(all).filter(([, seal]) => seal.exp > now));
  if (Object.keys(kept).length !== Object.keys(all).length) {
    if (Object.keys(kept).length) store.save(kept);
    else store.clear();
  }
  return kept;
}

/** The partner's seal and the expiry in a 궁합's chapter token (its payload is base64url JSON; the server checks the signature). */
export function sealOfToken(token: string): Seal | null {
  try {
    const body = token.split(".")[0] ?? "";
    const binary = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))) as {
      exp?: unknown;
      ctx?: { kind?: unknown; partner?: { sealed?: unknown } };
    };
    const sealed = payload.ctx?.partner?.sealed;
    return payload.ctx?.kind === "match" && typeof sealed === "string" && sealed && typeof payload.exp === "number" ? { sealed, exp: payload.exp } : null;
  } catch {
    return null;
  }
}

/** Before a logout takes the account's chapters off this device: each 궁합's seal, by its account id. */
export function keepMatchSeals(entries: readonly unknown[], now: number = Date.now()): void {
  const seals = live(now);
  let added = false;
  for (const entry of entries) {
    const e = entry as { kind?: unknown; serverId?: unknown; chapterToken?: unknown };
    if (e?.kind !== "match" || typeof e.serverId !== "string" || typeof e.chapterToken !== "string") continue;
    const seal = sealOfToken(e.chapterToken);
    if (!seal || seal.exp <= now) continue;
    seals[e.serverId] = seal;
    added = true;
  }
  if (added) store.save(seals);
}

/** Drops the seal kept for one account reading (its 궁합 deleted on this device). */
export function dropMatchSeal(serverId: string, now: number = Date.now()): void {
  const seals = live(now);
  if (!(serverId in seals)) return;
  delete seals[serverId];
  if (Object.keys(seals).length) store.save(seals);
  else store.clear();
}

/** Drops every seal (the account deleted, or every record erased on this device). */
export function clearMatchSeals(): void {
  store.clear();
}

/** Drops the seals past their follow-up days (the app opening, chapters.ts pruneMatchPartners). */
export function pruneMatchSeals(now: number = Date.now()): void {
  live(now);
}

/** The seal kept for this account reading, while its follow-up days last. */
export function matchSeal(serverId: string, now: number = Date.now()): string | null {
  return live(now)[serverId]?.sealed ?? null;
}
