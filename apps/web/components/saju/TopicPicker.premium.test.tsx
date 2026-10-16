// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPremiumStatusForTests } from "@/lib/premium/status";
import { TopicPicker } from "./TopicPicker";

const OCT = Date.parse("2026-10-20T12:00:00+09:00");
const NOV15 = Date.parse("2026-11-15T00:00:00+09:00");

type Visible = { match: boolean; newyear: boolean };
function stub({ match, newyear }: Visible) {
  const fetchMock = vi.fn(async () =>
    Response.json({
      products: [
        { id: "tarot-deep", open: match, visible: match, opensAt: null },
        { id: "match", open: match, visible: match, opensAt: null },
        { id: "newyear-2027", open: false, visible: newyear, opensAt: NOV15 },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OCT);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetPremiumStatusForTests();
});

const topicLinks = () => within(screen.getByRole("list", { name: "무엇이 궁금해요?" })).getAllByRole("link");

describe("TopicPicker's premium rows (owner 2026-10-16)", () => {
  it("draws nothing new while premium is off: the five rows only, no divider or 프리미엄 label", async () => {
    const fetchMock = stub({ match: false, newyear: false });
    const { container } = render(<TopicPicker />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(topicLinks()).toHaveLength(5);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.queryByText("프리미엄")).toBeNull();
    expect(container.querySelector("hr")).toBeNull();
  });

  it("draws nothing new when the status cannot be read", async () => {
    const fetchMock = vi.fn(async () => Promise.reject(new TypeError("offline")));
    vi.stubGlobal("fetch", fetchMock);
    render(<TopicPicker />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.queryByText("프리미엄")).toBeNull();
  });

  it("adds, under a divider and a small 프리미엄 label, 프리미엄 궁합 and 2027 신년운세 with their prices; the five rows stay as they were", async () => {
    stub({ match: true, newyear: true });
    const { container } = render(<TopicPicker />);
    const premium = await screen.findByRole("list", { name: "프리미엄" });
    expect(container.querySelector("hr")).not.toBeNull();
    expect(topicLinks()).toHaveLength(5);
    const match = within(premium).getByRole("link", { name: /프리미엄 궁합/ });
    expect(match.getAttribute("href")).toBe("/premium/match/new");
    expect(match.textContent).toContain("7,900원");
    // Before 2026-11-15 00:00 KST: says when it opens, cannot be followed.
    const year = within(premium).getByRole("link", { name: /2027 신년운세/ });
    expect(year.getAttribute("href")).toBeNull();
    expect(year.getAttribute("aria-disabled")).toBe("true");
    expect(year.textContent).toContain("11월 15일 열려요");
    expect(year.textContent).toContain("14,900원");
  });

  it("opens the 2027 신년운세 row from 2026-11-15 00:00 KST", async () => {
    vi.setSystemTime(NOV15);
    stub({ match: true, newyear: true });
    render(<TopicPicker />);
    const year = await screen.findByRole("link", { name: /2027 신년운세/ });
    expect(year.getAttribute("href")).toBe("/premium/newyear-2027/new");
    expect(year.hasAttribute("aria-disabled")).toBe(false);
  });

  it("draws each row by its own product's visibility", async () => {
    stub({ match: false, newyear: true });
    render(<TopicPicker />);
    const premium = await screen.findByRole("list", { name: "프리미엄" });
    expect(within(premium).getAllByRole("link")).toHaveLength(1);
    expect(within(premium).queryByText(/프리미엄 궁합/)).toBeNull();
  });
});
