// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PricingPage from "./page";

afterEach(cleanup);

describe("/pricing 결제 수단 in the Starlog app (W2.3)", () => {
  it("marks the web payment method and the Toss receipt web-only, with an app-only line that says Google Play", () => {
    const { container } = render(<PricingPage />);
    const section = container.querySelector("#payment")!.closest("section") ?? container;
    const paragraphs = [...section.querySelectorAll("p")];
    const toss = paragraphs.find((p) => p.textContent?.includes("토스페이먼츠"))!;
    const receipt = paragraphs.find((p) => p.textContent?.startsWith("영수증은"))!;
    expect(toss.className).toBe("web-only");
    expect(receipt.className).toBe("web-only");
    const app = paragraphs.filter((p) => p.className === "app-only").map((p) => p.textContent);
    expect(app).toEqual(["앱에서는 Google Play로 결제해요. 풀이는 건별로 결제하고, 결제하면 바로 열려요.", "결제 내역은 내 정보 > 결제 내역에서 볼 수 있어요."]);
    expect(app.join(" ")).not.toMatch(/토스|카드|간편결제|영수증/);
  });
});
