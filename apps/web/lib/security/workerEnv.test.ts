import { describe, expect, it } from "vitest";
import { bakedSecrets, secretLike } from "../../../../scripts/check-worker-env.mjs";

describe("worker env gate (scripts/check-worker-env.mjs)", () => {
  it("names the app's secrets and anything named like one; NEXT_PUBLIC_ values are public by design", () => {
    const secrets = [
      "REVIEW_LOGIN_ID", "REVIEW_LOGIN_PASSWORD", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "TOSS_SECRET_KEY", "KAKAO_CLIENT_SECRET",
      "KAKAO_REST_API_KEY", "STARLOG_OWNER_CODE", "STARLOG_SIGNING_SECRET", "STARLOG_ACCOUNT_SECRET", "STARLOG_CRON_SECRET",
      "GOOGLE_CLIENT_SECRET", "SOME_API_TOKEN", "DB_PASSWORD", "TURNSTILE_SECRET_KEY",
    ];
    expect(secrets.filter((name) => !secretLike(name))).toEqual([]);
    // TURNSTILE_SITE_KEY is public by design (handed to every browser the check runs in).
    const plain = ["TURNSTILE_SITE_KEY", "NEXT_PUBLIC_TOSS_CLIENT_KEY", "NEXT_PUBLIC_SPLIT_HOSTS", "STARLOG_PAYMENTS", "STARLOG_AI", "STARLOG_PAY", "BETA_DAILY_BUDGET_KRW", "KRW_PER_USD", "ADSENSE_CLIENT", "KEYWORDS"];
    expect(plain.filter((name) => secretLike(name))).toEqual([]);
  });

  it("passes a build whose production values hold no secret", () => {
    expect(bakedSecrets({})).toEqual([]);
    expect(bakedSecrets({ NEXT_PUBLIC_SPLIT_HOSTS: "1", NEXT_PUBLIC_TOSS_CLIENT_KEY: "test_gck_docs_x", STARLOG_PAYMENTS: "owner" })).toEqual([]);
  });

  it("fails on a secret-like name in production, reporting names only", () => {
    const problems = bakedSecrets({ STARLOG_PAYMENTS: "owner", REVIEW_LOGIN_PASSWORD: "correct-horse-battery-staple-77", ANTHROPIC_API_KEY: "sk-ant-not-a-real-key" });
    expect(problems).toEqual(["ANTHROPIC_API_KEY", "REVIEW_LOGIN_PASSWORD"]);
    expect(problems.join("\n")).not.toMatch(/correct-horse|sk-ant/);
  });

  it("finds a local secret's value under another name (the .env values Next loads), reporting names only", () => {
    const local = { STARLOG_OWNER_CODE: "owner-code-value-0001", STARLOG_AI: "mock", KAKAO_CLIENT_SECRET: "" };
    const problems = bakedSecrets({ OWNER_HINT: "see owner-code-value-0001", STARLOG_AI: "mock" }, local);
    expect(problems).toEqual(["OWNER_HINT (holds the value of STARLOG_OWNER_CODE)"]);
    expect(problems.join("\n")).not.toContain("owner-code-value");
  });
});
