import tarotSample from "@content/samples/tarot-contact.ko.json";
import { describe, expect, it } from "vitest";
import { SAJU_VOICE_EXAMPLES } from "./prompts/saju";
import type { SajuGlance, TarotReading } from "./schemas";
import { VOICE_PREFIX, isSoftViolation, softWarrantsRegeneration } from "./style";
import { exampleReuse, sajuVoiceViolations, tarotVoiceViolations, termCount, type SajuVoiceParts } from "./voice";

/** The voice's soft checks (docs/research/reading-voice-2026-10.md §4.3), on the doc's own before/after texts. */

// §3.1 고치기 전 (원문): 용어 21, 괄호 4, 확인 공식, "명리에서는", 사실로 여는 절
const BEFORE = "이 명식에서 눈에 띄는 축은 둘이에요. 하나는 나를 받쳐 주는 도움과 배움(정인)으로, 년간 무토와 년지 진토가 모두 이 기운이에요. 다른 하나는 넓게 벌이고 굴리는 재물 감각(편재)인데, 월간 을목과 월지 묘목이 이 자리를 채워요. 명리에서는 태어난 해의 기둥을 뿌리와 바탕으로, 태어난 달의 기둥을 사회로 나가는 무대로 읽어요. 바탕은 배운 것을 믿고 차근차근 쌓으려 하고, 무대에서는 판을 넓히고 기회를 굴리려는 힘이 크게 서 있죠. 게다가 월간 을목과 일간 신금 사이에는 천간충(天干沖)이, 월지 묘목과 일지 유금 사이에는 충(沖)이 있어요. 무대의 힘과 내가 맞서며 움직임이 늘어나는 구조예요. 새로운 일을 같이 벌이자는 제안이 왔을 때 먼저 예전에 배운 방식으로 따져 보느라 시간이 걸렸다면 이 구조와 맞물리고, 생각보다 몸이 먼저 나갔다면 이 부분은 덜 맞는 풀이예요. 다음 제안이 오면 바로 답하기 전에 비슷한 일을 해 본 사람의 사례 하나를 찾아보세요.";
// §3.1 고친 뒤: the prompt's first example is cut from it, so it reads as a copy
const AFTER = "새 일을 같이 벌여 보자는 제안을 받으면, 마음은 끌리는데 예전에 배운 방식으로 하나하나 따져 보느라 답이 늦어진 적 많지 않나요? 사주로 보면 바탕을 뜻하는 태어난 해 자리엔 배운 것을 믿고 차근차근 쌓는 기운이, 바깥 무대를 뜻하는 태어난 달 자리엔 판을 넓히고 굴리는 기운(편재)이 함께 있어요. 그런데 그 무대 쪽 기운이 나와 정면으로 맞서는 배치라, 벌이고 싶은 마음과 확인하고 싶은 마음이 **자주 줄다리기를 하는** 편이에요. 해 보고 싶은 일은 있는데 시작하기까지 시간이 걸리는 식이죠. 따져 보는 습관이 나쁜 건 아니에요. 다만 '일단 해 볼까' 싶은 순간이 오면 바로 답하기 전에 잠시 숨을 고르고 **비슷한 일을 먼저 해 본 사람의 사례 하나**를 찾아보세요. 반대로 생각보다 몸이 먼저 나가는 편이라면 이 대목은 가볍게 넘겨도 돼요.";
// a section in the target voice that copies no example
const GOOD = "새 프로젝트 이야기가 나오면 일단 손부터 들고 보는 편 아닌가요? 사주로 보면 태어난 달 자리에 재주를 꺼내 쓰는 기운(식신)이 있어서 **만들어 보이는 일에 먼저 끌리는** 경향이 있어요. 회의가 끝나기도 전에 시안부터 그려 두는 식이죠. 빨리 움직이는 건 장점이에요. 다만 손이 먼저 나가려 할 때 **마감과 범위를 한 줄로** 정한 뒤 시작해 보세요.";
// §3.3 고친 뒤
const CARD: SajuGlance = {
  goesWell: "재주를 꺼내 쓰는 기운이 넷이나 있어 **결과물을 직접 만들어 내놓을 때** 일이 잘 풀려요.",
  watchOut: "바깥에서 오는 요구가 나와 두 번 맞부딪히는 사주라, 부탁을 **혼자 다 떠안기** 쉬워요.",
  remedy: "부탁을 받으면 그 자리에서 답하지 말고 할 수 있는 몫만 정해 다시 답해 보세요.",
  thisYear: "병오(丙午)년은 태어난 날과 똑같은 두 글자가 돌아와서 내 뜻을 앞세우고 싶어지는 한 해예요.",
  thisYearAction: "혼자 붙들던 일 하나를 함께할 사람에게 나눠 보세요.",
};
const BASIS = "연주와 월주는 절입 시각 기준이에요. 신강·신약 같은 라벨은 유파마다 달라 붙이지 않았고, 합·충은 사건으로 읽지 않았어요.";
const OBSERVATION = "한로부터 드는 무술(戊戌)월에는 시안부터 그리는 순간이 늘어나는지 눈여겨보세요.";

const parts = (bodies: string[], patch: Partial<SajuVoiceParts> = {}): SajuVoiceParts => ({
  headings: bodies.map((_, i) => `${i + 1}절`), bodies, basis: BASIS, observation: OBSERVATION, glance: CARD, ...patch,
});
const found = (p: SajuVoiceParts) => {
  const out: string[] = [];
  sajuVoiceViolations(p, out);
  return out;
};

describe("termCount: the 명리 terms of W1 (§4.3)", () => {
  it.each([
    ["재주를 꺼내 쓰는 기운(식신)이 있어요.", 1],
    ["월간 을목과 월지 묘목이 이 자리를 채워요.", 4],
    ["천간충(天干沖)과 충(沖)이 있어요.", 2],
    ["이 명식에서 일지는 신금(辛金)이에요.", 3],
    ["10년마다 바뀌는 큰 흐름(대운)이에요.", 1],
    ["다음 대운으로 넘어가요.", 1],
    // a 간지 named as a layer is a name, not a term; nor is support, a self-made career or the year's 간지
    ["지금은 무오(戊午) 대운이고 2027년 9월 무렵 기미 대운으로 넘어가요.", 0],
    ["올해 병오(丙午)년은 주변의 지지가 큰 힘이 되는 해예요.", 0],
    ["자수성가하는 편이에요.", 0],
    ["**정면으로 맞서는 배치**라 마음이 바빠요.", 0],
  ] as const)("%s → %i", (text, n) => {
    expect(termCount(text)).toBe(n);
  });
});

describe("saju voice findings (W1–W5, the date form, example reuse)", () => {
  it("pass a reading in the target voice", () => {
    expect(found(parts([GOOD, GOOD.replace("손부터 들고", "손을 먼저 들고")]))).toEqual([]);
  });

  it("are soft and never a regeneration of their own, however many fire", () => {
    const out = found(parts([BEFORE, BEFORE], { basis: "2027-09 무렵 바뀌어요.", observation: `${OBSERVATION} **굵게 쓴 관찰**` }));
    expect(out.length).toBeGreaterThanOrEqual(5);
    expect(out.every((v) => v.startsWith(VOICE_PREFIX) && isSoftViolation(v))).toBe(true);
    expect(softWarrantsRegeneration(out)).toBe(false);
  });

  it("W1: more than one 명리 term in a body section, and a sentence that lists glyph names", () => {
    const out = found(parts([GOOD, BEFORE]));
    expect(out.join("\n")).toMatch(/명리 용어[^\n]*'2절' \d+개/);
    expect(out.join("\n")).not.toMatch(/'1절' \d+개/);
    // the prompt allows three glyph names in a sentence (rule 9): a fourth is the listing
    const three = `${GOOD} 년지 진토와 월지 묘목, 일지 유금이 있어요.`;
    expect(found(parts([three])).join("\n")).not.toMatch(/글자 이름/);
    const four = `${GOOD} 년지 진토와 월지 묘목, 일지 유금, 시지 사화가 있어요.`;
    expect(found(parts([four])).join("\n")).toMatch(/글자 이름/);
  });

  it("W1, W5: a section the topic checks make name more (its zero groups, its place) may hold that many terms and brackets", () => {
    const two = GOOD.replace("기운(식신)이 있어서", "기운(식신)과 받쳐 주는 기운(정인)이 함께 있어서");
    expect(found(parts([two])).join("\n")).toMatch(/명리 용어[^\n]*'1절' 2개/);
    expect(found(parts([two])).join("\n")).toMatch(/굵게·괄호[^\n]*'1절' 괄호 2개/);
    expect(found(parts([two], { budget: [2] }))).toEqual([]);
    expect(found(parts([`${two} 받쳐 주는 기운(인성)도 있어요.`], { budget: [2] })).join("\n")).toMatch(/'1절' 3개[^\n]*\n[^\n]*괄호 3개/);
  });

  it("W4: the template's own forms more than three times a reading (식이죠, 나쁘지 않아요, 편이에요)", () => {
    expect(found(parts([GOOD, GOOD, GOOD]))).toEqual([]);
    expect(found(parts([GOOD, GOOD, GOOD, GOOD])).join("\n")).toMatch(/상투 문구[^\n]*"식이죠" 4번/);
    const plain = GOOD.replace("그려 두는 식이죠", "그려 두곤 해요");
    const fair = `${plain} 그래도 나쁘지 않아요.`;
    expect(found(parts([fair, fair, fair, fair])).join("\n")).toMatch(/상투 문구[^\n]*"나쁘지 않아요" 4번/);
    const usual = plain.replace("끌리는** 경향이 있어요", "끌리는** 편이에요");
    expect(found(parts([usual, usual, usual]))).toEqual([]);
    expect(found(parts([usual, usual, usual, usual])).join("\n")).toMatch(/상투 문구[^\n]*"편이에요" 4번/);
  });

  it("W4: the phrases the prompt now allows two or three times a reading pass three times and are flagged the fourth", () => {
    for (const [phrase, name] of [["그런 셈이죠.", "셈이죠"], ["그런 결이에요.", "결이에요"], ["그런 구조예요.", "구조예요"], ["그런 국면이에요.", "국면이에요"], ["잠시 숨을 고르고 시작해요.", "잠시 숨을 고르고"]] as const) {
      expect(found(parts([1, 2, 3].map(() => `${GOOD} ${phrase}`))), name).toEqual([]);
      expect(found(parts([1, 2, 3, 4].map(() => `${GOOD} ${phrase}`))).join("\n"), name).toMatch(new RegExp(`상투 문구[^\\n]*"${name}" 4번`));
    }
    // the one 빗나감 line stays once a reading, as the prompt says
    expect(found(parts([1, 2].map(() => `${GOOD} 반대라면 이 대목은 가볍게 넘겨도 돼요.`))).join("\n")).toMatch(/"가볍게 넘겨도 돼요" 2번/);
  });

  it("W4: reads neither a quote nor everyday advice as a stock phrase; the disclaimers and previews still are", () => {
    for (const fine of [
      `${GOOD} 혼자 판단하지 않고 한 사람에게만 먼저 물어보세요.`,
      `${GOOD} '다음 주부터 다시 볼게요'라고 먼저 말해 두는 것도 방법이에요.`,
      `${GOOD} 결과를 너무 따지지 않고 끝까지 가 보는 날도 필요해요.`,
    ]) expect(found(parts([fine])).join("\n"), fine).not.toMatch(/상투 문구/);
    for (const stock of ["실제로 묶이는지는 판단하지 않았어요.", "실제로 묶이는지도 따지지 않았어요.", "이어서 돈이 들어오는 길부터 볼게요."]) {
      expect(found(parts([`${GOOD} ${stock}`])).join("\n"), stock).toMatch(/상투 문구/);
    }
  });

  it("W2: 명리에서 more than once in a reading", () => {
    const once = GOOD.replace("사주로 보면", "명리에서는");
    expect(found(parts([once, GOOD])).join("\n")).not.toMatch(/명리에서/);
    expect(found(parts([once, once])).join("\n")).toMatch(/'명리에서는[^\n]*2번/);
  });

  it("W3: a body section that opens with a chart fact instead of a scene or question (the observation is not one)", () => {
    const fact = "나를 나타내는 글자(일간)는 신금(辛金)이에요. 명리에서는 이 글자를 다듬은 보석으로 읽어요. **혼자 다듬는 시간**이 길어지기 쉬워요.";
    expect(found(parts([GOOD, fact])).join("\n")).toMatch(/장면이나 질문으로 시작하지 않은 절[^\n]*'2절'/);
    expect(found(parts([GOOD], { observation: "무술(戊戌)월이에요. 그달을 눈여겨보세요." })).join("\n")).not.toMatch(/장면이나 질문/);
  });

  it("W4: the confirmation formula, disclaimers and previews in the body, and the power phrases over twice; the 계산 기준 절 keeps its disclaimers", () => {
    for (const stock of [
      "시간이 걸렸다면 이 구조와 맞물리고, 몸이 먼저 나갔다면 이 부분은 덜 맞는 풀이예요.",
      "강하다 약하다 하는 라벨은 붙이지 않았어요.",
      "실제로 묶이는지는 판단하지 않았어요.",
      "이어서 돈이 들어오는 길부터 볼게요.",
      "쉬는 장면에서는 편재가 고개를 들어요.",
    ]) expect(found(parts([`${GOOD} ${stock}`])).join("\n"), stock).toMatch(/상투 문구/);
    // "같은 표현·문형은 풀이 전체에서 두세 번까지" (the prompt since 2026-10-08): three pass, the fourth is flagged
    const power = { ...CARD, thisYear: "병오(丙午)년은 책임 쪽에 힘이 실리는 해예요." };
    expect(found(parts([`${GOOD} 일에 힘이 붙어요.`, `${GOOD} 무게가 실려요.`], { glance: power }))).toEqual([]);
    expect(found(parts([`${GOOD} 일에 힘이 붙어요.`, `${GOOD} 무게가 실려요.`, `${GOOD} 손에 힘이 붙어요.`], { glance: power })).join("\n")).toMatch(/상투 문구[^\n]*힘이 붙어요·힘이 실려요 4번/);
    expect(found(parts([GOOD], { basis: `${BASIS} 실제로 묶이는지는 판단하지 않았어요.` }))).toEqual([]);
  });

  it("W5: bold and brackets over the budget, bold where it does not go, and marks that do not pair up", () => {
    const plain = GOOD.replaceAll("**", "");
    const three = `${GOOD} 그래서 **한 박자 쉬어 가기**도 좋아요.`;
    const term = GOOD.replace("**만들어 보이는 일에 먼저 끌리는**", "**식신이 강한**");
    const question = GOOD.replace("**마감과 범위를 한 줄로**", "**왜 늦어질까요?**");
    const brackets = GOOD.replace("기운(식신)", "기운(식신)과 받쳐 주는 힘(정인)");
    const open = GOOD.replace("**마감과 범위를 한 줄로**", "**마감과 범위를 한 줄로");
    for (const [label, body] of [["없음", plain], ["셋", three], ["용어", term], ["질문", question], ["괄호", brackets], ["짝", open]] as const) {
      expect(found(parts([body])).join("\n"), label).toMatch(/굵게·괄호/);
    }
    // a 간지's hanja is not a bracket of the budget
    expect(found(parts([GOOD.replace("태어난 달 자리", "태어난 달(丙子) 자리")]))).toEqual([]);
    expect(found(parts([GOOD], { basis: `${BASIS} **굵게 쓴 기준**도 있어요.` })).join("\n")).toMatch(/굵게·괄호[^\n]*계산 기준/);
    expect(found(parts([GOOD], { observation: `${OBSERVATION} **굵게 쓴 관찰**이에요.` })).join("\n")).toMatch(/굵게·괄호[^\n]*관찰/);
    expect(found(parts([GOOD], { glance: { ...CARD, remedy: "부탁을 받으면 **할 수 있는 몫만** 정해 다시 답해 보세요." } })).join("\n")).toMatch(/굵게·괄호[^\n]*카드/);
    expect(found(parts([GOOD], { glance: { ...CARD, goesWell: "재주를 꺼내 쓰는 힘(식신)과 받쳐 주는 힘(정인)이 있어 일이 잘 풀려요." } })).join("\n")).toMatch(/굵게·괄호[^\n]*카드/);
  });

  it("names a 대운 change by year and month in words, never 2027-09", () => {
    expect(found(parts([`${GOOD} 지금 흐름은 2027-09 무렵 바뀌어요.`])).join("\n")).toMatch(/2027-09/);
    expect(found(parts([`${GOOD} 지금 흐름은 2027년 9월 무렵 바뀌어요.`]))).toEqual([]);
  });

  it("flags a prompt example sentence reused word for word (12 characters or more), and not the slot phrases every reading shares", () => {
    expect(SAJU_VOICE_EXAMPLES.length).toBeGreaterThanOrEqual(2);
    expect(exampleReuse(AFTER)).not.toBeNull();
    expect(exampleReuse(GOOD)).toBeNull();
    expect(exampleReuse("일할 때 손이 먼저 나간 적 많지 않나요? 그래도 나쁘지 않아요. 다만 마음이 들 때 잠시 숨을 고르고 해 보세요.")).toBeNull();
    // rule 10's own quote, used as the rule offers it
    expect(exampleReuse("다만 '일단 해 볼까' 싶은 순간이 오면 바로 답하기 전에 가까운 사람에게 먼저 물어보세요.")).toBeNull();
    expect(found(parts([GOOD, AFTER])).join("\n")).toMatch(/형식 예시 문장을 그대로/);
  });
});

describe("tarot voice findings (§2.5, §2.7)", () => {
  const gold: TarotReading = {
    ...tarotSample.paid,
    observation: { heading: "며칠 안에 확인해 볼 신호", body: "이번 주 안에 안부를 떠올릴 때 반가움이 먼저 드는지 눈여겨보세요." },
    followUps: tarotSample.followUps,
  };
  const tarot = (r: TarotReading) => {
    const out: string[] = [];
    tarotVoiceViolations(r, out);
    return out;
  };
  const card = (i: number, body: string): TarotReading => ({ ...gold, cards: gold.cards.map((c, j) => (j === i ? { ...c, body } : c)) });

  it("pass the gold reading, and one bold phrase per card section", () => {
    expect(tarot(gold)).toEqual([]);
    expect(tarot(card(0, gold.cards[0]!.body.replace("받침이 있다는 뜻", "**받침이 있다는 뜻**")))).toEqual([]);
  });

  it("flag the position frame twice, a maxim ending, a lone reversed opener, 처럼 in two branches, an element pair and 합쇼체", () => {
    const frame = card(2, gold.cards[2]!.body.replace("'먼저 움직이면' 자리의 이 그림은", "'먼저 움직이면' 자리에서는 이 그림이"));
    const cases: Array<[string, TarotReading]> = [
      ["frame", frame],
      ["maxim", card(0, `${gold.cards[0]!.body} 한 줄로 말하면, 기댈 데를 아는 사람이에요.`)],
      ["opener", card(1, `두 사람 사이 자리에 별이 역방향으로 나왔어요. ${gold.cards[1]!.body}`)],
      ["branches", { ...gold, scenarios: { ...gold.scenarios, items: gold.scenarios.items.map((item, i) => (i === 0 ? { ...item, body: `월계관 기수처럼 ${item.body}` } : item)) } }],
      ["element", { ...gold, connection: { ...gold.connection, body: `${gold.connection.body} 가운데 불의 카드가 양옆 물의 카드와 부딪혀요.` } }],
      ["합쇼체", card(0, `${gold.cards[0]!.body} 닫는 쪽이 먼저입니다.`)],
    ];
    for (const [label, r] of cases) expect(tarot(r).join("\n"), label).toMatch(/상투 문구/);
  });

  it("count a branch with a picture simile, not one with an everyday 처럼", () => {
    const everyday = { ...gold, scenarios: { ...gold.scenarios, items: gold.scenarios.items.map((item) => ({ ...item, body: `평소처럼 ${item.body}` })) } };
    expect(tarot(everyday).join("\n")).not.toMatch(/그림 비유/);
    const pictures = { ...gold, scenarios: { ...gold.scenarios, items: gold.scenarios.items.map((item, i) => (i === 0 ? { ...item, body: `월계관 쓴 기수처럼 ${item.body}` } : item)) } };
    expect(tarot(pictures).join("\n")).toMatch(/그림 비유로 시작하는 갈래 2개/);
  });

  it("flag bold beyond one phrase per card section, and bold outside the card sections", () => {
    const twice = gold.cards[0]!.body.replace("받침이 있다는 뜻", "**받침이 있다는 뜻**").replace("내 쪽에서 한 걸음", "**내 쪽에서 한 걸음**");
    expect(tarot(card(0, twice)).join("\n")).toMatch(/굵게/);
    expect(tarot({ ...gold, action: { ...gold.action, body: `**오늘 한 줄만** ${gold.action.body}` } }).join("\n")).toMatch(/굵게/);
    expect(tarot(card(0, twice)).every(isSoftViolation)).toBe(true);
  });
});
