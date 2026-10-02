import "server-only";
import { openJson, sealJson } from "@/lib/account/secrets";
import type { ProductId, StandardProductId } from "@/lib/pay/catalog";
import { canonicalJson, keyedHash } from "@/lib/security/sign";

/** The three premium products (the same union lib/premium/products.ts names PremiumId, P5 Task 2). */
type PremiumId = Exclude<ProductId, StandardProductId>;

/**
 * The resume token (P5 spec §6.1): the parts validated so far, sealed by the server (AES-GCM), bound
 * to the product, the subject (user id, or "owner" for an owner pass without login), a keyed hash
 * of the input and the reservation. The client keeps it in the tab and sends it back for the next
 * part; nothing partial is stored server-side. It cannot be read or changed by the client.
 */

export const RESUME_TTL_MS = 24 * 60 * 60 * 1000;
/** A sealed token with three parts of Korean text stays well under this. */
const MAX_TOKEN_CHARS = 120_000;

interface ResumePayload {
  k: "premium-resume";
  v: 1;
  p: PremiumId;
  s: string;
  h: string;
  u: string | null;
  parts: unknown[];
  exp: number;
}

export interface Resume {
  product: PremiumId;
  subject: string;
  inputHash: string;
  unlockId: string | null;
  parts: unknown[];
}

/** Its own key: the reading key (P4) derives from the account secret; this one from the signing secret. */
const keyOf = (secret: string) => `premium-resume:${secret}`;
/** The AES-GCM additional data: a saved reading's is `${userId}:${readingId}`, so neither opens as the other. */
const CONTEXT = "premium-resume";
/** keyedHash's subkey for input hashes, apart from the client-network pseudonym's. */
const INPUT_LABEL = "starlog/premium-input/v1";

export function inputHash(product: PremiumId, input: unknown, secret: string): Promise<string> {
  return keyedHash(`premium:${product}:${canonicalJson(input)}`, secret, INPUT_LABEL);
}

export function sealResume(r: Resume, secret: string, now: number): Promise<string> {
  const payload: ResumePayload = { k: "premium-resume", v: 1, p: r.product, s: r.subject, h: r.inputHash, u: r.unlockId, parts: r.parts, exp: now + RESUME_TTL_MS };
  return sealJson(payload, keyOf(secret), CONTEXT);
}

export async function openResume(
  token: unknown,
  expected: { product: PremiumId; subject: string; inputHash: string },
  secret: string,
  now: number,
): Promise<Resume | null> {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_CHARS) return null;
  const p = await openJson<ResumePayload>(token, keyOf(secret), CONTEXT);
  if (!p || p.k !== "premium-resume" || p.v !== 1 || typeof p.exp !== "number" || p.exp <= now || !Array.isArray(p.parts)) return null;
  if (p.p !== expected.product || p.s !== expected.subject || p.h !== expected.inputHash) return null;
  return { product: p.p, subject: p.s, inputHash: p.h, unlockId: p.u ?? null, parts: p.parts };
}
