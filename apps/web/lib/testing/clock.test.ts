import { describe, expect, it } from "vitest";
import { OPENING_ENDS_AT } from "@/e2e/opening";
import { SITE } from "@/lib/config";
import { DURING_OPENING } from "./clock";

describe("the 오픈 기념 무료 end the tests assume", () => {
  it("is the one the app uses, in e2e too, and the unit tests' moment falls before it", () => {
    expect(OPENING_ENDS_AT).toBe(Date.parse(SITE.beta.openingEndsAt));
    expect(DURING_OPENING).toBeLessThan(OPENING_ENDS_AT);
  });
});
