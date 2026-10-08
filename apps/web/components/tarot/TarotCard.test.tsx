// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TarotCard } from "./TarotCard";

afterEach(cleanup);

const FOOL = "major-00-fool";

/** The card's two pictures and the box around them. */
function parts(container: HTMLElement) {
  return {
    back: container.querySelector('img[src="/cards/back.svg"]'),
    face: container.querySelector("img[srcset]"),
    box: container.querySelector("[data-face]")?.firstElementChild ?? null,
  };
}

describe("TarotCard without an alt", () => {
  it("keeps both pictures decorative; a label makes the box the one image", () => {
    const { container } = render(<TarotCard cardId={FOOL} faceUp label="바보 카드 그림" />);
    const { back, face, box } = parts(container);
    expect([back?.getAttribute("alt"), face?.getAttribute("alt")]).toEqual(["", ""]);
    expect(box?.getAttribute("role")).toBe("img");
    expect(box?.getAttribute("aria-label")).toBe("바보 카드 그림");
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("hides the whole card from assistive tech when it has no label either", () => {
    const { container } = render(<TarotCard cardId={FOOL} faceUp />);
    const { back, face, box } = parts(container);
    expect([back?.getAttribute("alt"), face?.getAttribute("alt")]).toEqual(["", ""]);
    expect(box?.getAttribute("aria-hidden")).toBe("true");
    expect(box?.hasAttribute("role")).toBe(false);
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("TarotCard with an alt", () => {
  it("gives the face-up picture the alt, keeps the back empty, and leaves the box neither a second image nor hidden", () => {
    const { container } = render(<TarotCard cardId={FOOL} faceUp alt="바보 타로 카드" />);
    const { back, face, box } = parts(container);
    expect(face?.getAttribute("alt")).toBe("바보 타로 카드");
    expect(back?.getAttribute("alt")).toBe("");
    for (const attribute of ["role", "aria-label", "aria-hidden"]) expect(box?.hasAttribute(attribute), attribute).toBe(false);
    // announced once: the face is the only image assistive tech finds
    expect(screen.getAllByRole("img").map((img) => img.getAttribute("alt"))).toEqual(["바보 타로 카드"]);
  });

  it("lets the alt name the card instead of a label, so a screen reader does not say it twice", () => {
    const { container } = render(<TarotCard cardId={FOOL} faceUp alt="바보 타로 카드" label="바보 카드 그림" />);
    expect(parts(container).box?.hasAttribute("role")).toBe(false);
    expect(screen.queryByRole("img", { name: "바보 카드 그림" })).toBeNull();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("gives nothing away while the card is face down: the face stays empty and the card stays hidden", () => {
    const { container } = render(<TarotCard cardId={FOOL} faceUp={false} alt="바보 타로 카드" />);
    const { face, box } = parts(container);
    expect(face?.getAttribute("alt")).toBe("");
    expect(box?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("treats an empty alt as none", () => {
    const { container } = render(<TarotCard cardId={FOOL} faceUp alt="" label="바보 카드 그림" />);
    const { face, box } = parts(container);
    expect(face?.getAttribute("alt")).toBe("");
    expect(box?.getAttribute("role")).toBe("img");
    expect(box?.getAttribute("aria-label")).toBe("바보 카드 그림");
  });
});
