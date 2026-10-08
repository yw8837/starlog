import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlanceCard } from "@/components/saju/GlanceCard";
import { ReadingArticle, type ReadingBody } from "@/components/tarot/ReadingArticle";
import { boldSpans } from "@/lib/ai/style";
import { BoldText, boldSegments } from "./BoldText";

/** A reading's `**구**` on screen (docs/research/reading-voice-2026-10.md §2.2, §4.4). */

const html = (text: string) => renderToStaticMarkup(<BoldText text={text} />);

describe("BoldText", () => {
  it("shows **구** as <strong> and the rest as text", () => {
    expect(html("결정 앞에서 **오래 저울질하는** 편이에요.")).toBe("결정 앞에서 <strong>오래 저울질하는</strong> 편이에요.");
    expect(html("**하나**와 **둘**")).toBe("<strong>하나</strong>와 <strong>둘</strong>");
    expect(html("굵게 없는 문장이에요.")).toBe("굵게 없는 문장이에요.");
  });

  it("escapes markup inside and outside the bold", () => {
    expect(html("<img src=x onerror=alert(1)> **<b>굵게</b>**")).toBe("&lt;img src=x onerror=alert(1)&gt; <strong>&lt;b&gt;굵게&lt;/b&gt;</strong>");
  });

  it("falls back to plain text, without the marks, when they do not pair up", () => {
    expect(boldSegments("**끝까지 마쳤는지에서 갈려요.")).toBeNull();
    expect(html("**끝까지 마쳤는지에서 갈려요.")).toBe("끝까지 마쳤는지에서 갈려요.");
    expect(html("빈 **** 표시")).toBe("빈  표시");
  });

  it("reads the marks as the validators do: a ** left over makes the text plain, without the ** but with a single asterisk kept", () => {
    for (const [text, plain] of [["**a*b**", "a*b"], ["***x***", "*x*"], ["결정 앞에서 **오래*저울질하는** 편이에요.", "결정 앞에서 오래*저울질하는 편이에요."]] as const) {
      expect(boldSegments(text), text).toBeNull();
      expect(boldSpans(text).paired, text).toBe(false);
      expect(html(text), text).toBe(plain);
    }
    // a literal asterisk is text, not a mark (review 2026-10-08)
    expect(boldSegments("A*B")).toEqual([{ text: "A*B", bold: false }]);
    expect(boldSpans("A*B").paired).toBe(true);
    expect(html("A*B와 **굵게 쓴 말**")).toBe("A*B와 <strong>굵게 쓴 말</strong>");
  });
});

describe("where a reading shows bold", () => {
  it("the 한눈에 보기 card, every sentence of it", () => {
    const card = renderToStaticMarkup(
      <GlanceCard
        glance={{
          goesWell: "기운이 넷이나 있어 **결과물을 직접 만들어 내놓을 때** 일이 잘 풀려요.",
          watchOut: "요구가 나와 맞부딪히는 사주라, 부탁을 **혼자 다 떠안기** 쉬워요.",
          remedy: "부탁을 받으면 **할 수 있는 몫만** 정해 다시 답해 보세요.",
          thisYear: "병오(丙午)년은 **내 뜻을 앞세우고 싶어지는** 한 해예요.",
          thisYearAction: "혼자 붙들던 일 하나를 **함께할 사람에게** 나눠 보세요.",
        }}
      />,
    );
    for (const bold of ["결과물을 직접 만들어 내놓을 때", "혼자 다 떠안기", "할 수 있는 몫만", "내 뜻을 앞세우고 싶어지는", "함께할 사람에게"]) {
      expect(card).toContain(`<strong>${bold}</strong>`);
    }
    expect(card).not.toContain("**");
  });

  it("the tarot reading's prose sections, card sections first", () => {
    const paid = {
      verdict: "작게 움직여 보는 편이 좋아요",
      cards: [{ position: "지금 상황", cardId: "major-12-hanged-man", heading: "매달린 사람 · 버팀", body: "거꾸로 매달린 사람이에요. 다만 **끝을 정하지 않은 버팀**은 나를 깎기 쉬워요." }],
      connection: { heading: "세 장을 이어 읽으면", body: "버틸 힘은 **넉넉해요**." },
      alternatives: { heading: "다르게 볼 수 있는 부분", body: "**<i>기울임</i>** 없이 읽어요." },
      action: { heading: "오늘 해볼 작은 행동", body: "계속 다닐 조건 하나를 ****정해 보세요." },
    } as unknown as ReadingBody;
    const article = renderToStaticMarkup(<ReadingArticle paid={paid} />);
    expect(article).toContain("<strong>끝을 정하지 않은 버팀</strong>");
    expect(article).toContain("<strong>넉넉해요</strong>");
    expect(article).toContain("<strong>&lt;i&gt;기울임&lt;/i&gt;</strong>");
    expect(article).toContain("계속 다닐 조건 하나를 정해 보세요.");
    expect(article).not.toContain("**");
  });
});
