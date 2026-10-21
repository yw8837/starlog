// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { AnalyticsSetting } from "./AnalyticsSetting";

const KEY = "starlog.analytics.consent";
const flags = window as unknown as Record<string, unknown>;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete flags["ga-disable-G-8X11ZGFZKY"];
});

const status = () => screen.getByRole("status").textContent;
const pressed = () => screen.getAllByRole("button").map((button) => [button.textContent, button.getAttribute("aria-pressed")]);

describe("AnalyticsSetting: the visitor changes their mind on /privacy#analytics", () => {
  it("shows no choice on the server (the choice lives in the browser), then this browser's", async () => {
    window.localStorage.setItem(KEY, JSON.stringify({ choice: "granted", at: "2026-10-30T00:00:00.000Z" }));
    const html = renderToString(<AnalyticsSetting />);
    expect(html).not.toContain("허용한 상태");
    expect(html).not.toContain('aria-pressed="true"');
    render(<AnalyticsSetting />);
    await act(async () => {});
    expect(status()).toBe("지금은 허용한 상태예요.");
    expect(pressed()).toEqual([
      ["허용", "true"],
      ["거부", "false"],
    ]);
  });

  it("with no choice yet, says so; 거부 then 허용 switch it, store it and stop or free gtag", async () => {
    render(<AnalyticsSetting />);
    await act(async () => {});
    expect(status()).toBe("아직 고르지 않았어요.");
    fireEvent.click(screen.getByRole("button", { name: "거부" }));
    expect(status()).toBe("지금은 거부한 상태예요.");
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "{}").choice).toBe("denied");
    expect(flags["ga-disable-G-8X11ZGFZKY"]).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "허용" }));
    expect(status()).toBe("지금은 허용한 상태예요.");
    expect(JSON.parse(window.localStorage.getItem(KEY) ?? "{}").choice).toBe("granted");
  });

  it("is a labelled group whose two buttons look the same (no choice pushed)", () => {
    render(<AnalyticsSetting />);
    expect(screen.getByRole("group", { name: "방문 통계 설정" })).toBeTruthy();
    const [allow, deny] = screen.getAllByRole("button");
    expect(allow!.className).toBe(deny!.className);
  });
});
