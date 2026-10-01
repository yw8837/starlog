// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dogam } from "./Dogam";

describe("Dogam", () => {
  it("links all 12 cells to their ranking pages and shows states", () => {
    render(<Dogam completed={["aries"]} filling={{ sign: "leo", filled: 2 }} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(12);
    expect(links[0]?.getAttribute("href")).toBe("/ranking/aries");
    expect(links[11]?.getAttribute("href")).toBe("/ranking/pisces");
    expect(screen.getByRole("link", { name: /양자리.*완성/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /사자자리.*2\/6/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^처녀자리 · 랭킹 보기$/ })).toBeTruthy();
  });
});
