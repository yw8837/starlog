import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

const env = (code: string | undefined) => ({ STARLOG_OWNER_CODE: code }) as unknown as NodeJS.ProcessEnv;

describe("ownerCode (H-1)", () => {
  it("refuses a code shorter than 24 characters (nobody is the owner), and warns once per isolate with the length only", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ownerCode, isOwner, ownerCookie } = await import("./owner");
    expect(ownerCode(env(" short-code "))).toBeNull();
    expect(ownerCode(env("short-code"))).toBeNull();
    expect(ownerCode(env("x".repeat(23)))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    // A pass issued under the short code is no pass while the short code is all there is.
    const secret = "test-signing-secret-0123456789-0123456789";
    const cookie = await ownerCookie(secret, 1_000, "short-code");
    expect(await isOwner(cookie, secret, 1_000, ownerCode(env("short-code")))).toBe(false);
    const line = String(warn.mock.calls[0]![0]);
    expect(JSON.parse(line)).toMatchObject({ evt: "owner.code_short", length: 10, min: 24 });
    expect(line).not.toContain("short-code");
  });

  it("is quiet for a code of 24 characters or more, and null (no owner) without one", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ownerCode } = await import("./owner");
    expect(ownerCode(env("x".repeat(24)))).toBe("x".repeat(24));
    expect(ownerCode(env("   "))).toBeNull();
    expect(ownerCode(env(undefined))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
