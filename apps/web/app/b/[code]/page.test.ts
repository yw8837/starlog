import { describe, expect, it, vi } from "vitest";

/** /b/<code>'s link preview says what the KakaoTalk invite says (owner 2026-10-23): whose constellation, which sign. */

const { state } = vi.hoisted(() => ({ state: { value: { status: "open", kind: "open", code: "K7M4QX", ownerNickname: "용우", sign: "aries", filled: 1, slots: 4, earlier: null, myNickname: null } as Record<string, unknown> } }));
vi.mock("./loadInvite", () => ({ codeFromSegment: (raw: string) => raw.toUpperCase(), loadInvite: vi.fn(async () => state.value) }));

const { generateMetadata } = await import("./page");
const props = (code: string) => ({ params: Promise.resolve({ code }) });

describe("/b/<code> metadata", () => {
  it("titles the preview like the invite, '용우님의 양자리에 별이 되어 주세요', with the constellation's image", async () => {
    const meta = await generateMetadata(props("k7m4qx"));
    expect(meta.openGraph?.title).toBe("용우님의 양자리에 별이 되어 주세요");
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: "/api/og/invite/K7M4QX", width: 1200, height: 630 })]);
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("stays generic for a code that opens nothing to join", async () => {
    state.value = { status: "bad" };
    const meta = await generateMetadata(props("zzzzzz"));
    expect(meta.openGraph?.title ?? meta.title).toBe("별자리 인연 초대");
  });
});
