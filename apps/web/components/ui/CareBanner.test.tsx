// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARE_BANNER, CARE_BODY, CARE_TITLE, TEXT_HELP } from "@/lib/crisis";
import { parseApiError, postGeneration } from "@/lib/reading/api";
import { signalCare } from "@/lib/reading/careSignal";
import { describeApiError } from "@/lib/reading/errors";
import { CareBanner, resetCareBanner } from "./CareBanner";
import { CrisisContacts } from "./CrisisContacts";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  resetCareBanner();
});

const hrefs = (root: ParentNode, scheme: string) => [...root.querySelectorAll<HTMLAnchorElement>(`a[href^="${scheme}"]`)].map((a) => a.getAttribute("href"));

describe("CrisisContacts on a care screen (owner 2026-10-31)", () => {
  it("leads with 109 by call or by text and 마들랜, the other three folded under 다른 상담 창구", () => {
    const { container } = render(<CrisisContacts lead={false} compact />);
    const shown = container.querySelector('[aria-label="상담 전화와 문자"]')!;
    expect(hrefs(shown, "tel:")).toEqual(["tel:109"]);
    expect(hrefs(shown, "sms:")).toEqual([`sms:${TEXT_HELP.sms}`]);
    expect(shown.textContent).toContain("SNS 상담 마들랜");
    expect(shown.textContent).toContain("카카오톡에서 '마들랜'을 검색해 채팅");
    const folded = container.querySelector("details")!;
    expect(folded.querySelector("summary")?.textContent).toBe("다른 상담 창구");
    expect(hrefs(folded, "tel:")).toEqual(["tel:1577-0199", "tel:1388", "tel:1588-9191"]);
    expect(container.textContent).not.toContain("극단적");
  });

  it("puts 119 and 112 first when a plan or a means was named", () => {
    const { container } = render(<CrisisContacts lead={false} compact urgent />);
    expect(hrefs(container, "tel:").slice(0, 2)).toEqual(["tel:119", "tel:112"]);
    expect(container.textContent).toContain("지금 바로 위험하다면");
  });
});

describe("the care screen copy", () => {
  it("is not an error: the feeling, the reason, the count kept, the way back; urgent carried through", () => {
    const view = describeApiError(parseApiError(422, { code: "REFUSED", care: true, message: CARE_BODY }), "teaser");
    expect(view).toMatchObject({ title: CARE_TITLE, body: CARE_BODY, action: "edit", care: true });
    expect(view.urgent).toBeUndefined();
    expect(CARE_BODY).toContain("줄어든 횟수나 결제는 없어요");
    expect(describeApiError(parseApiError(422, { code: "REFUSED", care: true, urgent: true }), "teaser")).toMatchObject({ urgent: true, body: CARE_BODY });
  });
});

describe("CareBanner", () => {
  it("opens when a reading written with care arrives, and closes for two hours", () => {
    render(<CareBanner />);
    const banner = () => screen.queryByRole("complementary", { name: "마음 돌봄 안내" });
    expect(banner()).toBeNull();
    // the live region is there before anything opens, so the opening is announced
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => signalCare());
    expect(screen.getByRole("status").textContent).toBe(CARE_BANNER);
    expect(banner()?.textContent).toContain(CARE_BANNER);
    expect(banner()?.querySelector('a[href="tel:109"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(banner()).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => signalCare());
    expect(banner()).toBeNull();
  });

  it("closes with Esc too, and stays quiet even where storage is refused", () => {
    render(<CareBanner />);
    const banner = () => screen.queryByRole("complementary", { name: "마음 돌봄 안내" });
    act(() => signalCare());
    expect(banner()).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(banner()).toBeNull();
    localStorage.clear();
    const denied = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    act(() => signalCare());
    expect(banner()).toBeNull();
    denied.mockRestore();
  });

  it("is signalled by a generation whose body says care, and only then", async () => {
    let opened = 0;
    const count = () => opened++;
    window.addEventListener("starlog:care", count);
    const answer = (data: unknown) => async () =>
      new Response(`${JSON.stringify({ type: "done", data })}\n`, { headers: { "content-type": "application/x-ndjson" } });
    const accept = (d: unknown): d is unknown => typeof d === "object" && d !== null;
    await postGeneration("/api/tarot/teaser", {}, { accept, fetchImpl: answer({ firstCard: {}, care: true }) as unknown as typeof fetch });
    expect(opened).toBe(1);
    await postGeneration("/api/tarot/teaser", {}, { accept, fetchImpl: answer({ firstCard: {} }) as unknown as typeof fetch });
    expect(opened).toBe(1);
    window.removeEventListener("starlog:care", count);
  });
});
