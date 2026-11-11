// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportReading } from "./ReportReading";

let calls: Array<{ url: string; body: unknown }> = [];
function stubServer(answer: () => Response = () => Response.json({ ok: true })) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return answer();
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReportReading (신고, the Starlog app only)", () => {
  it("is app-only, so the public web never shows it", () => {
    const { container } = render(<ReportReading kind="tarot" />);
    expect((container.firstElementChild as HTMLElement).className).toMatch(/(^|\s)app-only(\s|$)/);
  });

  it("opens a short form from a quiet 신고 button: a fixed reason, an optional note, 보내기 and 취소", () => {
    stubServer();
    render(<ReportReading kind="tarot" />);
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "신고" }));
    expect(screen.getAllByRole("radio").map((radio) => (radio.closest("label") as HTMLElement).textContent)).toEqual([
      "불쾌하거나 모욕적인 내용이에요",
      "위험하거나 해로운 내용이에요",
      "선정적인 내용이에요",
      "사실과 다르거나 오해를 부르는 내용이에요",
      "그 밖의 문제예요",
    ]);
    expect((screen.getByRole("button", { name: "보내기" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).maxLength).toBe(500);
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("radio")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("sends the kind, the reading id, the reason and the note (never the reading), then says it was received", async () => {
    stubServer();
    render(<ReportReading kind="match" readingId="abcdefghij0123456789" />);
    fireEvent.click(screen.getByRole("button", { name: "신고" }));
    fireEvent.click(screen.getByRole("radio", { name: "위험하거나 해로운 내용이에요" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  세 번째 문단이요  " } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(await screen.findByText("신고가 접수됐어요. 확인하고 조치할게요.")).toBeTruthy();
    expect(calls).toEqual([{ url: "/api/readings/report", body: { kind: "match", readingId: "abcdefghij0123456789", reason: "harmful", note: "세 번째 문단이요" } }]);
    expect(screen.queryByRole("button", { name: "신고" })).toBeNull();
  });

  it("leaves out an id it may not send and an empty note", async () => {
    stubServer();
    render(<ReportReading kind="teaser" readingId="local:id with spaces" />);
    fireEvent.click(screen.getByRole("button", { name: "신고" }));
    fireEvent.click(screen.getByRole("radio", { name: "그 밖의 문제예요" }));
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toEqual({ kind: "teaser", reason: "other" });
  });

  it("keeps the form and says so when it could not be sent", async () => {
    stubServer(() => Response.json({ code: "RATE_LIMIT" }, { status: 429 }));
    render(<ReportReading kind="daily" />);
    fireEvent.click(screen.getByRole("button", { name: "신고" }));
    fireEvent.click(screen.getByRole("radio", { name: "선정적인 내용이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(await screen.findByText("보내지 못했어요. 잠시 뒤에 다시 시도해 주세요.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "선정적인 내용이에요" })).toBeTruthy();
  });

  it("uses the site's tokens and no text under 13px", () => {
    const file = ["apps/web/components/report/ReportReading.module.css", "components/report/ReportReading.module.css"].map((path) => resolve(process.cwd(), path)).find((path) => existsSync(path));
    const css = readFileSync(file ?? "", "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    for (const [, size] of css.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(size)).toBeGreaterThanOrEqual(13);
  });
});
