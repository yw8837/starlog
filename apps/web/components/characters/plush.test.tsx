// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Cat } from "./Cat";
import { Rabbit } from "./Rabbit";

const hrefs = (root: HTMLElement) => Array.from(root.querySelectorAll("image")).map((el) => el.getAttribute("href"));

describe("plush character art", () => {
  afterEach(cleanup);

  it("draws the cut-out for an outfit that has one, keeping the tap button and its label", () => {
    const { container } = render(<Cat outfit="tarot" size={120} art="plush" />);
    expect(hrefs(container)).toEqual(["/characters/cat-tarot.v1-600.webp"]);
    expect(screen.getByRole("button", { name: "별을 읽는 점성술사 고양이" })).toBeTruthy();
  });

  it("uses the 300 px file at small sizes", () => {
    const { container } = render(<Rabbit outfit="hanbok" size={72} art="plush" reactOnTap={false} />);
    expect(hrefs(container)).toEqual(["/characters/rabbit-hanbok.v1-300.webp"]);
  });

  it("falls back to the vector drawing when the outfit has no plush art, and by default", () => {
    expect(hrefs(render(<Cat outfit="hanbok" size={120} art="plush" />).container)).toEqual([]);
    cleanup();
    expect(hrefs(render(<Rabbit outfit="hanbok" size={120} />).container)).toEqual([]);
  });
});
