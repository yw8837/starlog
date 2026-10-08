import "server-only";
import type { SajuElement } from "@starlog/core";
import type { SajuTopicId } from "@/lib/reading/types";
import { TOPIC_OBSERVATION_HEADING, TOPIC_SECTIONS, topicName } from "@/lib/sajuTopics";
import { ELEMENT_PLAIN, josa, mockThisYear } from "@/lib/ai/mock";
import { PLAIN_WORDS, glossOnce, glossText } from "@/lib/ai/plainWords";
import { ELEMENT_WORD, ORDER, ymKo } from "@/lib/ai/prompts/saju";
import type { GroupFact, GroupName, SajuTopicFactSet } from "@/lib/ai/prompts/sajuTopics";
import type { FollowUpAnswer, SajuGlance, SajuReading, SajuTeaserDraft } from "@/lib/ai/schemas";

/** Says a 명리 term: in plain words the first time within one reading (glossOnce), as itself in a teaser or an answer. */
type Say = (term: string) => string;
const asIs: Say = (term) => term;

/**
 * Deterministic 주제별 사주 readings without a model (tests, key-less dev, e2e with STARLOG_AI=mock).
 * Built only from the topic FactSet, so every combination passes the topic validators: each section
 * names its anchor, a group counted 0 is called missing or hidden, the unknown time and the 대운 edge
 * are stated where §8.3 wants them, and the chip is answered in 2절. The sections speak in the reading
 * voice (owner 2026-10-08): a scene question, one plain reason, the tendency in bold, one everyday act.
 */

const count = (text: string) => text.replace(/\s/g, "").length;

/** `parts`, then lines of `pool` in order (each once) until the text reaches `min` characters without spaces, then `close`. */
function filled(parts: string[], pool: readonly string[], min: number, close = ""): string {
  const out = parts.filter(Boolean);
  for (const line of pool) {
    if (count([...out, close].join(" ")) >= min) break;
    out.push(line);
  }
  return [...out, close].filter(Boolean).join(" ");
}

const groupBy = (f: SajuTopicFactSet) => Object.fromEntries(f.groups.items.map((g) => [g.name, g])) as Record<GroupName, GroupFact>;
const basisOf = (f: SajuTopicFactSet) => (f.input.timeKnown ? "겉 글자 기준" : "시주 없이 여섯 글자 기준");
const mostOf = (f: SajuTopicFactSet) => f.groups.items.reduce((a, b) => (b.count > a.count ? b : a));

const PLACE_PLAIN: Readonly<Record<string, string>> = {
  년간: "태어난 해 위 글자", 년지: "태어난 해 아래 글자", 월간: "태어난 달 위 글자", 월지: "태어난 달 아래 글자",
  일지: "태어난 날 아래 글자", 시간: "태어난 시 위 글자", 시지: "태어난 시 아래 글자",
};

/** "년간 己 상관" in plain words: "태어난 해 위 글자 己 틀 밖으로 드러내는 표현력(상관)". */
const placeLine = (line: string, say: Say) => {
  const [place = "", ...rest] = line.split(" ");
  const god = rest.pop()!;
  return [PLACE_PLAIN[place] ?? place, ...rest, say(god)].join(" ");
};

/** One sentence per group with its places (the teaser's and the answers' key fact). */
function groupSentence(g: GroupFact, basis: string, say: Say = asIs): string {
  const name = say(g.name);
  if (g.count > 0) return `${josa(name, "은", "는")} 겉에 ${g.count}개, ${g.visible.map((line) => placeLine(line, say)).join(", ")} 자리에 있어요.`;
  if (g.hidden.length) return `${josa(name, "은", "는")} ${basis}으로는 겉에 없고, ${g.hidden.map((line) => placeLine(line, say)).join(", ")} 자리에 숨어 있어요.`;
  return glossText(`${josa(name, "은", "는")} ${basis}으로는 겉에도 지장간에도 없어요.`, say);
}

/** A group as a reading's reason says it (§2.3): its name once, its count or where it hides, in plain words. */
function groupPlain(g: GroupFact, basis: string, say: Say): string {
  const name = josa(say(g.name), "은", "는");
  if (g.count > 0) return `${name} 겉에 ${g.count}개 있어요`;
  return `${name} ${basis}으로는 겉에 없고 ${g.hidden.length ? "글자 속에 숨어 있어요" : "글자 속에도 없어요"}`;
}

/** The groups a section must name as missing (the validator's zero anchors), or else the one the topic reads first. */
function namedGroups(f: SajuTopicFactSet, zero: readonly GroupName[], first: GroupName): GroupFact[] {
  const g = groupBy(f);
  return (zero.length ? zero : [first]).map((name) => g[name]);
}

/** The chip's one quote, and the 결혼 the 결혼 chip asks for (§8.4), in 2절. */
function chipSentences(f: SajuTopicFactSet): string[] {
  if (!f.situation) return [];
  return [
    `요즘 '${f.situation.label}'라고 골랐죠.`,
    f.situation.id === "marriage" ? "결혼을 생각할 때도 함께 사는 생활의 작은 결정들을 둘이 나눠 정하는 쪽이 편해요." : "",
  ];
}

/** The tendency the group a chart has most of gives (its core in bold). */
const GROUP_TENDENCY: Readonly<Record<GroupName, string>> = {
  비겁: "사람들과 나란히 움직일 때 힘이 나는",
  식상: "생각을 말과 결과물로 먼저 꺼내는",
  재성: "가진 것을 챙기고 굴리는 데 밝은",
  관성: "정해진 약속과 기준을 지키려는",
  인성: "알아보고 배우며 준비하는",
};

/** The kind of work the month stem's group fits (career 3절, its core in bold). */
const CAREER_FIT: Readonly<Record<GroupName, string>> = {
  비겁: "함께 굴리는 일에서 손이 빨라지는",
  식상: "만들어 보여 주는 일에 오래 붙어 있는",
  재성: "숫자와 살림을 다루는 일이 편한",
  관성: "기준이 분명한 일에서 마음이 놓이는",
  인성: "배우고 정리하는 일이 오래가는",
};

/** Each topic's own lines for 2~5절: a scene question, the tendency (bold), a second scene, the act (bold). */
const TOPIC_VOICE: Readonly<Record<SajuTopicId, {
  s2: { ask: string; lean: string; scene: string; act: string };
  s3: { ask: string; lean: string; scene: string; act: string };
  flow: string;
}>> = {
  money: {
    s2: { ask: "월급날이 지나고 나면 어디로 갔는지 모르게 돈이 빠져나간 적 많지 않나요?", lean: "돈이 들어오는 길이 천천히 열리는", scene: "작은 지출이 모여 한 번에 크게 보이는 식이죠.", act: "다만 결제하고 싶어질 때는 **하루 묵혀 두고** 다시 살펴보세요." },
    s3: { ask: "모임비나 경조사비처럼 사람 따라 나가는 돈이 한 달에 몇 번씩 생기지 않나요?", lean: "사람 따라 나가는 돈보다 내 기준이 먼저인", scene: "같이 쓰자는 말에도 한 번은 계산기를 두드려 보는 식이죠.", act: "다만 약속이 겹칠 때는 **한 달에 쓸 몫**을 미리 정해 놓으세요." },
    flow: "돈 쓰는 습관을 손보고 싶어지기",
  },
  career: {
    s2: { ask: "일을 맡으면 누가 시키기 전에 내 방식대로 순서부터 짜게 되죠?", lean: "맡은 일을 내 방식대로 다듬는", scene: "일이 몰려도 내 순서대로 정리해야 마음이 놓이는 식이죠.", act: "다만 일이 몰릴 때는 **오늘 끝낼 일 세 가지**만 먼저 고르세요." },
    s3: { ask: "같은 일을 해도 유난히 손에 맞는 일이 따로 있다고 느낀 적 있지 않나요?", lean: "", scene: "일의 이름보다 일하는 방식이 맞을 때 오래 버티는 식이죠.", act: "다만 다음 일을 고를 때는 **하루 일과를 먼저 그려** 보세요." },
    flow: "일하는 방식을 바꿔 보고 싶어지기",
  },
  love: {
    s2: { ask: "마음이 가는 사람이 생겨도 표현은 한 박자 늦게 나올 때가 있지 않아요?", lean: "가까워질수록 속도를 맞추려는", scene: "좋아하는 마음보다 조심하는 마음이 먼저 앞서는 식이죠.", act: "다만 마음이 앞설 때는 **하고 싶은 말 한 줄**을 먼저 건네 보세요." },
    s3: { ask: "가까워지는 속도가 상대와 맞지 않아 답답했던 적 있지 않나요?", lean: "관계를 내 속도로 천천히 데우는", scene: "연락이 잦아질수록 오히려 한발 물러서고 싶어지는 식이죠.", act: "다만 속도가 엇갈릴 때는 **내가 편한 간격**을 말로 먼저 꺼내 보세요." },
    flow: "관계의 속도를 다시 맞추고 싶어지기",
  },
  reunion: {
    s2: { ask: "익숙한 길을 지나다 지난 장면이 불쑥 떠오를 때가 있지 않아요?", lean: "지난 장면을 오래 곱씹는", scene: "하루를 잘 보내다가도 저녁이 되면 생각이 한쪽으로 쏠리는 식이죠.", act: "다만 그 장면이 떠오를 때는 **하루 리듬 하나**부터 지켜 보세요." },
    s3: { ask: "비슷한 이유로 마음이 상했던 장면이 자꾸 되풀이되는 것 같지 않나요?", lean: "익숙한 방식으로 다시 맞추려는", scene: "다시 이어진다면 예전과 같은 자리에서 같은 말이 오가기 쉬운 식이죠.", act: "다만 그 생각이 길어질 때는 **스스로 정할 기준 하나**를 먼저 세워 보세요." },
    flow: "지난 일을 정리하고 싶어지기",
  },
};

// Padding, one pool per section: statements without terms, bold or a second act, so no sentence repeats across the reading.
const POOL_S1 = [
  "같은 힘이라도 어떤 자리에서 쓰느냐에 따라 결과는 꽤 달라져요.",
  "잘 풀린 날을 떠올려 보면 대개 그 힘을 제자리에서 쓴 날이에요.",
  "반대로 지친 날은 그 힘을 억지로 끌어다 쓴 날인 경우가 많아요.",
  "이 바탕은 고른 주제의 장면에서도 비슷한 모양으로 드러나요.",
];
const POOL_S2 = [
  "같은 모양이라도 생활 리듬에 따라 드러나는 정도는 달라요.",
  "한 번의 장면보다 여러 번 되풀이되는 모습이 더 정확한 단서가 돼요.",
  "가까운 사람에게 내가 이런 장면에서 어떤 쪽인지 물어보면 의외로 금방 답이 나와요.",
  "마음이 편했던 장면과 버거웠던 장면을 나란히 놓으면 차이가 또렷해져요.",
  "결국 같은 힘을 언제 꺼내 쓰느냐가 차이를 만들어요.",
];
const POOL_S3 = [
  "익숙하게 꺼내 쓰는 힘이 있다는 건 그만큼 손에 익은 길이 있다는 뜻이에요.",
  "겉에 없는 힘은 부족하다기보다 의식해서 꺼내 써야 하는 쪽에 가까워요.",
  "주변에서 나를 어떤 사람으로 기억하는지 떠올려 보는 것도 좋은 단서가 돼요.",
  "낯선 힘을 작은 일에 한 번 꺼내 보면 생각보다 편한 경우도 있어요.",
  "한쪽으로 몰린 힘은 그 힘이 먼저 나서는 장면이 잦다는 뜻이기도 해요.",
];
const POOL_S4 = [
  "흐름은 방향을 보는 도구이지 특정한 일이 생긴다는 약속은 아니에요.",
  "같은 흐름이라도 무엇에 힘을 쓰느냐에 따라 체감은 달라질 수 있어요.",
  "이 10년 동안 새로 시작한 일과 오래 이어 온 일을 나란히 놓으면 흐름이 눈에 보여요.",
  "흐름이 바뀌는 때에는 익숙한 방식이 조금 낯설게 느껴지기도 해요.",
];
const POOL_S5 = [
  "올해 남은 기간과 다가오는 해를 두 덩어리로 나눠 보면 흐름이 더 잘 보여요.",
  "두 해의 흐름이 다르다면 같은 일도 다른 방식으로 해 보는 편이 도움이 돼요.",
  "이 풀이는 흐름을 말할 뿐이고 무엇을 할지는 내가 정하는 몫이에요.",
  "다가오는 해의 첫걸음은 크지 않아도 괜찮아요.",
];
const POOL_TEASER = [
  "이 명식에서 이 주제는 그 자리를 먼저 살피며 읽어요.",
  "명리의 읽기는 관점이라서, 생활 속 장면으로 직접 확인해 보는 것이 가장 정확해요.",
  "전체 풀이에서는 지금의 10년과 올해, 다가오는 해의 흐름까지 이어서 살펴봐요.",
  "자리와 개수는 결론이 아니라 손이 먼저 가기 쉬운 방향을 보여 줘요.",
];

const OBSERVATION: Readonly<Record<SajuTopicId, string>> = {
  love: "앞으로 몇 주 동안 가까운 사람에게 먼저 말을 꺼내는 순간이 언제인지 눈여겨보세요. 그 순간이 편했다면 이 풀이의 방향과 맞아요.",
  reunion: "앞으로 몇 주 동안 지난 관계가 떠오르는 시간대와 그때 하던 일을 눈여겨보세요. 그 리듬이 보이면 마음을 돌보는 순서를 정하기 쉬워져요.",
  money: "앞으로 몇 주 동안 돈이 나가는 순간에 어떤 마음이 먼저 드는지 눈여겨보세요. 같은 장면이 두세 번 보이면 이 풀이의 방향과 맞아요.",
  career: "앞으로 몇 주 동안 일에 속도가 붙는 순간이 혼자 정할 때인지 함께 정할 때인지 눈여겨보세요. 한쪽이 잦다면 이 풀이의 방향과 맞아요.",
};

const FOLLOW_UPS: Readonly<Record<SajuTopicId, [string, string]>> = {
  love: ["관계에서 내 속도를 지키려면요?", "일지의 결은 어떻게 쓰면 좋아요?"],
  reunion: ["마음 정리의 첫걸음은 무엇일까요?", "되풀이를 줄이려면 무엇부터요?"],
  money: ["지출을 줄이는 작은 습관은요?", "숨은 재성은 어떻게 써요?"],
  career: ["지금 일에서 해 볼 작은 실험은요?", "일하는 방식은 어디부터 바꿀까요?"],
};

/** The topic's key fact in one sentence (the teaser's second sentence, the answers' anchor). */
function keySentence(f: SajuTopicFactSet): string {
  const g = groupBy(f);
  const basis = basisOf(f);
  const day = f.pillars.find((p) => p.pillar.includes("(일주)"))!;
  if (f.topic === "money") return groupSentence(g.재성, basis);
  if (f.topic === "career") return groupSentence(f.situation?.id === "exam" ? g.인성 : g.관성, basis);
  return `태어난 날의 지지 ${josa(day.branch.display, "이", "가")} 일지이고, 십성으로는 ${josa(day.branch.mainTenGod, "이에요", "예요")}.`;
}

/** The glyph in a display form's brackets: "축토(丑土)" → "丑". */
const hanjaOf = (display: string) => display.match(/\(([^)])/)?.[1] ?? "";

function section1(f: SajuTopicFactSet, say: Say): string {
  const counts = f.elements.counts as Record<SajuElement, number>;
  const top = ORDER.find((e) => counts[e] === Math.max(...ORDER.map((x) => counts[x])))!;
  const missing = ORDER.filter((e) => counts[e] === 0).map((e) => ELEMENT_WORD[e]);
  const most = mostOf(f);
  return filled([
    `${ELEMENT_PLAIN[top].ease}만큼은 누가 시키지 않아도 먼저 손이 가지 않나요?`,
    `사주로 보면 나를 뜻하는 글자는 ${f.dayMaster.image}에 비유되고, ${f.season ? `${f.season.text}에 태어났어요` : "태어난 달은 태어난 시각에 따라 달라질 수 있어요"}.`,
    `겉에 가장 많은 묶음은 ${josa(say(most.name), "이라", "라")} **${GROUP_TENDENCY[most.name]}** 편이에요.`,
    missing.length ? `반대로 ${missing.join("·")} 기운은 겉에 없어서 그쪽 일은 일부러 꺼내 써야 하는 식이죠.` : "다섯 기운이 모두 겉에 보여서 한쪽으로만 쏠리지는 않는 식이죠.",
    "그 힘을 믿고 움직여도 나쁘지 않아요.",
  ], POOL_S1, 310, "다만 일이 한꺼번에 몰릴 때는 **순서부터 한 줄로** 정해 두세요.");
}

function section2(f: SajuTopicFactSet, say: Say): string {
  const v = TOPIC_VOICE[f.topic].s2;
  const basis = basisOf(f);
  const zero = f.allowed.anchors.zeroS2;
  const day = f.pillars.find((p) => p.pillar.includes("(일주)"))!;
  // the day branch by its hanja (the anchor), so the place needs no term
  const reason: Record<SajuTopicId, () => string> = {
    money: () => `사주로 보면 ${namedGroups(f, zero, "재성").map((g) => groupPlain(g, basis, say)).join(". ")}.`,
    career: () => `사주로 보면 ${namedGroups(f, zero, f.situation?.id === "exam" ? "인성" : "관성").map((g) => groupPlain(g, basis, say)).join(". ")}.`,
    love: () => `사주로 보면 나와 가장 가까운 자리의 글자(${day.branch.glyph})가 ${f.dayMaster.image} 같은 나를 곁에서 받쳐 줘요.`,
    reunion: () => [
      `사주로 보면 나와 가장 가까운 자리의 글자(${day.branch.glyph})가 마음이 머무는 자리예요.`,
      ...namedGroups(f, zero, "인성").filter((g) => zero.includes(g.name)).map((g) => `${groupPlain(g, basis, say)}.`),
    ].join(" "),
  };
  const window = f.dayWindow ? `태어난 시각이 ${f.dayWindow.range} 사이였다면 그 자리 글자가 바뀔 수 있어요(${hanjaOf(f.dayWindow.dayBranch)}).` : "";
  return filled([
    v.ask,
    ...chipSentences(f),
    reason[f.topic](),
    window,
    `그래서 **${v.lean}** 편이에요.`,
    v.scene,
  ], POOL_S2, 360, v.act);
}

function section3(f: SajuTopicFactSet, say: Say): string {
  const v = TOPIC_VOICE[f.topic].s3;
  const basis = basisOf(f);
  const zero = f.allowed.anchors.zeroS3;
  const most = mostOf(f);
  const month = f.pillars.find((p) => p.pillar.includes("(월주)"))!;
  const reason: Record<SajuTopicId, () => string> = {
    money: () => `사주로 보면 ${namedGroups(f, zero, "비겁").map((g) => groupPlain(g, basis, say)).join(". ")}.`,
    career: () => `사주로 보면 일의 바탕이 되는 태어난 달 기둥(${month.gz})이 ${PLAIN_WORDS[month.stem.tenGod]} 쪽이라서 **${CAREER_FIT[groupOfName(month.stem.tenGod)]}** 편이에요.`,
    love: () => `사주로 보면 ${namedGroups(f, zero, most.name).map((g) => groupPlain(g, basis, say)).join(". ")}.`,
    reunion: () => `사주로 보면 겉에 가장 많은 묶음이 ${josa(say(most.name), "이라", "라")} 익숙한 방식이 먼저 나오기 쉬워요.`,
  };
  return filled([
    v.ask,
    reason[f.topic](),
    v.lean ? `그래서 **${v.lean}** 편이에요.` : "",
    v.scene,
  ], POOL_S3, 360, v.act);
}

/** The group a ten god belongs to (the month stem's, for career 3절). */
function groupOfName(god: string): GroupName {
  const groups: Record<string, GroupName> = { 비견: "비겁", 겁재: "비겁", 식신: "식상", 상관: "식상", 편재: "재성", 정재: "재성", 편관: "관성", 정관: "관성", 편인: "인성", 정인: "인성" };
  return groups[god] ?? "비겁";
}

function section4(f: SajuTopicFactSet): string {
  const current = f.luck?.current;
  const next = f.allowed.anchors.nextLuck && f.luck ? f.luck.cycles.find((c) => c.gz === f.allowed.anchors.nextLuck![0]) : undefined;
  const reason = current
    ? `사주로 보면 10년마다 바뀌는 큰 흐름(대운)에서 지금은 ${current.ko}(${current.gz}) 대운이 ${ymKo(current.to!)} 무렵까지 이어져요.`
    : f.luck
      ? "사주로 보면 10년마다 바뀌는 큰 흐름(대운) 가운데 첫 대운이 아직 시작되기 전이에요."
      : "태어난 시각에 따라 태어난 달이 정해지지 않아 10년마다 바뀌는 큰 흐름(대운)은 계산하지 않았어요.";
  return filled([
    "요즘 일하는 방식이나 마음 쓰는 방향이 예전과 조금 달라졌다고 느끼지 않나요?",
    reason,
    next?.from ? `${ymKo(next.from)} 무렵에는 ${next.ko}(${next.gz}) 대운으로 넘어가요.` : "",
    f.luckEdge ? "태어난 시각을 몰라 흐름이 바뀌는 때가 앞뒤로 달라질 수 있어요." : "",
    current ? `그 흐름이 ${PLAIN_WORDS[current.stemTenGod]} 쪽이라서 **${TOPIC_VOICE[f.topic].flow}** 쉬워요.` : "",
    "익숙하던 방법이 조금씩 헐거워지곤 해요.",
  ], POOL_S4, 360, "다만 바꾸고 싶은 마음이 들 때는 **한 가지만 골라** 오래 해 보세요.");
}

function section5(f: SajuTopicFactSet): string {
  const a = f.annual;
  const n = f.nextAnnual;
  return filled([
    "올해 남은 기간과 다가오는 해를 떠올리면 마음이 먼저 가는 쪽이 따로 있지 않나요?",
    `사주로 보면 올해 남은 기간은 ${a.ko}(${a.gz})년이라 ${PLAIN_WORDS[a.stemTenGod]} 쪽 일이 늘기 쉬워요.`,
    `다가오는 해는 입춘 무렵부터 ${n.ko}(${n.gz})년이라 ${PLAIN_WORDS[n.stemTenGod]} 쪽으로 무게중심이 옮겨 가요.`,
    "그래서 두 해는 **같은 일도 다른 속도로** 하게 되기 쉬워요.",
    "올해 시작한 일이 해가 바뀌면 모양을 바꾸기도 해요.",
  ], POOL_S5, 360, "다만 올해 남은 기간에는 **새로 벌이기보다 마무리를** 먼저 챙겨 보세요.");
}

function section6(f: SajuTopicFactSet, say: Say): string {
  return [
    "계산 기준은 만세력마다 조금씩 다를 수 있어서, 이 풀이가 어떤 기준으로 읽었는지 밝혀 둘게요.",
    ...f.calculation.slice(0, 2).map((line) => glossText(`${line.replace(/[.。]$/, "")}.`, say)),
    ...f.limits,
    // the disclaimers the body leaves out (§2.5): here, once
    "합·충 같은 관계는 사건으로 읽지 않았고, 실제로 묶이는지도 따지지 않았죠.",
    "태어난 시각을 알게 되면 내 정보에서 고칠 수 있고, 이 풀이도 그때 다시 계산할 수 있어요.",
  ].join(" ");
}

/** What the 한눈에 보기 of each 운 speaks about (owner 2026-10-07; its voice 2026-10-08, §2.6). */
const TOPIC_GLANCE: Readonly<Record<SajuTopicId, { when: string; care: string; scene: string; mind: string; action: string }>> = {
  love: { when: "관계를 맺을 때", care: "그 힘이 필요할 때 **마음이 엇갈리기**", scene: "관계를 맺는 일", mind: "가까운 사람과 보내는 시간을 늘리고 싶어져요", action: "가까운 사람과 보내는 시간을 일정에 먼저 넣어 보세요." },
  reunion: { when: "마음을 추스를 때", care: "그 힘이 필요할 때 **같은 생각을 되풀이하기**", scene: "마음을 추스르는 일", mind: "내 생활의 리듬을 되찾고 싶어져요", action: "하루 리듬을 지키는 작은 습관 하나를 정해 두세요." },
  money: { when: "돈을 다룰 때", care: "그 힘이 필요한 자리에서 **돈이 새기**", scene: "쓰고 모으는 일", mind: "들고 나는 돈을 챙기고 싶어져요", action: "고정으로 나가는 돈부터 한 번 점검해 보세요." },
  career: { when: "일을 맡을 때", care: "그 힘이 필요한 일에서 **무리하기**", scene: "일하는 방식을 다지는 일", mind: "일의 기준을 다시 세우고 싶어져요", action: "올해 남은 기간에 다질 일 하나를 골라 마무리해 보세요." },
};

/** One everyday act for the group a chart has least of. */
const GROUP_REMEDY: Readonly<Record<GroupName, string>> = {
  비겁: "혼자 정하기 전에 믿을 만한 사람 한 명에게 의견을 물어보세요.",
  식상: "생각만 해 둔 것 하나를 짧은 말로 먼저 꺼내 보세요.",
  재성: "이번 주에 쓴 돈과 시간을 한 번 훑어보고 새는 곳을 찾아보세요.",
  관성: "하루에 꼭 지킬 기준 하나를 먼저 정해 두세요.",
  인성: "막힐 때 도움을 청할 곳 한 군데를 미리 알아 두세요.",
};

/** 한눈에 보기 for a 운: the group the chart has most and least of on the surface (the least in plain words only), this year's 세운. */
function topicGlance(f: SajuTopicFactSet, say: Say): SajuGlance {
  const most = mostOf(f);
  const least = f.groups.items.filter((g) => g !== most).reduce((a, b) => (b.count < a.count ? b : a));
  const t = TOPIC_GLANCE[f.topic];
  return {
    goesWell: `${josa(say(most.name), "이", "가")} 겉에 ${most.count}개로 가장 많아 **${t.when}** 잘 풀려요.`,
    watchOut: `${josa(PLAIN_WORDS[least.name]!, "은", "는")} ${least.count > 0 ? `겉에 ${least.count}개뿐이라` : "겉에 없어"}, ${t.care} 쉬워요.`,
    remedy: GROUP_REMEDY[least.name],
    thisYear: mockThisYear(f, t.scene, t.mind),
    thisYearAction: t.action,
  };
}

export function mockSajuTopicReading(f: SajuTopicFactSet): SajuReading {
  // Plain words first (owner 2026-10-07): each term glossed where it first appears, the card on top first.
  const say = glossOnce();
  const glance = topicGlance(f, say);
  const bodies = [section1(f, say), section2(f, say), section3(f, say), section4(f), section5(f), section6(f, say)];
  return {
    sections: TOPIC_SECTIONS[f.topic].map((heading, i) => ({ heading, body: bodies[i]! })),
    observation: { heading: TOPIC_OBSERVATION_HEADING, body: OBSERVATION[f.topic] },
    glance,
    followUps: [...FOLLOW_UPS[f.topic]],
  };
}

export function mockSajuTopicTeaser(f: SajuTopicFactSet): SajuTeaserDraft {
  const dm = f.dayMaster;
  return {
    title: dm.image,
    summary: filled([
      `일간은 ${dm.display}, 명리에서는 ${dm.image}에 비유하는 글자예요.`,
      keySentence(f),
      `${topicName(f.topic)}은 이 자리에서 먼저 읽어요. 이 자리가 드러나는 장면이 생활 속에 자주 있지 않나요?`,
      f.situation ? `요즘 '${f.situation.label}'라고 골랐으니, 그 장면에서 이 자리가 움직이는 모양도 함께 읽었어요.` : "",
      "이번 주에는 이 흐름이 보이는 장면 하나를 골라 평소와 다른 방식으로 해 보세요.",
      f.input.timeKnown ? "" : "태어난 시를 몰라 시주 없이 여섯 글자로 읽었어요.",
    ], POOL_TEASER, 260),
  };
}

export function mockSajuTopicFollowUp(f: SajuTopicFactSet, _question = ""): FollowUpAnswer {
  const dm = f.dayMaster;
  return {
    kind: "clarify",
    answer: [
      `같은 명식으로 ${topicName(f.topic)} 풀이를 이어서 보면, 일간 ${josa(dm.display, "을", "를")} 먼저 떠올리는 게 좋아요.`,
      `명리에서는 이 글자를 ${dm.image}에 비유해요.`,
      keySentence(f),
      "결론은 그대로 두고, 이번 주에 그 장면이 몇 번 보이는지 떠올려 보면 이 풀이가 내게 맞는지 스스로 확인할 수 있어요.",
    ].join(" "),
  };
}
