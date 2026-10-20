import { MATCH_ADAPTER } from "@/lib/premium/adapters";
import { premiumTeaserRoute } from "@/lib/premium/routes";

/** POST {me, partner, relation, concern?, ack} → {preview}: both charts, the pair facts, a first look, the locked list (saju only, owner 2026-10-17). */
export const POST = premiumTeaserRoute(MATCH_ADAPTER);
