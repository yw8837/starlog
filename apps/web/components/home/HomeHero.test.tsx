// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomeHero } from "./HomeEntries";

afterEach(cleanup);

describe("the home hero", () => {
  it("says what each guide is before its name, so 타로로 never reads as 타로 + 로", () => {
    render(<HomeHero />);
    expect(screen.getByText("타로는 고양이 타로로가, 사주는 토끼 사주주가 내 상황에 맞춰 읽어 드려요.")).toBeTruthy();
  });
});
