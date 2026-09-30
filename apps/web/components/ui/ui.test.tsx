// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Segmented } from "./Segmented";

afterEach(cleanup);

describe("Chip", () => {
  it("is a toggle when it has a selected state", () => {
    render(
      <>
        <Chip selected>연락</Chip>
        <Chip selected={false}>재회</Chip>
      </>,
    );
    expect(screen.getByRole("button", { name: "연락" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "재회" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("is a plain one-shot button without one", () => {
    render(<Chip>보내고 나서는 어떻게 하죠?</Chip>);
    const chip = screen.getByRole("button", { name: "보내고 나서는 어떻게 하죠?" });
    expect(chip.hasAttribute("aria-pressed")).toBe(false);
    expect(chip.getAttribute("type")).toBe("button");
  });
});

describe("Segmented", () => {
  const options = [
    { value: "plain", label: "풀이" },
    { value: "story", label: "이야기" },
  ] as const;

  it("is a named group of toggles with exactly one pressed", () => {
    render(<Segmented label="읽는 방식" options={options} value="story" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "읽는 방식" });
    const buttons = [...group.querySelectorAll("button")];
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    expect(screen.getByRole("button", { name: "이야기" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Button", () => {
  it("renders a link when it has an href", () => {
    render(<Button href="/tarot/new">새 장 열기</Button>);
    expect(screen.getByRole("link", { name: "새 장 열기" }).getAttribute("href")).toBe("/tarot/new");
  });

  it("keeps a disabled link a link: dimmed, without an href, and not a button", () => {
    render(
      <Button href="/tarot/new" disabled>
        새 장 열기
      </Button>,
    );
    const link = screen.getByRole("link", { name: "새 장 열기" });
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.hasAttribute("href")).toBe(false);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("disables a plain button natively", () => {
    render(<Button disabled>다음</Button>);
    expect((screen.getByRole("button", { name: "다음" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
