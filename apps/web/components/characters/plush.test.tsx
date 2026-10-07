// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Cat } from "./Cat";
import { Rabbit } from "./Rabbit";

const hrefs = (root: HTMLElement) => Array.from(root.querySelectorAll("image")).map((el) => el.getAttribute("href"));

describe("plush character art", () => {
  afterEach(cleanup);

  it("is the default and keeps the tap button and its label", () => {
    const { container } = render(<Cat outfit="tarot" size={120} />);
    expect(hrefs(container)).toEqual(["/characters/cat-tarot.v1-600.webp"]);
    expect(screen.getByRole("button", { name: "별을 읽는 점성술사 고양이" })).toBeTruthy();
  });

  it("uses the 300 px file at small sizes", () => {
    const { container } = render(<Rabbit outfit="hanbok" size={72} reactOnTap={false} />);
    expect(hrefs(container)).toEqual(["/characters/rabbit-hanbok.v2-300.webp"]);
  });

  it("picks the pose from the action, and the idle pose for anything else", () => {
    expect(hrefs(render(<Cat outfit="tarot" action="shuffle" size={120} />).container)).toEqual(["/characters/cat-tarot-card.v1-600.webp"]);
    cleanup();
    expect(hrefs(render(<Cat outfit="tarot" action="glow" size={120} />).container)).toEqual(["/characters/cat-tarot-card.v1-600.webp"]);
    cleanup();
    expect(hrefs(render(<Rabbit outfit="tarot" action="write" size={168} />).container)).toEqual(["/characters/rabbit-tarot-write.v1-600.webp"]);
    cleanup();
    expect(hrefs(render(<Rabbit outfit="tarot" size={150} />).container)).toEqual(["/characters/rabbit-tarot.v1-600.webp"]);
    cleanup();
    expect(hrefs(render(<Cat outfit="hanbok" action="write" size={64} />).container)).toEqual(["/characters/cat-hanbok.v1-300.webp"]);
  });

  it("draws the vector figure when asked for it", () => {
    expect(hrefs(render(<Cat outfit="tarot" size={120} art="vector" />).container)).toEqual([]);
    cleanup();
    expect(hrefs(render(<Rabbit outfit="hanbok" size={120} art="vector" />).container)).toEqual([]);
  });
});
