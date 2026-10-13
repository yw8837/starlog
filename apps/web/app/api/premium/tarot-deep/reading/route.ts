import { DEEP_ADAPTER } from "@/lib/premium/adapters";
import { premiumReadingRoute } from "@/lib/premium/routes";

/** POST {drawToken, input, unlock, resume?} → {status:"continue", resume, done, of} or {status:"done", reading, chapterToken, readingId?}. */
export const POST = premiumReadingRoute(DEEP_ADAPTER);
