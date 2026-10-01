// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CONSTELLATIONS } from "@starlog/core";
import { ConstellationArt } from "./ConstellationArt";
import { FIGURES } from "./art/figures";

afterEach(cleanup);

describe("ConstellationArt", () => {
  it("has a figure path for every sign", () => {
    for (const c of CONSTELLATIONS) expect(FIGURES[c.id]).toMatch(/^M/);
  });

  it("names the sign and its progress, and draws one circle per slot", () => {
    const { container } = render(<ConstellationArt sign="aries" lit={2} newSlots={[1]} size={240} />);
    expect(screen.getByRole("img", { name: "양자리, 별 4개 중 2개" })).toBeTruthy();
    expect(container.querySelectorAll("[data-star]")).toHaveLength(4);
    expect(container.querySelectorAll('[data-star="lit"]')).toHaveLength(2);
    expect(container.querySelectorAll("[data-new]")).toHaveLength(1);
  });

  it("draws nickname labels when given", () => {
    render(<ConstellationArt sign="libra" lit={4} newSlots={[]} labels={["민지", "하늘", "도윤", "서아"]} size={400} />);
    for (const n of ["민지", "하늘", "도윤", "서아"]) expect(screen.getByText(n)).toBeTruthy();
  });

  it("lights exact slots when a star was removed, and joins only lit stars in gold", () => {
    const { container } = render(<ConstellationArt sign="aries" lit={[0, 2, 3]} size={240} />);
    const stars = [...container.querySelectorAll("[data-star]")].map((el) => el.getAttribute("data-star"));
    expect(stars).toEqual(["lit", "empty", "lit", "lit"]);
    expect(screen.getByRole("img", { name: "양자리, 별 4개 중 3개" })).toBeTruthy();
  });

  it("hides itself from assistive tech when decorative", () => {
    const { container } = render(<ConstellationArt sign="leo" lit={0} size={64} decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
