// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GuideLayout from "./layout";

/**
 * The guide pages' web fonts (AdSense audit 2026-10-27: ~1.5 MB of fonts, slow-4G LCP 4.8-6.2 s). Noto Sans KR is one
 * variable font in ~100 unicode-range slices, so fewer weights save nothing; a long article pulled 0.5-0.65 MB of it.
 * On the guide pages body text takes the reader's system Korean font instead, and only the headings' Gowun Batang
 * (700, the one weight they use) is downloaded. The app's pages keep Noto Sans KR.
 */
afterEach(cleanup);

const css = () => {
  // jsdom tests have no file: import.meta.url; vitest runs from the repo root or from apps/web.
  const file = ["apps/web/app/globals.css", "app/globals.css"].map((path) => resolve(process.cwd(), path)).find((path) => existsSync(path));
  return readFileSync(file ?? "", "utf8");
};

describe("guide fonts", () => {
  it("marks every guide page, so the body font can follow it", () => {
    const { container } = render(<GuideLayout>{<p>본문</p>}</GuideLayout>);
    expect(container.querySelector("[data-guide-fonts]")).not.toBeNull();
  });

  it("points the body font at the system's Korean fonts on a marked page, and leaves the headings' font alone", () => {
    const rule = /body:has\(\[data-guide-fonts\]\)\s*\{([^}]*)\}/.exec(css());
    expect(rule).not.toBeNull();
    const body = rule?.[1] ?? "";
    expect(body).toMatch(/--font-body:[^;]*"Apple SD Gothic Neo"[^;]*"Malgun Gothic"/);
    expect(body).not.toContain("--font-display");
  });
});
