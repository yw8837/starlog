// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GUIDE_HOST_LINES, GuideHost } from "./GuideHost";

describe("GuideHost", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("prerenders line 1", () => {
    expect(renderToString(<GuideHost category="tarot" />)).toContain(GUIDE_HOST_LINES.tarot[0]);
  });

  it("takes a random line after mount and a different one on every tap", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5); // 8 lines: index 4
    render(<GuideHost category="saju" />);
    expect(screen.getByText(GUIDE_HOST_LINES.saju[4])).toBeTruthy();

    const host = screen.getByRole("button", { name: "한복 입은 토끼 선생님" });
    random.mockReturnValue(0.6); // 7 others: pick 4, which skips the current 4 to land on 5
    fireEvent.click(host);
    expect(screen.getByText(GUIDE_HOST_LINES.saju[5])).toBeTruthy();

    random.mockReturnValue(0); // pick 0
    fireEvent.click(host);
    expect(screen.getByText(GUIDE_HOST_LINES.saju[0])).toBeTruthy();
  });
});
