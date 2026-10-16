import "server-only";
import { openJson, sealJson } from "@/lib/account/secrets";
import type { BirthInput } from "@/lib/api/inputs";

/**
 * 우리 사이 궁합's partner (owner 2026-10-16: never kept on our servers). The chapter token the device keeps
 * carries the partner's birth sealed (AES-GCM, lib/account/secrets.ts) under its own key, so only this server
 * opens it for a follow-up; the account's copy holds no token at all. Anything that does not open is no
 * partner: that chapter takes no follow-up.
 */

/** Its own key, like the teaser seal's: the signing secret under the label `match-partner-v1`. */
const keyOf = (secret: string) => `match-partner-v1:${secret}`;
const CONTEXT = "match-partner-v1";
/** A sealed birth is a few hundred characters; anything far longer is not one. */
const MAX_SEALED_CHARS = 2_000;

interface PartnerPayload {
  v: 1;
  birth: BirthInput;
}

export function sealPartner(birth: BirthInput, secret: string): Promise<string> {
  const payload: PartnerPayload = { v: 1, birth };
  return sealJson(payload, keyOf(secret), CONTEXT);
}

/** The partner's birth (checked again by the chart), or null when the seal is missing, altered or from another secret. */
export async function openPartner(sealed: unknown, secret: string): Promise<BirthInput | null> {
  if (typeof sealed !== "string" || sealed.length === 0 || sealed.length > MAX_SEALED_CHARS) return null;
  const p = await openJson<PartnerPayload>(sealed, keyOf(secret), CONTEXT);
  return p && p.v === 1 && typeof p.birth === "object" && p.birth !== null ? p.birth : null;
}
