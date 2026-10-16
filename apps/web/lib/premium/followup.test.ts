import { describe, expect, it } from "vitest";
import { readingDigest } from "./followup";

const reading = {
  title: "차근차근 쌓아 가는 해",
  overview: { heading: "2027 정미년과 나의 명식", body: "첫 문장이에요. 둘째 문장이에요." },
  months: [
    { month: 3, heading: "3월 · 계묘월 (6일 경칩부터)", body: "3월 첫 문장이에요. 3월 둘째 문장이에요." },
    { month: 4, heading: "4월 · 갑진월 (5일 청명부터)", body: "4월 첫 문장이에요. 4월 둘째 문장이에요." },
  ],
};

describe("premium follow-up digest", () => {
  it("lists every heading with its first sentence only", () => {
    const digest = readingDigest(reading, "올해 어떻게 보내면 좋을까요?");
    expect(digest).toContain("- 제목: 차근차근 쌓아 가는 해");
    expect(digest).toContain("- 2027 정미년과 나의 명식: 첫 문장이에요.");
    expect(digest).toContain("- 4월 · 갑진월 (5일 청명부터): 4월 첫 문장이에요.");
    expect(digest).not.toContain("둘째 문장");
  });

  it("adds the full section a question points at, two at most", () => {
    const digest = readingDigest(reading, "3월에 이직 이야기를 꺼내도 될까요?");
    expect(digest).toContain("3월 둘째 문장이에요.");
    expect(digest).not.toContain("4월 둘째 문장이에요.");
    const many = readingDigest({ a: { heading: "관계", body: "가." }, b: { heading: "관계의 결", body: "나." }, c: { heading: "관계 정리", body: "다." } }, "관계는 어때요?");
    expect(many.match(/^### /gm)).toHaveLength(2);
  });

  it("leads with the one-line verdict when the reading has one, and strips bold marks", () => {
    const digest = readingDigest({ verdict: "**천천히** 가도 돼요", observation: { heading: "확인해 볼 신호", body: "**다음 주**에 봐요." } }, "언제요?");
    expect(digest).toContain("- 한 줄 결론: 천천히 가도 돼요");
    expect(digest).not.toContain("**");
  });
});
