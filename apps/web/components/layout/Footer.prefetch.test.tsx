// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// next/link's prefetch leaves no trace in the DOM: this stand-in writes it down.
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: ReactNode }) => (
    <a href={href} data-prefetch={prefetch === undefined ? "auto" : String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

const { Footer } = await import("./Footer");

afterEach(cleanup);

describe("Footer prefetch (F-05)", () => {
  it("never prefetches an app page the root domain does not serve: /about, /privacy and /terms render this footer there too, and that prefetch is a blocked cross-host redirect", () => {
    render(<Footer />);
    const prefetch = Object.fromEntries(screen.getAllByRole("link").map((link) => [link.getAttribute("href"), link.getAttribute("data-prefetch")]));
    expect(prefetch).toEqual({
      "/about": "auto",
      "/how": "false",
      "/evidence": "false",
      "/help": "false",
      "/faq": "false",
      "/guide/tarot": "auto",
      "/pricing": "false",
      "/terms": "auto",
      "/privacy": "auto",
      "/refund": "false",
      // Both hosts serve /privacy, so its 방문 통계 setting is never a cross-host redirect.
      "/privacy#analytics": "auto",
    });
  });
});
