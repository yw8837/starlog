import { describe, expect, it } from "vitest";
import { isInAppBrowser, isStarlogApp } from "./inApp";

const WEBVIEW = "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36";

describe("isStarlogApp", () => {
  it("knows the app's WebView by its user agent suffix", () => {
    expect(isStarlogApp(`${WEBVIEW} StarlogApp/1.0.0`)).toBe(true);
  });
  it("is false for a plain WebView, Chrome and an empty user agent", () => {
    expect(isStarlogApp(WEBVIEW)).toBe(false);
    expect(isStarlogApp("Mozilla/5.0 (Linux; Android 15) Chrome/130.0.0.0 Mobile Safari/537.36")).toBe(false);
    expect(isStarlogApp("")).toBe(false);
  });
  it("is not one of the in-app browsers that cannot log in", () => {
    expect(isInAppBrowser(`${WEBVIEW} StarlogApp/1.0.0`)).toBe(false);
  });
});
