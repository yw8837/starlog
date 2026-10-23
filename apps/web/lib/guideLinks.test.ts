import { describe, expect, it } from "vitest";
import { SITE } from "./config";
import { GUIDE_SOURCE_HOSTS, guideLinkTarget, guidePlainText, inlineParts } from "./guideLinks";

/**
 * Links inside a guide article's text: [텍스트](주소), and only to the guide's own pages, the app host, or a source
 * site on the allowlist. Anything else stays plain text, so an article can never carry a script URL or an unknown host.
 */

describe("guideLinkTarget", () => {
  it("accepts a guide page by path, with or without an anchor", () => {
    expect(guideLinkTarget("/guide/the-fool")).toEqual({ kind: "guide", path: "/guide/the-fool" });
    expect(guideLinkTarget("/guide/five-elements#s3")).toEqual({ kind: "guide", path: "/guide/five-elements#s3" });
  });

  it("accepts the app host over https and keeps its path, query and anchor", () => {
    expect(guideLinkTarget(`${SITE.url}/2027-keyword`)).toEqual({ kind: "app", path: "/2027-keyword" });
    expect(guideLinkTarget(`${SITE.url}/birth-card/the-fool?from=guide#top`)).toEqual({ kind: "app", path: "/birth-card/the-fool?from=guide#top" });
  });

  it("accepts a source on the allowlist over https", () => {
    expect(GUIDE_SOURCE_HOSTS).toContain("en.wikisource.org");
    const url = "https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot";
    expect(guideLinkTarget(url)).toEqual({ kind: "external", url });
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "mailto:someone@example.com",
    "http://starlog.yeolmaeapps.kr/now",
    "https://starlog.yeolmaeapps.kr.evil.example/now",
    "https://user@starlog.yeolmaeapps.kr/now",
    "https://starlog.yeolmaeapps.kr:8443/now",
    "https://starlog.yeolmaeapps.kr//evil.example",
    "https://evil.example/page",
    "http://en.wikisource.org/wiki/X",
    "//evil.example/x",
    "/now",
    "/guide/../admin",
    "/guide/The-Fool",
    "/guide/",
    `${SITE.guideUrl}/guide/the-fool`,
    "the-fool",
  ])("refuses %s", (url) => {
    expect(guideLinkTarget(url)).toBeNull();
  });
});

describe("inline links in a text", () => {
  it("splits the text around each [text](url), keeping everything else as it is", () => {
    expect(inlineParts("앞 [바보 카드](/guide/the-fool) 뒤, [키워드](https://starlog.yeolmaeapps.kr/2027-keyword)에서요.")).toEqual([
      "앞 ",
      { text: "바보 카드", url: "/guide/the-fool" },
      " 뒤, ",
      { text: "키워드", url: "https://starlog.yeolmaeapps.kr/2027-keyword" },
      "에서요.",
    ]);
    expect(inlineParts("링크 없는 문장이에요.")).toEqual(["링크 없는 문장이에요."]);
    // Brackets that are not a link stay text.
    expect(inlineParts("[참고] 괄호(설명)는 그대로예요.")).toEqual(["[참고] 괄호(설명)는 그대로예요."]);
  });

  it("reads as plain text with the link words only (llms-full, FAQ answers, length checks)", () => {
    expect(guidePlainText("무료 테스트 [2027년 나의 키워드](https://starlog.yeolmaeapps.kr/2027-keyword)에서 봐요.")).toBe("무료 테스트 2027년 나의 키워드에서 봐요.");
  });
});
