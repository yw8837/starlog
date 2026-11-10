// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The privacy policy names the Meta pixel only where one is built in (sales 2026-11-10 item 7). */

async function privacyAt(time: number, id: string): Promise<HTMLElement> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", id);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time);
  const { default: PrivacyPage } = await import("@/app/privacy/page");
  return render(createElement(PrivacyPage)).container;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const NOV10 = Date.parse("2026-11-10T12:00:00+09:00");
const NOV17 = Date.parse("2026-11-17T00:00:00+09:00");

describe("the privacy policy and the Meta pixel", () => {
  it("says nothing of Meta with no pixel id", { timeout: 30_000 }, async () => {
    const page = await privacyAt(NOV17, "");
    expect(page.textContent).not.toContain("Meta");
  });

  it("before its date: a dated notice of what changes, and the text as it is", async () => {
    const page = await privacyAt(NOV10, "123456789012345");
    const notice = [...page.querySelectorAll("aside")].find((aside) => aside.textContent?.includes("2026년 11월 17일부터 바뀌는 내용"));
    expect(notice?.textContent).toContain("Meta Platforms, Inc.(미국)");
    expect(page.querySelector("#meta-pixel")).toBeNull();
  });

  it("from its date: 바뀐 내용 on top, and the pixel's items, recipient, country, purpose, retention and how to refuse in the cookies section", async () => {
    const page = await privacyAt(NOV17, "123456789012345");
    expect([...page.querySelectorAll("aside")].some((aside) => aside.textContent?.includes("2026년 11월 17일 바뀐 내용"))).toBe(true);
    const section = page.querySelector("#meta-pixel")?.textContent ?? "";
    for (const words of ["Meta Platforms, Inc.(미국)", "_fbp", "_fbc", "fbclid", "결제 금액", "허용한 경우에만", "거부"]) expect(section, words).toContain(words);
    expect(page.textContent).not.toContain("광고 쿠키는 쓰지 않습니다");
  });
});
