import { afterEach, describe, expect, it, vi } from "vitest";

// Outside a request, the real connection() throws; the page only uses it to stay off the build.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));

const { default: ReviewLoginPage, metadata } = await import("./page");

afterEach(() => vi.unstubAllEnvs());

describe("/login/review", () => {
  it("is not found unless REVIEW_LOGIN_ID and a REVIEW_LOGIN_PASSWORD of 20+ characters are both set", async () => {
    vi.stubEnv("REVIEW_LOGIN_ID", "card-review");
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "");
    await expect(ReviewLoginPage()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "nineteen-characters");
    await expect(ReviewLoginPage()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    vi.stubEnv("REVIEW_LOGIN_PASSWORD", "twenty-characters-ok");
    await expect(ReviewLoginPage()).resolves.toBeTruthy();
  });

  it("is kept out of search results", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});
