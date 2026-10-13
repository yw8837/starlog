import { MATCH_ADAPTER } from "@/lib/premium/adapters";
import { premiumTeaserRoute } from "@/lib/premium/routes";

/** POST {me, partner, relation, concern?, drawToken, ack} → {preview}: both charts, the pair facts, five cards, a first look, the locked list. */
export const POST = premiumTeaserRoute(MATCH_ADAPTER);
