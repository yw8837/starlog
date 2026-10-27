// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OpenFromHash } from "./OpenFromHash";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

function page(hash: string) {
  window.history.replaceState(null, "", `/help${hash}`);
  return render(
    <>
      <details id="tarot-now-guide">
        <summary>지금의 한 장</summary>
      </details>
      <OpenFromHash />
    </>,
  );
}

describe("OpenFromHash", () => {
  it("opens the card the address names", () => {
    const { container } = page("#tarot-now-guide");
    expect(container.querySelector("details")!.open).toBe(true);
  });

  it("opens it when the moved guide URL carried a query (the redirect puts it after the #: #tarot-now-guide?utm_source=threads)", () => {
    const { container } = page("#tarot-now-guide?utm_source=threads");
    expect(container.querySelector("details")!.open).toBe(true);
  });

  it("leaves the page as it is on a malformed address (#%E0) instead of throwing", () => {
    const { container } = page("#%E0");
    expect(container.querySelector("details")!.open).toBe(false);
  });
});
