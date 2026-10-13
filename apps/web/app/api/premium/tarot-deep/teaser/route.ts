import { DEEP_ADAPTER } from "@/lib/premium/adapters";
import { premiumTeaserRoute } from "@/lib/premium/routes";

/** POST {drawToken, input} → {preview}: ten cards, keywords, the first position, the locked list. */
export const POST = premiumTeaserRoute(DEEP_ADAPTER);
