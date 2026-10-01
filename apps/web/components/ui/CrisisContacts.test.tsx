// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FaqPage from "@/app/faq/page";
import HelpPage from "@/app/help/page";
import HowPage from "@/app/how/page";
import { CRISIS_CONTACTS, CRISIS_LEAD } from "@/lib/crisis";
import { faqGroups, faqJsonLd } from "@/lib/faq";
import { CrisisContacts } from "./CrisisContacts";

afterEach(cleanup);

const telLinks = (container: HTMLElement) => [...container.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')].map((a) => a.getAttribute("href"));

describe("CrisisContacts", () => {
  it("leads with one calm line, then four helplines, one per line, each a tel: link", () => {
    const { container } = render(<CrisisContacts />);
    expect(screen.getByText(CRISIS_LEAD)).toBeTruthy();
    expect(telLinks(container)).toEqual(["tel:109", "tel:1577-0199", "tel:1388", "tel:1588-9191"]);
    const lines = screen.getAllByRole("listitem").map((line) => line.textContent);
    expect(lines).toEqual(["자살예방상담전화 109 · 24시간", "정신건강위기상담 1577-0199", "청소년상담 1388", "생명의전화 1588-9191"]);
    expect(screen.getByRole("link", { name: "자살예방상담전화 109" }).getAttribute("href")).toBe("tel:109");
  });

  it("can leave the lead out (the reading screen shows the server's message above it)", () => {
    const { container } = render(<CrisisContacts lead={false} />);
    expect(container.textContent).not.toContain(CRISIS_LEAD);
    expect(telLinks(container)).toHaveLength(4);
  });

  it("is on the FAQ (and in its structured data), the 이용 가이드 and /how", () => {
    for (const Page of [FaqPage, HelpPage, HowPage]) {
      const { container } = render(<Page />);
      expect(telLinks(container)).toEqual(CRISIS_CONTACTS.map((c) => `tel:${c.number}`));
      cleanup();
    }
    const answers = faqJsonLd(faqGroups()).mainEntity.map((q) => q.acceptedAnswer.text).join(" ");
    for (const contact of CRISIS_CONTACTS) expect(answers).toContain(contact.number);
  });

  it("keeps the numbers in one place (lib/crisis.ts)", () => {
    const root = join(__dirname, "..", "..");
    const numbers = /1577-0199|1588-9191|(?<![\d-])1388(?![\d-])|tel:\d|109(?=\s*(에|·|는|번|\)|$))|자살예방상담전화/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (!["node_modules", ".next", "e2e", "test-results", "public"].includes(name)) walk(path);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const rel = relative(root, path).replaceAll("\\", "/");
          if (rel === "lib/crisis.ts" || rel.startsWith("lib/ai/") || rel.startsWith("app/api/") || rel.startsWith("lib/api/")) continue;
          if (numbers.test(readFileSync(path, "utf8"))) offenders.push(rel);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
    // Walking the source tree on this disk takes a few seconds.
  }, 60_000);
});
