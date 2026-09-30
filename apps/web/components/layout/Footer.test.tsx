// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A mutable copy of the business details, so each test can fill fields the real config leaves empty.
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, SITE: { ...actual.SITE, business: { ...actual.SITE.business } } };
});

const { SITE, footerNotice } = await import("@/lib/config");
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

  it("links the service pages, the guide, pricing and the policies, in that order", () => {
    render(<Footer />);
    const links = screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([
      ["스타로그란?", "/about"],
      ["풀이는 이렇게 만들어져요", "/how"],
      ["이용 가이드", "/help"],
      ["자주 묻는 질문", "/faq"],
      ["가이드 글", "/guide/tarot"],
      ["가격 안내", "/pricing"],
      ["이용약관", "/terms"],
      ["개인정보처리방침", "/privacy"],
      ["환불 정책", "/refund"],
    ]);
  });

  it("groups the links into two labelled rows", () => {
    render(<Footer />);
    const rows = screen.getAllByRole("navigation").map((nav) => [nav.getAttribute("aria-label"), within(nav).getAllByRole("link").length]);
    expect(rows).toEqual([
      ["서비스 안내", 5],
      ["약관과 정책", 4],
    ]);
  });

  it("gives every link a 44px row", () => {
    // jsdom tests have no file: import.meta.url; vitest runs from the repo root or from apps/web.
    const file = ["apps/web/components/layout/Footer.module.css", "components/layout/Footer.module.css"]
      .map((path) => resolve(process.cwd(), path))
      .find((path) => existsSync(path));
    const css = readFileSync(file ?? "", "utf8");
    const linkRule = css.match(/\.link \{([^}]*)\}/)?.[1] ?? "";
    expect(linkRule).toMatch(/min-height:\s*44px/);
  });

  it("sets the privacy policy apart", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "개인정보처리방침" }).querySelector("strong")).not.toBeNull();
    expect(screen.getByRole("link", { name: "이용약관" }).querySelector("strong")).toBeNull();
  });

  it("shows the business notice from the config", () => {
    const { container } = render(<Footer />);
    const text = container.textContent ?? "";
    expect(text).toContain("상호 열매스튜디오");
    expect(text).toContain("사업자등록번호 665-38-01736");
    expect(text).toContain(`통신판매업 신고번호 ${original.mailOrderNo}`);
    for (const field of footerNotice(business)) expect(text).toContain(field);
  });

  it("prints the configured business address with its label, and no other address", () => {
    business.address = "서울시 어딘가 1";
    const { container } = render(<Footer />);
    expect(container.textContent).toContain("사업장 주소 서울시 어딘가 1");
    let rest = container.textContent ?? "";
    // Whatever the notice lists (the owner decides which business fields show) is allowed; nothing else.
    for (const field of footerNotice(business)) rest = rest.replace(field, "");
    expect(rest).not.toContain("주소");
    expect(rest).not.toContain("서울시 어딘가");
  });

  it("adds email and phone once they are filled", () => {
    business.email = "hello@example.com";
    business.phone = "02-000-0000";
    const { container } = render(<Footer />);
    expect(container.textContent).toContain("이메일 hello@example.com");
    expect(container.textContent).toContain("전화 02-000-0000");
  });
});
