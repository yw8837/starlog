// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OTHER_TOPICS_LABEL, TOPIC_SWITCH_HELP } from "@/lib/sajuTopics";
import { TopicRow } from "./TopicRow";

afterEach(cleanup);

const group = () => screen.getByRole("group", { name: OTHER_TOPICS_LABEL });

describe("TopicRow (owner cut: four buttons under the 사주팔자 teaser)", () => {
  it("shows exactly the four 운 in the owner's order, none pressed on the 사주팔자, and no way back", () => {
    render(<TopicRow topic="overall" onPick={() => {}} onBack={() => {}} />);
    const buttons = within(group()).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["연애운", "재회운", "재물운", "직장운"]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false"]);
    expect(screen.queryByRole("button", { name: "사주팔자로 돌아가기" })).toBeNull();
    expect(screen.getByText(TOPIC_SWITCH_HELP)).toBeTruthy();
  });

  it("presses the 운 on screen, offers the way back, and reports a pick", () => {
    const onPick = vi.fn();
    const onBack = vi.fn();
    render(<TopicRow topic="money" onPick={onPick} onBack={onBack} />);
    expect(within(group()).getByRole("button", { name: "재물운" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(group()).getByRole("button", { name: "직장운" }));
    expect(onPick).toHaveBeenCalledWith("career");
    fireEvent.click(screen.getByRole("button", { name: "사주팔자로 돌아가기" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
