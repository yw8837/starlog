// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DECK_KEY, setDeckPrefs } from "@/lib/deck";
import { TarotCard } from "./TarotCard";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const FOOL = "major-00-fool";

/** The card's two pictures and the box around them. */
function parts(container: HTMLElement) {
  return {
    back: container.querySelector('img[src*="/cards/backs/"]'),
    face: container.querySelector(`img[src*="${FOOL}"]`),
    box: container.querySelector("[data-face]")?.firstElementChild ?? null,
  };
}

/** A picture's `src` (the small file) and `srcset` (the small and the large file, with their widths). */
const sources = (img: Element | null) => [img?.getAttribute("src"), img?.getAttribute("srcset")];

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

describe("TarotCard art", () => {
  it("draws the Starlog face and the 별자리 지도 back until the visitor chooses", () => {
    const { container } = render(<TarotCard cardId={FOOL} faceUp />);
    const { back, face } = parts(container);
    expect(sources(face)).toEqual(["/cards/starlog/major-00-fool-sm.webp", "/cards/starlog/major-00-fool-sm.webp 240w, /cards/starlog/major-00-fool.webp 600w"]);
    expect(sources(back)).toEqual(["/cards/backs/constellation-sm.webp", "/cards/backs/constellation-sm.webp 240w, /cards/backs/constellation.webp 600w"]);
    // both fill the 600:1040 box exactly
    for (const img of [face, back]) expect([img?.getAttribute("width"), img?.getAttribute("height")]).toEqual(["600", "1040"]);
  });

  it("follows the saved choice: the 1909 face and the chosen back", () => {
    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "rws1909", back: "navy-gold" }));
    const { container } = render(<TarotCard cardId={FOOL} faceUp />);
    const { back, face } = parts(container);
    expect(sources(face)).toEqual(["/cards/major-00-fool-sm.webp", "/cards/major-00-fool-sm.webp 240w, /cards/major-00-fool.webp 600w"]);
    expect(sources(back)).toEqual(["/cards/backs/navy-gold-sm.webp", "/cards/backs/navy-gold-sm.webp 240w, /cards/backs/navy-gold.webp 600w"]);
  });

  it("lets `deck` pin the face to one deck, whatever was chosen; the back still follows the choice", () => {
    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "starlog", back: "moon-guardian" }));
    const pinned1909 = render(<TarotCard cardId={FOOL} faceUp deck="rws1909" />).container;
    expect(parts(pinned1909).face?.getAttribute("src")).toBe("/cards/major-00-fool-sm.webp");
    expect(parts(pinned1909).back?.getAttribute("src")).toBe("/cards/backs/moon-guardian-sm.webp");
    cleanup();

    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "rws1909", back: "constellation" }));
    const pinnedStarlog = render(<TarotCard cardId={FOOL} faceUp deck="starlog" />).container;
    expect(parts(pinnedStarlog).face?.getAttribute("src")).toBe("/cards/starlog/major-00-fool-sm.webp");
  });

  it("changes every card on the page at once when the choice changes", () => {
    const { container } = render(
      <>
        <TarotCard cardId={FOOL} faceUp />
        <TarotCard cardId="wands-01" faceUp={false} />
        <TarotCard cardId="cups-14" faceUp deck="rws1909" />
      </>,
    );
    const srcs = () => [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(srcs()).toEqual([
      "/cards/backs/constellation-sm.webp",
      "/cards/starlog/major-00-fool-sm.webp",
      "/cards/backs/constellation-sm.webp",
      "/cards/starlog/wands-01-sm.webp",
      "/cards/backs/constellation-sm.webp",
      "/cards/cups-14-sm.webp",
    ]);
    act(() => setDeckPrefs({ front: "rws1909", back: "ribbon-garden" }));
    expect(srcs()).toEqual([
      "/cards/backs/ribbon-garden-sm.webp",
      "/cards/major-00-fool-sm.webp",
      "/cards/backs/ribbon-garden-sm.webp",
      "/cards/wands-01-sm.webp",
      "/cards/backs/ribbon-garden-sm.webp",
      "/cards/cups-14-sm.webp",
    ]);
  });

  it("gives a card whose face is not known yet the chosen back and no face at all", () => {
    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "starlog", back: "ribbon-garden" }));
    const { container } = render(<TarotCard faceUp={false} />);
    expect([...container.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual(["/cards/backs/ribbon-garden-sm.webp"]);
  });
});
