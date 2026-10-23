import "server-only";
import { openJson, sealJson } from "@/lib/account/secrets";
import { parseSharePayload, type SharedSajuFree, type SharedTarotFree } from "./payload";

/**
 * The free first reading's share (owner 2026-10-23), sealed by the teaser route that wrote it (lib/account/secrets.ts
 * AES-GCM, under its own key): the cleaned payload of what the free screen shows (lib/share/payload.ts
 * buildTarotFreePayload / buildSajuFreePayload), never the paid part. The device keeps it with its teaser and hands it to
 * app/api/share/free, which stores exactly what opens: no text from the client is ever shared.
 */

/** Like the teaser seal, a week (the draw lives a day; a saju teaser can be shown again for some days). */
export const FREE_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const keyOf = (secret: string) => `free-share-v1:${secret}`;
const CONTEXT = "free-share-v1";

export async function sealFreeShare(payload: SharedTarotFree | SharedSajuFree, secret: string, now: number): Promise<string> {
  return sealJson({ exp: now + FREE_SHARE_TTL_MS, payload }, keyOf(secret), CONTEXT);
}

/** The sealed payload, or null when it is altered, expired or not a free share. */
export async function openFreeShare(seal: unknown, secret: string, now: number): Promise<SharedTarotFree | SharedSajuFree | null> {
  if (typeof seal !== "string" || seal.length === 0 || seal.length > 16_000) return null;
  const opened = await openJson<{ exp?: unknown; payload?: unknown }>(seal, keyOf(secret), CONTEXT);
  if (!opened || typeof opened.exp !== "number" || opened.exp <= now) return null;
  const payload = parseSharePayload(JSON.stringify(opened.payload));
  return payload && (payload.kind === "tarot-free" || payload.kind === "saju-free") ? payload : null;
}
