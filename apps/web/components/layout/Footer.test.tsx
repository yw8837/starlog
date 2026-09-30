// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A mutable copy of the business details, so each test can fill fields the real config leaves empty.
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, SITE: { ...actual.SITE, business: { ...actual.SITE.business } } };
});

const { SITE } = await import("@/lib/config");
const { Footer } = await import("./Footer");

const business = SITE.business as Record<keyof typeof SITE.business, string>;
const original = { ...business };

describe("Footer", () => {
  beforeEach(() => {
    Object.assign(business, original);
  });

  afterEach(() => {
    cleanup();
  });

  it("links the terms, privacy policy, refund policy and pricing, in that order", () => {
    render(<Footer />);
    const links = screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([
      ["이용약관", "/terms"],
      ["개인정보처리방침", "/privacy"],
      ["환불 정책", "/refund"],
      ["가격 안내", "/pricing"],
    ]);
  });

  it("sets the privacy policy apart", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "개인정보처리방침" }).querySelector("strong")).not.toBeNull();
    expect(screen.getByRole("link", { name: "이용약관" }).querySelector("strong")).toBeNull();
  });

  it("shows the business notice without any address", () => {
    const { container } = render(<Footer />);
    const text = container.textContent ?? "";
    expect(text).toContain("상호 열매스튜디오");
    expect(text).toContain("사업자등록번호 665-38-01736");
    expect(text).not.toContain("주소");
  });

  it("never renders an address, even when one is configured", () => {
    business.address = "서울시 어딘가 1";
    const { container } = render(<Footer />);
    expect(container.textContent).not.toContain("서울시 어딘가");
    expect(container.textContent).not.toContain("주소");
  });

  it("adds email and phone once they are filled", () => {
    business.email = "hello@example.com";
    business.phone = "02-000-0000";
    const { container } = render(<Footer />);
    expect(container.textContent).toContain("이메일 hello@example.com");
    expect(container.textContent).toContain("전화 02-000-0000");
  });
});
