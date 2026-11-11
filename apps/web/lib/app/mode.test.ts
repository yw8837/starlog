import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isStarlogApp } from "@/lib/inApp";
import { APP_MODE_SCRIPT } from "./mode";

const UAS = [
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 StarlogApp/1.0.0",
  "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 KAKAOTALK 10.8.0",
  "Mozilla/5.0 StarlogApp/x",
  "Mozilla/5.0 NotStarlogApp/1",
];

/** Runs the <head> script against a user agent and returns what it left on <html>. */
function run(userAgent: string): Record<string, string> {
  const dataset: Record<string, string> = {};
  new Function("navigator", "document", APP_MODE_SCRIPT)({ userAgent }, { documentElement: { dataset } });
  return dataset;
}

describe("the app-mode <head> script", () => {
  it("marks <html data-app=android> exactly where isStarlogApp says the Starlog app is", () => {
    for (const ua of UAS) expect(run(ua)).toEqual(isStarlogApp(ua) ? { app: "android" } : {});
    expect(run(UAS[0]!)).toEqual({ app: "android" });
    expect(run(UAS[1]!)).toEqual({});
  });

  it("is in the root layout's <head>, with <html suppressHydrationWarning> (the script changes <html> before React hydrates)", () => {
    const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
    expect(layout).toMatch(/<html [^>]*suppressHydrationWarning/);
    expect(layout).toMatch(/<head>\s*<script dangerouslySetInnerHTML=\{\{ __html: APP_MODE_SCRIPT \}\} \/>\s*<\/head>/);
  });

  it("hides .web-only in the app and .app-only everywhere else", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(css).toContain("html[data-app] .web-only {\n  display: none !important;\n}");
    expect(css).toContain("html:not([data-app]) .app-only {\n  display: none !important;\n}");
  });
});
