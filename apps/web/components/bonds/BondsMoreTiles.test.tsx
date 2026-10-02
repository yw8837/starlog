// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BondsMoreTiles } from "./BondsMoreTiles";

describe("BondsMoreTiles", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(cleanup);

  const ranking = () => screen.getByRole("link", { name: /^별자리 인연 랭킹/ });

  it("says this week's best record under 별자리 인연 랭킹 when it has no line of its own (the /bonds page)", () => {
    render(<BondsMoreTiles weekTop={{ sign: "aries", total: 422 }} />);
    expect(ranking().textContent).toBe("별자리 인연 랭킹이번 주 양자리 1위 422점");
    expect(ranking().getAttribute("href")).toBe("/ranking");
    cleanup();
    render(<BondsMoreTiles weekTop={null} />);
    expect(ranking().textContent).toBe("별자리 인연 랭킹첫 1위에 도전해 보세요");
    cleanup();
    // no record could be read: a plain line
    render(<BondsMoreTiles />);
    expect(ranking().textContent).toBe("별자리 인연 랭킹별자리마다 이번 주 1~3위");
  });

  it("shows the line it is given instead (the home row: my score and rank), and still leads to /ranking", () => {
    render(<BondsMoreTiles weekTop={{ sign: "aries", total: 422 }} rankLine="내 양자리 412점 · 이번 주 3위" />);
    expect(ranking().textContent).toBe("별자리 인연 랭킹내 양자리 412점 · 이번 주 3위");
    expect(ranking().getAttribute("href")).toBe("/ranking");
    expect(screen.getByRole("link", { name: /^이번 주 행운 번호/ }).getAttribute("href")).toBe("/lucky");
  });
});
