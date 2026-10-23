// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LuckyPage, { generateMetadata } from "./page";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

/** A shared 이번 주 행운 번호 opens those numbers (owner 2026-10-23: a share lands on what was shared), then one's own form. */

afterEach(cleanup);
const props = (query: Record<string, string>) => ({ searchParams: Promise.resolve(query) }) as never;

describe("/lucky?n=…&w=…", () => {
  it("shows the shared six numbers and their week above the form, with their image as the preview", async () => {
    render(await LuckyPage(props({ n: "4-9-17-23-31-40", w: "2026-10-19" })));
    const shared = screen.getByRole("region", { name: "친구의 이번 주 행운 번호" });
    expect(shared.textContent).toContain("10월 19일부터 한 주");
    for (const n of [4, 9, 17, 23, 31, 40]) expect(shared.textContent).toContain(String(n));
    const meta = await generateMetadata(props({ n: "4-9-17-23-31-40", w: "2026-10-19" }));
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: "/api/og/lucky?n=4-9-17-23-31-40&w=2026-10-19" })]);
  });

  it("shows only the form for anything but six distinct numbers in 1–45 and a week", async () => {
    render(await LuckyPage(props({ n: "4-9-17-23-31-99", w: "2026-10-19" })));
    expect(screen.queryByRole("region", { name: "친구의 이번 주 행운 번호" })).toBeNull();
    cleanup();
    render(await LuckyPage(props({})));
    expect(screen.queryByRole("region", { name: "친구의 이번 주 행운 번호" })).toBeNull();
  });
});
