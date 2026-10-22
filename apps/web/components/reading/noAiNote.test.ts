import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * owner 2026-10-23: 풀이 화면 AI 안내 제거, 약관에만 유지. No reading screen (tarot, saju, premium, the free first
 * reading, 지금의 한 장, 오늘의 한 장, the shared pages, the PDF's head and foot) carries the AI line any more; the terms keep it.
 */
const WEB = resolve(__dirname, "../..");
const SCREENS = [
  "app/chapter",
  "app/tarot",
  "app/saju",
  "app/now",
  "app/today",
  "app/s",
  "app/premium",
  "app/b",
  "app/bonds",
  "components/share",
  "components/premium",
  "components/tarot",
  "components/reading",
  "components/bonds",
];
const AI_LINE = /AI가 만든|AI로 만든|AI가 쓴|재미와 자기|자기 성찰을 위한/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the AI line on reading screens (owner 2026-10-23)", () => {
  it("is gone from every reading screen and the PDF's head and foot", () => {
    const hits = SCREENS.flatMap((dir) => sources(join(WEB, dir)))
      .filter((path) => AI_LINE.test(readFileSync(path, "utf8")))
      .map((path) => relative(WEB, path).split(sep).join("/"));
    expect(hits).toEqual([]);
  });

  it("stays in the terms", () => {
    expect(readFileSync(join(WEB, "app/terms/page.tsx"), "utf8")).toMatch(/AI가 만든 콘텐츠의 표시/);
  });
});
