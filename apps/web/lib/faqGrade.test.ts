import { describe, expect, it } from "vitest";
import { GET as llmsRoute } from "@/app/llms.txt/route";
import { SITE } from "./config";
import { faqGroups } from "./faq";
import { serviceFacts } from "./llms";

/** 사주 등급 in the FAQ and llms.txt (spec 2026-11-11 E, F C8). */

const entries = faqGroups().flatMap((group) => group.entries);

describe("the FAQ on the 사주 등급", () => {
  it("lists the grade card among what is free and what needs no login", () => {
    expect(entries.find((e) => e.id === "free")?.a.join(" ")).toContain("올해의 사주 등급 카드도 로그인 없이 무료예요");
    expect(entries.find((e) => e.id === "login")?.a.join(" ")).toContain(", 사주 등급 카드와 규칙 페이지, 공유받은 링크는 로그인 없이 쓸 수 있어요");
  });

  it("answers 'C가 나왔어요. 안 좋은 건가요?' in plain words, with the rule page", () => {
    const entry = entries.find((e) => e.id === "grade-c");
    expect(entry?.q).toBe("C가 나왔어요. 안 좋은 건가요?");
    const answer = entry?.a.join(" ") ?? "";
    for (const part of ["아니에요", "좋은지 나쁜지를 매기지 않아요", "해마다 다시 계산", "다음 S·A", "열 해 내내 C인 명식은 없었어요", "재미로 보는 계산"]) expect(answer, part).toContain(part);
    expect(answer).not.toMatch(/정확|과학적|베타|운명|반드시/);
    expect(entry?.link).toEqual({ href: "/saju/grade/how", label: "사주 등급 규칙" });
  });
});

describe("llms.txt on the 사주 등급", () => {
  it("says it is free without login, computed by a published rule in the browser, and links the card and its rule page with sources", async () => {
    const facts = serviceFacts().join("\n");
    expect(facts).toContain("로그인하지 않아도 질문 만들기, 카드 뽑기, 무료 사주 명식, 지금의 한 장, 올해의 사주 등급 카드를 쓸 수 있어요");
    expect(facts).toContain("올해의 사주 등급:");
    const llms = await llmsRoute().text();
    expect(llms).toContain(`- [올해의 사주 등급](${SITE.url}/saju/grade): `);
    const how = llms.split("\n").find((line) => line.startsWith(`- [사주 등급 규칙](${SITE.url}/saju/grade/how): `)) ?? "";
    for (const source of ["五行大義", "三命通會", "滴天髓", "출처 미확인"]) expect(how, source).toContain(source);
  });
});
