// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GA_MEASUREMENT_ID, gaConfig, gaScriptSrc } from "@/lib/analytics";
import { GoogleAnalytics } from "./GoogleAnalytics";

vi.mock("next/script", async () => {
  const { createElement } = await import("react");
  return { default: ({ src, strategy }: { src: string; strategy: string }) => createElement("script", { "data-src": src, "data-strategy": strategy }) };
});

/** The privacy revision that discloses Google Analytics (lib/legal.ts PRIVACY_REVISION_DATE) and the second before it, in KST. */
const IN_FORCE = Date.parse("2026-10-28T00:00:00+09:00");
const BEFORE = Date.parse("2026-10-27T23:59:59+09:00");

const at = (time: number) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time);
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.dataLayer;
  delete window.gtag;
});

const configCall = () => (window.dataLayer ?? []).map((args) => [...(args as IArguments)]).find((args) => args[0] === "config");

describe("GoogleAnalytics: GA4 on both hosts, only once the privacy revision is in force, by the browser's clock", () => {
  it("uses the 스타로그 property's measurement ID by default", () => {
    expect(GA_MEASUREMENT_ID).toBe("G-8X11ZGFZKY");
    expect(gaScriptSrc(GA_MEASUREMENT_ID)).toBe("https://www.googletagmanager.com/gtag/js?id=G-8X11ZGFZKY");
  });

  it("renders nothing and sends nothing with an empty ID", async () => {
    at(IN_FORCE);
    const { container } = render(<GoogleAnalytics id="" />);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
    expect(window.dataLayer).toBeUndefined();
  });

  it("renders nothing and queues no gtag call before 2026-10-28 00:00 KST", async () => {
    at(BEFORE);
    const { container } = render(<GoogleAnalytics />);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
    expect(window.dataLayer).toBeUndefined();
    expect(window.gtag).toBeUndefined();
  });

  it("from 2026-10-28 00:00 KST loads gtag.js after hydration and configures it with Google signals and ad personalization off", async () => {
    at(IN_FORCE);
    const { container } = render(<GoogleAnalytics />);
    await act(async () => {});
    const script = container.querySelector("script");
    expect(script?.getAttribute("data-src")).toBe("https://www.googletagmanager.com/gtag/js?id=G-8X11ZGFZKY");
    expect(script?.getAttribute("data-strategy")).toBe("afterInteractive");
    expect(configCall()).toEqual(["config", "G-8X11ZGFZKY", { allow_google_signals: false, allow_ad_personalization_signals: false }]);
    // One config however often it renders (no second page_view: enhanced measurement counts the SPA's history changes).
    render(<GoogleAnalytics />);
    await act(async () => {});
    expect((window.dataLayer ?? []).filter((args) => (args as IArguments)[0] === "config")).toHaveLength(1);
  });

  it("is never in the server HTML, which is cached for a year", () => {
    at(IN_FORCE);
    expect(renderToString(<GoogleAnalytics />)).toBe("");
  });
});

describe("gaConfig: no payment keys or share links in page_location", () => {
  it("drops the query and hash on /pay (Toss returns paymentKey, orderId and amount there)", () => {
    expect(gaConfig("https://starlog.yeolmaeapps.kr/pay/success?paymentKey=tgen_1&orderId=o1&amount=2900#x")).toMatchObject({ page_location: "https://starlog.yeolmaeapps.kr/pay/success" });
    expect(gaConfig("https://starlog.yeolmaeapps.kr/pay/fail?code=PAY_PROCESS_CANCELED&message=x")).toMatchObject({ page_location: "https://starlog.yeolmaeapps.kr/pay/fail" });
  });

  it("drops the share id on /s/<id>, a link that opens someone's reading", () => {
    expect(gaConfig("https://starlog.yeolmaeapps.kr/s/abc123?x=1")).toMatchObject({ page_location: "https://starlog.yeolmaeapps.kr/s/" });
  });

  it("leaves every other address to GA as it is (utm tags and all)", () => {
    expect(gaConfig("https://starlog.yeolmaeapps.kr/tarot/new?utm_source=threads")).toEqual({ allow_google_signals: false, allow_ad_personalization_signals: false });
    expect(gaConfig("https://yeolmaeapps.kr/guide/the-fool")).not.toHaveProperty("page_location");
  });
});
