import { describe, expect, it } from "vitest";
import { FOLLOW_UP_DAYS_MS } from "@/app/chapter/[id]/LocalChapter";
import { CONFIRM_WINDOW_MS as PAGE_CONFIRM_WINDOW_MS, WAIT_MS } from "@/app/pay/success/PaySuccess";
import { TIMEOUT_MS } from "@/lib/ai/anthropic";
import { HistoryItemSchema } from "@/lib/ai/history";
import { ALL as VALIDATED_TOPICS } from "@/lib/ai/validateSajuTopics";
import { SajuBody } from "@/lib/api/inputs";
import { GENERATION_BUDGET_MS } from "@/lib/api/stream";
import { SITE } from "@/lib/config";
import { RESERVATION_MS } from "@/lib/pay/ledger";
import { CONFIRM_WINDOW_MS, STALE_CONFIRM_MS } from "@/lib/pay/orders";
import { CHECKIN_ANSWERS } from "@/lib/reading/types";
import { SAJU_TOPICS, SAJU_TOPIC_IDS } from "@/lib/sajuTopics";
import { CHAPTER_TOKEN_TTL_MS } from "@/lib/security/chapterToken";
import { quotaLimits } from "@/lib/security/quota";
import { OPENING_WINDOW_MS } from "@/lib/storage/sync";

/**
 * Values written twice, once where the screen (or a client module) reads them and once where the server
 * enforces them, because the client cannot import the server's module (audit B B03, B04, B32). Nothing is
 * merged here; these only fail when one side changes without the other.
 */
describe("what the screens say and what the server enforces", () => {
  it("free limits: the copy's numbers are the server's defaults (B03)", () => {
    expect(quotaLimits({} as NodeJS.ProcessEnv)).toMatchObject({
      full: SITE.beta.firstFreeTarot,
      teaser: SITE.beta.teaserPerDay,
      followupsPerChapter: SITE.reading.followUps,
    });
  });

  it("request lists: the server accepts every topic and check-in answer a device sends (B04)", () => {
    expect(HistoryItemSchema.shape.topic.unwrap().options).toEqual([...SAJU_TOPIC_IDS]);
    expect(HistoryItemSchema.shape.checkin.unwrap().options).toEqual([...CHECKIN_ANSWERS]);
    expect(SajuBody.shape.topic.unwrap().options).toEqual(SAJU_TOPICS.map((topic) => topic.id));
    expect([...VALIDATED_TOPICS]).toEqual([...SAJU_TOPIC_IDS]);
  });

  it("the payment page waits past the server's decision on a lost confirm, and confirms again in the same window (B32)", () => {
    expect(WAIT_MS).toBeGreaterThan(STALE_CONFIRM_MS);
    expect(PAGE_CONFIRM_WINDOW_MS).toBe(CONFIRM_WINDOW_MS);
  });

  it("a reading's follow-up deadline on screen is its chapter token's life (B32)", () => {
    expect(FOLLOW_UP_DAYS_MS).toBe(CHAPTER_TOKEN_TTL_MS);
  });

  it("the device's opening window is a reservation's life (B32)", () => {
    expect(OPENING_WINDOW_MS).toBe(RESERVATION_MS);
  });

  it("the model call's timeout is the routes' generation budget (B32)", () => {
    expect(TIMEOUT_MS).toBe(GENERATION_BUDGET_MS);
  });
});
