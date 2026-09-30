// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WORDMARK_STAR_PATH, Wordmark, wordmarkParts } from "./Wordmark";

describe("Wordmark", () => {
  it("splits the name around its last o", () => {
    expect(wordmarkParts("Starlog")).toEqual({ head: "Starl", tail: "g" });
    expect(wordmarkParts("Star")).toEqual({ head: "Star", tail: "" });
  });

  it("reads as the plain service name and draws the star", () => {
    const { container } = render(<Wordmark />);
    expect(screen.getByRole("img", { name: "Starlog" })).toBeTruthy();
    expect(container.querySelector("path")?.getAttribute("d")).toBe(WORDMARK_STAR_PATH);
    expect(container.textContent).toBe("Starlg");
  });
});
