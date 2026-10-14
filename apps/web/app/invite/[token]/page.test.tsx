import { afterEach, describe, expect, it, vi } from "vitest";
import { INVITE_FIXTURE_TOKEN } from "@/lib/fixtures";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import InvitePage, { generateMetadata } from "./page";

const props = (token: string) => ({ params: Promise.resolve({ token }), searchParams: Promise.resolve({}) }) as PageProps<"/invite/[token]">;

afterEach(() => vi.unstubAllEnvs());

describe("the demo invite (QA-13)", () => {
  it("is not found in production: no made-up friend asks a real visitor for a card", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_AI", "");
    await expect(InvitePage(props(INVITE_FIXTURE_TOKEN))).rejects.toThrow();
    expect(await generateMetadata(props(INVITE_FIXTURE_TOKEN))).toEqual(NOT_FOUND_METADATA);
  });

  it("opens in development and the e2e server", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(InvitePage(props(INVITE_FIXTURE_TOKEN))).resolves.toBeTruthy();
    expect(await generateMetadata(props(INVITE_FIXTURE_TOKEN))).not.toEqual(NOT_FOUND_METADATA);
  });

  it("opens on the e2e build of production, which runs the mock model", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STARLOG_AI", "mock");
    await expect(InvitePage(props(INVITE_FIXTURE_TOKEN))).resolves.toBeTruthy();
  });
});
