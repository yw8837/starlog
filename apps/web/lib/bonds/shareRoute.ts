import "server-only";
import { sameOrigin } from "@/lib/account/request";
import { clientKey, errorResponse, json, parseCookies, readJson } from "@/lib/api/http";
import { SITE } from "@/lib/config";
import { accountDb, bondsRepo } from "@/lib/db";
import type { BondsRepo } from "@/lib/db/bondsRepo";
import { rateLimit } from "@/lib/security/rateLimit";
import { signingSecret } from "@/lib/security/sign";
import type { SharedBond, SharedBonds } from "@/lib/share/payload";
import { sharePreview } from "@/lib/share/preview";
import { deleteShare, saveShare } from "@/lib/share/store";
import { bondsPreviewData, loadBondsShare } from "./share";

/**
 * The two 별자리 인연 share routes (app/api/share/bonds, app/api/share/bond): same-origin, the share routes' per-network
 * limit, the bonds flag. `find` names the share this device may make or stop (its owner or friend cookie decides), or
 * null. POST answers {id, path, preview}; DELETE {deleted}. No AI call, nothing personal copied (lib/bonds/share.ts).
 */

const UNAVAILABLE = "지금은 공유 링크를 만들 수 없어요. 잠시 뒤에 다시 시도해 주세요.";
const NOT_YOURS = "이 기기에서 만든 별자리 인연만 공유할 수 있어요.";

type Find = (ctx: { repo: BondsRepo; cookies: Record<string, string>; secret: string; body: Record<string, unknown> }) => Promise<SharedBonds | SharedBond | null>;

export async function bondsShare(request: Request, method: "POST" | "DELETE", find: Find): Promise<Response> {
  if (!SITE.features.bonds) return errorResponse("NOT_AVAILABLE", { message: UNAVAILABLE });
  if (!sameOrigin(request)) return errorResponse("FORBIDDEN");
  if (!(await rateLimit("GEN_LIMITER", clientKey(request)))) return errorResponse("RATE_LIMIT");
  const secret = signingSecret();
  const db = accountDb();
  let repo: BondsRepo;
  try {
    repo = bondsRepo();
  } catch {
    return errorResponse("NOT_AVAILABLE", { message: UNAVAILABLE });
  }
  if (!secret || !db) return errorResponse("NOT_AVAILABLE", { message: UNAVAILABLE });
  const raw = await readJson(request, 1_000);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return errorResponse("BAD_REQUEST");
  const payload = await find({ repo, cookies: parseCookies(request), secret, body: raw as Record<string, unknown> });
  if (!payload) return errorResponse("NOT_AVAILABLE", { message: NOT_YOURS });
  const key = payload.kind === "bonds" ? `bonds:${payload.constellationId}` : `bond:${payload.starId}`;
  if (method === "DELETE") return json({ deleted: await deleteShare(db, key) });
  const view = await loadBondsShare(repo, payload);
  if (!view) return errorResponse("NOT_AVAILABLE", { message: NOT_YOURS });
  const id = await saveShare(db, key, payload, Date.now(), null);
  return json({ id, path: `/s/${id}`, preview: sharePreview(payload, bondsPreviewData(view)) });
}
