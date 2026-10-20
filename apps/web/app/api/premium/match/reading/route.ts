import { MATCH_ADAPTER } from "@/lib/premium/adapters";
import { premiumReadingRoute } from "@/lib/premium/routes";

/** POST {me, partner, relation, concern?, ack, unlock, resume?} → {status:"continue", resume, done, of} or {status:"done", reading, chapterToken, readingId?}. */
export const POST = premiumReadingRoute(MATCH_ADAPTER);
