// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareImageButton } from "./ShareImageButton";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ShareImageButton with a body (premium share images, plan task 23)", () => {
  it("posts the body as JSON to the image route instead of a GET", async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })));
    vi.stubGlobal("fetch", fetchMock);
    const body = { product: "newyear-2027", title: "차근차근 쌓아 가는 해" };
    render(<ShareImageButton imageUrl="/api/og/premium" body={body} fileName="starlog-newyear-2027.png" shareText="스타로그 · 2027 신년운세" shareUrl="https://starlog.yeolmaeapps.kr/premium/newyear-2027" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "공유하기" }));
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/og/premium");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual(body);
  });
});
