import { NEWYEAR_ADAPTER } from "@/lib/premium/adapters";
import { premiumReadingRoute } from "@/lib/premium/routes";

/** POST {birth, loveStatus?, workStatus?, unlock, resume?} → {status:"continue", resume, done, of} or {status:"done", reading, chapterToken, readingId?}. */
export const POST = premiumReadingRoute(NEWYEAR_ADAPTER);
