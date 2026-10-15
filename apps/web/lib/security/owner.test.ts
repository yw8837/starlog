import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

const env = (code: string | undefined) => ({ STARLOG_OWNER_CODE: code }) as unknown as NodeJS.ProcessEnv;

describe("ownerCode (H-1)", () => {
  it("keeps a code shorter than 24 characters working, and warns once per isolate that it is short, never printing it", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { ownerCode } = await import("./owner");
    expect(ownerCode(env(" short-code "))).toBe("short-code");
    expect(ownerCode(env("short-code"))).toBe("short-code");
    expect(warn).toHaveBeenCalledTimes(1);
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
