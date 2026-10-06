import { afterEach, describe, expect, it, vi } from "vitest";
import { isReviewer, reviewLogin, reviewUserKey } from "./review";

/** The Worker's own env (cloudflareEnv) while a test plays a Worker; null = not on Workers (tests, next dev). */
const worker = vi.hoisted(() => ({ env: null as Record<string, string> | null }));
vi.mock("@/lib/cloudflare", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cloudflare")>()),
  cloudflareEnv: () => worker.env,
}));

const ID = "card-review";
const PASSWORD = "correct-horse-battery-staple-77";
const ACCOUNT_SECRET = "account-secret-for-review-tests-0123456789";

afterEach(() => {
  worker.env = null;
  vi.unstubAllEnvs();
});

describe("review login credentials", () => {
  it("on Workers, are the Worker's own secrets only: a value OpenNext copied into process.env from a build's .env file keeps nothing on", async () => {
    // OpenNext's init runs process.env[key] ??= next-env.mjs's value, so a baked-in value outlives a deleted secret.
    vi.stubEnv("REVIEW_LOGIN_ID", ID);
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", PASSWORD);
    worker.env = {};
    const reviewer = { kakao_key: await reviewUserKey({ id: ID, password: PASSWORD }, ACCOUNT_SECRET) };
    expect(reviewLogin()).toBeNull();
    expect(await isReviewer(reviewer, ACCOUNT_SECRET)).toBe(false);
    vi.stubEnv("REVIEW_LOGIN_ID", "");
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "");
    worker.env = { REVIEW_LOGIN_ID: ID, REVIEW_LOGIN_PASSWORD: PASSWORD };
    expect(reviewLogin()).toEqual({ id: ID, password: PASSWORD });
    expect(await isReviewer(reviewer, ACCOUNT_SECRET)).toBe(true);
  });

  it("outside Workers (tests, plain next dev), come from process.env, trimmed", () => {
    vi.stubEnv("REVIEW_LOGIN_ID", ` ${ID} `);
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", PASSWORD);
    expect(reviewLogin()).toEqual({ id: ID, password: PASSWORD });
  });

  it("keep review login off while the password is shorter than 20 characters (after trimming)", () => {
    expect(reviewLogin({ REVIEW_LOGIN_ID: ID, REVIEW_LOGIN_PASSWORD: "nineteen-characters" })).toBeNull();
    expect(reviewLogin({ REVIEW_LOGIN_ID: ID, REVIEW_LOGIN_PASSWORD: "  nineteen-characters  " })).toBeNull();
    expect(reviewLogin({ REVIEW_LOGIN_ID: ID, REVIEW_LOGIN_PASSWORD: "twenty-characters-ok" })).toEqual({ id: ID, password: "twenty-characters-ok" });
  });
});
