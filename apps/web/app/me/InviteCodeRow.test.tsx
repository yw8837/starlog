// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteCodeRow } from "./InviteCodeRow";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const inList = (ui: React.ReactElement) => render(<ul>{ui}</ul>);

describe("InviteCodeRow", () => {
  beforeEach(() => push.mockReset());
  afterEach(() => cleanup());

  it("is one quiet menu row until opened, then shows the code box with the invite-link hint", () => {
    inList(<InviteCodeRow enabled />);
    const row = screen.getByRole("button", { name: "초대코드로 참여" });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("textbox", { name: "초대코드" })).toBeTruthy();
    expect(screen.getByText("친구가 보낸 링크로 들어오면 코드는 자동으로 들어가요")).toBeTruthy();

    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("asks again for a code that cannot be one, and takes a good one to /b/<CODE>", () => {
    inList(<InviteCodeRow enabled />);
    fireEvent.click(screen.getByRole("button", { name: "초대코드로 참여" }));
    const input = screen.getByRole("textbox", { name: "초대코드" });

    fireEvent.change(input, { target: { value: "k7m" } });
    fireEvent.click(screen.getByRole("button", { name: "참여" }));
    expect(screen.getByRole("alert").textContent).toBe("코드를 다시 확인해 주세요");
    expect(push).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "k7m 4qx" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "참여" }));
    expect(push).toHaveBeenCalledWith("/b/K7M4QX");
  });

  it("renders nothing while 별자리 인연 is off", () => {
    const { container } = inList(<InviteCodeRow enabled={false} />);
    expect(container.querySelector("li")).toBeNull();
  });
});
