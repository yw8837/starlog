import { NEWYEAR_ADAPTER } from "@/lib/premium/adapters";
import { premiumTeaserRoute } from "@/lib/premium/routes";

/** POST {birth, loveStatus?, workStatus?} → {preview}: the 2027 facts, the year's title and preview, the locked list. */
export const POST = premiumTeaserRoute(NEWYEAR_ADAPTER);
