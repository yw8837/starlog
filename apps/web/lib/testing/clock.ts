import { afterEach, beforeEach, vi } from "vitest";
import { SITE } from "@/lib/config";

/**
 * A moment inside 오픈 기념 무료 (it ends with SITE.beta.openingEndsAt, 2026-12-01 00:00 KST). Tests that open the
 * free first tarot reading, or that borrow it to get a reading at all, run there, so they keep passing once the
 * event has ended. Tests about the end itself set their own time.
 */
export const DURING_OPENING = Date.parse("2026-10-20T12:00:00+09:00");

if (DURING_OPENING >= Date.parse(SITE.beta.openingEndsAt)) throw new Error("DURING_OPENING must fall before SITE.beta.openingEndsAt");

/** Every test of the calling file sees Date at DURING_OPENING (only Date is faked, and it keeps ticking). */
export function duringOpening(): void {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true, now: DURING_OPENING });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}
