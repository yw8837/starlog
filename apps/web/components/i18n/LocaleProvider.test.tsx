// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { pickMessages } from "@/lib/i18n/translate";
import { LocaleProvider, useLocale, useT } from "./LocaleProvider";

function Probe() {
  const t = useT("common");
  return <p data-locale={useLocale()}>{`${t("nav.home")} · ${t("site.homeLabel", { site: t("site.name") })}`}</p>;
}

describe("LocaleProvider", () => {
  it("reads the provided locale's messages", () => {
    render(
      <LocaleProvider locale="ja" messages={pickMessages("ja", ["common"])}>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText("ホーム · Starlog ホーム").getAttribute("data-locale")).toBe("ja");
  });

  it("keeps Korean exactly as the components wrote it", () => {
    render(
      <LocaleProvider locale="ko" messages={pickMessages("ko", ["common"])}>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText("홈 · 스타로그 홈")).toBeTruthy();
  });

  it("merges a nested provider's namespaces over the layout's", () => {
    render(
      <LocaleProvider locale="en" messages={pickMessages("en", ["common"])}>
        <LocaleProvider locale="en" messages={{}}>
          <Probe />
        </LocaleProvider>
      </LocaleProvider>,
    );
    expect(screen.getByText("Home · Starlog home")).toBeTruthy();
  });
});
