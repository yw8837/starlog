// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TopicPicker } from "./TopicPicker";

afterEach(cleanup);

describe("TopicPicker (saju step 1, owner 2026-10-14)", () => {
  it("offers 사주팔자 and the four 운 in the owner's order, each a link to the birth step carrying its topic and one line of what it reads", () => {
    render(<TopicPicker />);
    const list = screen.getByRole("list", { name: "무엇이 궁금해요?" });
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/saju/new?topic=overall",
      "/saju/new?topic=love",
      "/saju/new?topic=reunion",
      "/saju/new?topic=money",
      "/saju/new?topic=career",
    ]);
    expect(links.map((a) => a.querySelector("strong")?.textContent)).toEqual(["사주팔자", "연애운", "재회운", "재물운", "직장운"]);
    for (const link of links) expect(link.querySelector("span")?.textContent?.trim()).toMatch(/봐요$/);
  });
});
