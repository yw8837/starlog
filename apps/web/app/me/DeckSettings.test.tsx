// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TarotCard } from "@/components/tarot/TarotCard";
import { DECK_KEY } from "@/lib/deck";
import { DeckSettings } from "./DeckSettings";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const saved = () => JSON.parse(localStorage.getItem(DECK_KEY) ?? "null");
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
/** The small picture inside an option's tile. */
const preview = (name: string) => radio(name).closest("label")?.querySelector("img")?.getAttribute("src");

describe("DeckSettings", () => {
  it("is the 카드 디자인 section, with a radio group for the front and one for the back", () => {
    render(<DeckSettings />);
    const section = screen.getByRole("region", { name: "카드 디자인" });
    expect(within(section).getByRole("heading", { level: 2, name: "카드 디자인" })).toBeTruthy();
    const front = within(section).getByRole("radiogroup", { name: "앞면" });
    const back = within(section).getByRole("radiogroup", { name: "뒷면" });
    expect(within(front).getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["starlog", "rws1909"]);
    expect(within(back).getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["constellation", "navy-gold", "ribbon-garden", "moon-guardian"]);
    expect(within(front).getByRole("radio", { name: "스타로그 카드" })).toBeTruthy();
    expect(within(front).getByRole("radio", { name: "1909 원판" })).toBeTruthy();
    for (const name of ["별자리 지도", "남색 금선", "아이보리 리본 정원", "달빛 수호 문양"]) expect(within(back).getByRole("radio", { name })).toBeTruthy();
  });

  it("has real radio buttons, one name per group, so the arrow keys move inside a group and Tab visits it once", () => {
    render(<DeckSettings />);
    const inputs = (group: string) => within(screen.getByRole("radiogroup", { name: group })).getAllByRole("radio") as HTMLInputElement[];
    const front = inputs("앞면");
    const back = inputs("뒷면");
    for (const input of [...front, ...back]) expect(input.tagName === "INPUT" && input.type).toBe("radio");
    expect(new Set(front.map((input) => input.name)).size).toBe(1);
    expect(new Set(back.map((input) => input.name)).size).toBe(1);
    expect(front[0]?.name).not.toBe(back[0]?.name);
  });

  it("starts on the Starlog deck and the 별자리 지도 back, both marked 기본", () => {
    render(<DeckSettings />);
    expect(radio("스타로그 카드").checked).toBe(true);
    expect(radio("1909 원판").checked).toBe(false);
    expect(radio("별자리 지도").checked).toBe(true);
    for (const name of ["남색 금선", "아이보리 리본 정원", "달빛 수호 문양"]) expect(radio(name).checked).toBe(false);
    expect(screen.getByRole("radio", { name: "스타로그 카드", description: "기본" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "별자리 지도", description: "기본" })).toBeTruthy();
    expect(screen.getAllByText("기본")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: "1909 원판", description: "기본" })).toBeNull();
  });

  it("shows 바보 (0) in each deck and a thumbnail of each back", () => {
    render(<DeckSettings />);
    expect(preview("스타로그 카드")).toBe("/cards/starlog/major-00-fool-sm.webp");
    expect(preview("1909 원판")).toBe("/cards/major-00-fool-sm.webp");
    expect(preview("별자리 지도")).toBe("/cards/backs/constellation-sm.webp");
    expect(preview("남색 금선")).toBe("/cards/backs/navy-gold-sm.webp");
    expect(preview("아이보리 리본 정원")).toBe("/cards/backs/ribbon-garden-sm.webp");
    expect(preview("달빛 수호 문양")).toBe("/cards/backs/moon-guardian-sm.webp");
    // the pictures are decorative: the option's name is its label
    for (const img of screen.getByRole("region", { name: "카드 디자인" }).querySelectorAll("img")) expect(img.getAttribute("alt")).toBe("");
  });

  it("opens on what this device chose", () => {
    localStorage.setItem(DECK_KEY, JSON.stringify({ front: "rws1909", back: "moon-guardian" }));
    render(<DeckSettings />);
    expect([radio("1909 원판").checked, radio("스타로그 카드").checked, radio("달빛 수호 문양").checked, radio("별자리 지도").checked]).toEqual([true, false, true, false]);
  });

  it("switches at once, with no save button, and remembers it", () => {
    render(<DeckSettings />);
    fireEvent.click(radio("1909 원판"));
    expect([radio("1909 원판").checked, radio("스타로그 카드").checked]).toEqual([true, false]);
    expect(saved()).toEqual({ front: "rws1909", back: "constellation" });
    fireEvent.click(radio("아이보리 리본 정원"));
    expect([radio("아이보리 리본 정원").checked, radio("별자리 지도").checked]).toEqual([true, false]);
    // the other half is left as it was
    expect(radio("1909 원판").checked).toBe(true);
    expect(saved()).toEqual({ front: "rws1909", back: "ribbon-garden" });
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.click(radio("스타로그 카드"));
    expect(saved()).toEqual({ front: "starlog", back: "ribbon-garden" });
  });

  it("turns the cards already on the page as soon as one is picked", () => {
    render(
      <>
        <DeckSettings />
        <div data-testid="card">
          <TarotCard cardId="major-00-fool" faceUp />
        </div>
      </>,
    );
    const imgs = () => [...screen.getByTestId("card").querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(imgs()).toEqual(["/cards/backs/constellation-sm.webp", "/cards/starlog/major-00-fool-sm.webp"]);
    fireEvent.click(radio("1909 원판"));
    fireEvent.click(radio("남색 금선"));
    expect(imgs()).toEqual(["/cards/backs/navy-gold-sm.webp", "/cards/major-00-fool-sm.webp"]);
  });

  it("says nothing of any model or vendor, and never calls the app a beta", () => {
    render(<DeckSettings />);
    const text = screen.getByRole("region", { name: "카드 디자인" }).textContent ?? "";
    expect(text).not.toMatch(/베타|beta|Claude|Anthropic|GPT|OpenAI|Gemini|Codex|image_gen/i);
  });
});
