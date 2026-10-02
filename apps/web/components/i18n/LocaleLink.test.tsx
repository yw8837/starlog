// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Link from "./LocaleLink";
import { LocaleProvider } from "./LocaleProvider";

it("prefixes internal links with the page's locale and leaves Korean links unchanged", () => {
  render(
    <>
      <LocaleProvider locale="ja" messages={{}}>
        <Link href="/tarot/new">ja</Link>
        <Link href="/api/version">api</Link>
      </LocaleProvider>
      <LocaleProvider locale="ko" messages={{}}>
        <Link href="/tarot/new">ko</Link>
      </LocaleProvider>
    </>,
  );
  expect(screen.getByText("ja").getAttribute("href")).toBe("/ja/tarot/new");
  expect(screen.getByText("api").getAttribute("href")).toBe("/api/version");
  expect(screen.getByText("ko").getAttribute("href")).toBe("/tarot/new");
});
