import "server-only";
import type { SajuSituationId, SajuTopicId } from "@/lib/reading/types";
import { TOPIC_OBSERVATION_HEADING, TOPIC_SECTIONS, topicName } from "@/lib/sajuTopics";
import { josa, mockThisYear, ro } from "@/lib/ai/mock";
import { glossOnce, glossText } from "@/lib/ai/plainWords";
import type { GroupFact, GroupName, SajuTopicFactSet } from "@/lib/ai/prompts/sajuTopics";
import type { FollowUpAnswer, SajuGlance, SajuReading, SajuTeaserDraft } from "@/lib/ai/schemas";

/** Says a 명리 term: in plain words the first time within one reading (glossOnce), as itself in a teaser or an answer. */
type Say = (term: string) => string;
const asIs: Say = (term) => term;

/**
 * Deterministic 주제별 사주 readings without a model (tests, key-less dev, e2e with STARLOG_AI=mock).
 * Built only from the topic FactSet, so every combination passes the topic validators: each section
 * names its anchor, a group counted 0 is called missing or hidden, the unknown time and the 대운 edge
 * are stated where §8.3 wants them, and the chip is answered in 2절.
 */

const count = (text: string) => text.replace(/\s/g, "").length;

/** `parts`, then lines of `pool` in order (each once) until the text reaches `min` characters without spaces. */
function filled(parts: string[], pool: readonly string[], min: number): string {
  const out = parts.filter(Boolean);
  for (const line of pool) {
    if (count(out.join(" ")) >= min) break;
    out.push(line);
  }
  return out.join(" ");
}

const groupBy = (f: SajuTopicFactSet) => Object.fromEntries(f.groups.items.map((g) => [g.name, g])) as Record<GroupName, GroupFact>;
const basisOf = (f: SajuTopicFactSet) => (f.input.timeKnown ? "겉 글자 기준" : "시주 없이 여섯 글자 기준");

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

/** One sentence per group: where it shows, or that it is hidden or missing (by the count's basis). */
function groupSentence(g: GroupFact, basis: string, say: Say = asIs): string {
  const name = say(g.name);
  if (g.count > 0) return `${josa(name, "은", "는")} 겉에 ${g.count}개, ${g.visible.map((line) => placeLine(line, say)).join(", ")} 자리에 있어요.`;
  if (g.hidden.length) return `${josa(name, "은", "는")} ${basis}으로는 겉에 없고, ${g.hidden.map((line) => placeLine(line, say)).join(", ")} 자리에 숨어 있어요.`;
  return glossText(`${josa(name, "은", "는")} ${basis}으로는 겉에도 지장간에도 없어요.`, say);
}

const relationSentence = (line: string) => `${line}.`;

/** How a chip is answered first in 2절 (spec §6.4), one sentence each. */
const ANGLE: Readonly<Record<SajuSituationId, string>> = {
  "long-single": "관계를 시작하는 방식은 일지와 표현의 결에서 먼저 보여요.",
  some: "거리를 재는 방식은 표현하는 힘과 신중한 힘 사이의 균형에서 보여요.",
  cooling: "관계에 힘을 쓰는 방식과 지금 지나는 국면을 함께 보면 마음의 온도가 달라진 까닭을 짚어 볼 수 있어요.",
  marriage: "결혼을 생각할 때 이 명식은 함께 사는 생활의 작은 결정들을 둘이 나눠 정하는 쪽으로 읽어요.",
  missing: "마음이 오래 머무는 자리는 일지와 되새기는 기운에서 먼저 보여요.",
  "no-contact": "연락과 거리를 대하는 나의 방식은 표현의 기운이 어디에 놓였는지에서 보여요.",
  torn: "다시 이어진다면 되풀이되기 쉬운 장면부터 보고, 스스로 정할 기준을 세워 볼 수 있어요.",
  "fresh-breakup": "마음을 정리하는 리듬은 하루의 작은 습관을 지키는 데서 먼저 되찾을 수 있어요.",
  leaking: "돈이 새는 통로는 대등하게 나누는 기운과 표현하는 기운이 놓인 자리에서 먼저 보여요.",
  worry: "걱정이 풀리는 날짜는 말할 수 없지만, 지금 지나는 국면과 조건은 함께 짚어 볼 수 있어요.",
  "side-income": "수입이 생기는 통로는 표현하는 기운이 재성으로 이어지는 길에서 보여요.",
  "job-hunt": "일하는 방식은 관성과 식상이 놓인 자리에서 먼저 보여요.",
  move: "옮길지 남을지는 정해 드릴 수 없지만, 두 길을 견줄 기준은 명식에서 찾을 수 있어요.",
  people: "사람과 조직을 대하는 방식은 비겁과 관성이 놓인 자리에서 보여요.",
  exam: "배우는 방식과 기준을 세우는 방식은 인성과 관성에서 먼저 보여요.",
};

function chipSentences(f: SajuTopicFactSet): string[] {
  if (!f.situation) return [];
  return [`요즘 '${f.situation.label}'라고 골랐죠.`, ANGLE[f.situation.id]];
}

// Padding pools, one per section, so no sentence repeats across the reading.
const POOL_S1 = [
  "명리에서는 일간을 나를 대표하는 글자로 읽어요.",
  "같은 글자라도 어느 자리에 놓였는지에 따라 쓰임이 달라진다고 보는 것이 명리의 기본 관점이에요.",
  "많고 적음은 좋고 나쁨이 아니라, 어떤 힘을 먼저 꺼내 쓰기 쉬운지를 보여 주는 지도에 가까워요.",
  "이 결이 다음 절들에서 고른 주제와 어떻게 이어지는지 차례로 살펴볼게요.",
  "평소 하루를 떠올렸을 때 힘이 먼저 붙는 장면이 있다면 이 결과 맞물리는 부분이에요.",
  "기운의 많고 적음은 성격의 이름표가 아니라 손이 먼저 가는 방향을 가리켜요.",
];
const POOL_S2 = [
  "명리에서는 이 자리를 이 주제에서 가장 먼저 살피는 근거로 읽어요.",
  "자리와 개수는 정해진 결론이 아니라, 어떤 장면에서 힘이 붙기 쉬운지를 보여 줘요.",
  "이번 주에 이 결이 보이는 장면이 있었는지 하루 끝에 한 번 떠올려 보세요.",
  "그 장면에서 마음이 편했다면 이 구조와 맞물리고, 유난히 버거웠다면 이 부분은 덜 맞는 풀이예요.",
  "겉에 드러난 글자는 먼저 꺼내 쓰기 쉬운 힘이고, 글자 속에 숨은 기운은 조건이 맞을 때 천천히 드러나는 힘이에요.",
  "같은 결도 생활 리듬에 따라 다르게 나타나니, 한 번의 장면보다 여러 번 되풀이되는 모습을 보는 편이 좋아요.",
  "작은 실험으로는 이번 주에 한 가지 일을 평소와 다른 순서로 해 보는 것을 권해요.",
  "그 뒤에 힘이 났는지 빠졌는지를 견주면 이 자리가 내게 어떻게 닿는지 가늠할 수 있어요.",
  "명리의 읽기는 관점이라서, 내 경험과 맞지 않는 부분은 덜어 내고 들어도 괜찮아요.",
  "이 절의 이야기는 다음 절에서 다른 장면으로 이어져요.",
  "가까운 사람에게 내가 이런 장면에서 어떤 쪽인지 한 번 물어보는 것도 좋은 확인이 돼요.",
];
const POOL_S3 = [
  "명리에서는 묶음의 개수를 어떤 힘을 자주 쓰는지 보여 주는 단서로 읽어요.",
  "개수가 많다고 강하다는 뜻은 아니고, 익숙하게 꺼내 쓰는 힘이라는 정도로 읽어요.",
  "없는 묶음은 부족함이 아니라 의식해서 꺼내 써야 하는 힘에 가까워요.",
  "익숙한 힘으로 일이 잘 풀린 기억이 많다면 이 구조와 맞물리고, 낯선 힘을 쓸 때 더 편했다면 이 부분은 덜 맞는 풀이예요.",
  "이번 주에는 평소에 잘 쓰지 않던 쪽의 힘을 작은 일 하나에 꺼내 보세요.",
  "그 일이 어땠는지 견주어 보면 이 절의 이야기가 내게 맞는지 확인할 수 있어요.",
  "여러 묶음이 고르게 놓였다면 상황에 따라 다른 힘을 바꿔 쓰기 쉬운 편으로 읽어요.",
  "한쪽으로 몰린 묶음은 그 힘이 먼저 나서는 장면이 잦다는 뜻으로 읽어요.",
  "이 읽기도 관점이라서, 생활 속 장면으로 직접 확인해 보는 것이 가장 정확해요.",
  "다음 절에서는 지금 지나는 10년의 흐름과 이 구조가 어떻게 만나는지 볼게요.",
  "주변에서 나를 어떤 사람으로 기억하는지 떠올려 보는 것도 좋은 단서가 돼요.",
];
const POOL_S4 = [
  "대운은 10년 단위로 바뀌는 흐름이고, 타고난 명식에 어떤 성격의 기운이 실리는지를 보여 줘요.",
  "대운은 좋고 나쁨의 등급이 아니라 어떤 기운이 실리는 국면인지로 읽어요.",
  "타고난 명식과 대운 사이의 관계는 사건이 아니라 움직임이 늘어나는 국면으로만 읽어요.",
  "같은 국면이라도 무엇에 힘을 쓰느냐에 따라 체감은 달라질 수 있어요.",
  "이 10년 동안 새로 시작한 일과 오래 이어 온 일을 나란히 놓고 보면 흐름이 눈에 보여요.",
  "지난 몇 해를 돌아보았을 때 이 결이 익숙하다면 이 풀이와 맞물리는 거예요.",
  "흐름은 방향을 보는 도구이지 특정한 일이 생긴다는 약속은 아니에요.",
  "이번 달에는 이 흐름에 맞춰 작은 일 하나를 직접 신청하거나 시작해 보세요.",
  "명리에서는 대운의 위 글자와 아래 글자를 함께 보고, 어느 쪽이 더 두드러지는지 견주어 읽어요.",
  "흐름이 바뀌는 때에는 익숙한 방식이 조금 낯설게 느껴질 수 있어요.",
];
const POOL_S5 = [
  "세운은 한 해 동안 실리는 기운으로, 대운보다 짧게 스쳐 가는 흐름이에요.",
  "올해 남은 기간과 다가오는 해를 두 덩어리로 나눠 보면 결이 더 잘 보여요.",
  "세운과 타고난 명식의 관계도 사건이 아니라 움직임이 늘어나는 국면으로 읽어요.",
  "올해 남은 기간에는 지금 하고 있는 일을 정리하는 쪽에 힘을 써 보세요.",
  "다가오는 해에는 새로 실리는 기운에 맞춰 작은 일 하나를 시작해 볼 수 있어요.",
  "해가 바뀌는 입춘 무렵에 내 하루의 순서가 어떻게 달라지는지 살펴보세요.",
  "두 해의 결이 다르다면, 같은 일도 다른 방식으로 해 보는 실험이 도움이 돼요.",
  "이 풀이는 국면을 말할 뿐이고, 무엇을 할지는 내가 정하는 몫이에요.",
  "올해 이미 지나온 시간을 돌아보며 이 결이 보였는지 확인해 보세요.",
  "다가오는 해의 첫걸음은 크지 않아도 괜찮아요.",
];
const POOL_TEASER = [
  "이 명식에서 이 주제는 그 자리를 먼저 살피며 읽어요.",
  "명리의 읽기는 관점이라서, 생활 속 장면으로 직접 확인해 보는 것이 가장 정확해요.",
  "전체 풀이에서는 지금의 10년과 올해, 다가오는 해의 결까지 이어서 살펴봐요.",
  "자리와 개수는 결론이 아니라 힘이 먼저 붙기 쉬운 방향을 보여 줘요.",
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

/** The topic's key fact in one sentence (the teaser's second sentence, 2절's anchor). */
function keySentence(f: SajuTopicFactSet): string {
  const g = groupBy(f);
  const basis = basisOf(f);
  const day = f.pillars.find((p) => p.pillar.includes("(일주)"))!;
  if (f.topic === "money") return groupSentence(g.재성, basis);
  if (f.topic === "career") return groupSentence(f.situation?.id === "exam" ? g.인성 : g.관성, basis);
  return `태어난 날의 지지 ${josa(day.branch.display, "이", "가")} 일지이고, 십성으로는 ${josa(day.branch.mainTenGod, "이에요", "예요")}.`;
}

function section1(f: SajuTopicFactSet, say: Say): string {
  const dm = f.dayMaster;
  const most = f.groups.items.reduce((a, b) => (b.count > a.count ? b : a));
  return filled([
    `${josa(say("일간"), "은", "는")} ${dm.display}, 명리에서는 ${dm.image}에 비유하는 글자예요.`,
    f.season ? `${f.season.text}에 태어났어요.` : "",
    `가장 많은 기운은 ${f.elements.most.join(", ")}개예요.`,
    f.elements.missing.length ? `겉에 한 글자도 없는 기운도 있어요(${f.elements.missing.join("·")}).` : "다섯 기운이 모두 겉에 한 글자 이상 보여요.",
    // "천간과 지지 본기 기준": the first of those terms in a reading with the hour
    glossText(`${f.groups.basis}으로 세면 겉에 가장 많은 묶음은 ${josa(say(most.name), "이에요", "예요")}.`, say),
  ], POOL_S1, 310);
}

function section2(f: SajuTopicFactSet, say: Say): string {
  const g = groupBy(f);
  const basis = basisOf(f);
  const day = f.pillars.find((p) => p.pillar.includes("(일주)"))!;
  const window = f.dayWindow ? [f.dayWindow.sentence, `그래서 ${f.dayWindow.range} 사이에 태어났다면 일지가 ${ro(f.dayWindow.dayBranch)} 달라질 수 있어요.`] : [];
  // what each line says is written where it stands (the chip first), so a term is glossed where it first appears
  const dayLines = () => [
    `태어난 날의 아래 글자 ${josa(day.branch.display, "이", "가")} ${josa(say("일지"), "이에요", "예요")}. 그 자리의 대표 글자는 ${josa(say(day.branch.mainTenGod), "이고", "고")}, 기운의 단계로는 ${say(day.branch.twelveStage)}에 있어요.`,
    "명리에서는 이 자리에서 가까운 사람을 대하는 결을 읽어요.",
  ];
  const lines: Record<SajuTopicId, () => string[]> = {
    money: () => [groupSentence(g.재성, basis, say), groupSentence(g.식상, basis, say), g.식상.count > 0 && g.재성.count > 0 ? "식상과 재성이 겉에 함께 있어서, 표현한 것이 돈으로 이어지는 길이 보이는 편이에요." : "식상과 재성이 겉에 함께 있지는 않아서, 표현한 것이 돈으로 이어지는 길은 조건이 맞을 때 드러나는 편이에요."],
    career: () => (f.situation?.id === "exam" ? [g.인성, g.관성, g.식상] : [g.관성, g.식상, g.인성]).map((x) => groupSentence(x, basis, say)),
    love: () => [...dayLines(), `일간 ${josa(f.dayMaster.display, "은", "는")} ${f.dayMaster.image}에 비유하는 글자예요.`],
    reunion: () => [...dayLines(), groupSentence(g.인성, basis, say), groupSentence(g.식상, basis, say)],
  };
  const chip = chipSentences(f).map((sentence) => glossText(sentence, say));
  return filled([...chip, ...lines[f.topic](), ...window], POOL_S2, 520);
}

function section3(f: SajuTopicFactSet, say: Say): string {
  const g = groupBy(f);
  const basis = basisOf(f);
  const month = f.pillars.find((p) => p.pillar.includes("(월주)"))!;
  const most = f.groups.items.reduce((a, b) => (b.count > a.count ? b : a));
  const lines: Record<SajuTopicId, () => string[]> = {
    money: () => [groupSentence(g.비겁, basis, say), groupSentence(g.인성, basis, say), `개수만 보면 비겁 ${g.비겁.count}개, 재성 ${g.재성.count}개예요.`],
    career: () => [
      `태어난 달의 기둥 ${month.ko}(${month.gz})의 위 글자는 ${josa(say(month.stem.tenGod), "이고", "고")}, 아래 글자의 대표 글자는 ${ro(say(month.branch.mainTenGod))} 읽어요.`,
      `태어난 달 자리의 기운은 ${say(month.branch.twelveStage)}에 있어요.`,
      `${f.groups.basis}으로 세면 겉에 가장 많은 묶음은 ${josa(say(most.name), "이에요", "예요")}.`,
    ],
    love: () => [
      `다섯 묶음을 겉 글자로 세면 ${f.groups.items.map((x) => `${say(x.name)} ${x.count}개`).join(", ")}예요.`,
      ...f.groups.items.filter((x) => x.count === 0).map((x) => groupSentence(x, basis, say)),
      "명리에서는 이 다섯 묶음을 관계를 맺는 방식의 다섯 축으로 읽어요.",
    ],
    reunion: () => [
      ...f.focus.s3.filter((line) => line.includes("관계가 있어요")).map(relationSentence),
      `${f.groups.basis}으로 세면 겉에 가장 많은 묶음은 ${josa(say(most.name), "이에요", "예요")}.`,
      "다시 이어진다면 이 관계가 먼저 움직이는 장면부터 살펴보는 편이 좋아요.",
    ],
  };
  return filled(lines[f.topic](), POOL_S3, 520);
}

function section4(f: SajuTopicFactSet, say: Say): string {
  const current = f.luck?.current;
  const luck = current
    ? [
      `${josa(say("대운"), "은", "는")} 지금 ${current.from}부터 ${current.to}까지 이어지는 ${josa(`${current.ko}(${current.gz})`, "이에요", "예요")}.`,
      `위 글자는 ${josa(say(current.stemTenGod), "이고", "고")}, 아래 글자의 대표 글자는 ${ro(say(current.branchMainTenGod))} 읽어요.`,
    ]
    : f.luck
      ? [`아직 ${josa(say("대운"), "이", "가")} 시작되기 전이에요. ${f.luck.start}.`]
      : [`태어난 시각을 몰라 연주나 월주가 하나로 정해지지 않아 ${josa(say("대운"), "은", "는")} 계산하지 않았어요.`];
  const notes = [f.luck?.changeSoon ? `${f.luck.changeSoon}.` : "", f.luckEdge ?? ""];
  const watched = f.focus.s4.filter((line) => line.includes("관계가 있어요") || line.startsWith("원국 겉에 없는")).map((line) => glossText(relationSentence(line), say));
  return filled([...luck, ...notes, ...watched], POOL_S4, 520);
}

function section5(f: SajuTopicFactSet, say: Say): string {
  const a = f.annual;
  const n = f.nextAnnual;
  const watched = f.focus.s5.filter((line) => line.includes("관계가 있어요")).map(relationSentence);
  return filled([
    `${ro(say("세운"))} 보면 올해 남은 기간은 ${a.year}년 ${josa(`${a.ko}(${a.gz})`, "이에요", "예요")}. 위 글자는 ${josa(say(a.stemTenGod), "이고", "고")}, 아래 글자의 대표 글자는 ${ro(say(a.branchMainTenGod))} 읽어요.`,
    `다가오는 해는 입춘 무렵부터 ${n.year}년 ${josa(`${n.ko}(${n.gz})`, "이에요", "예요")}. 위 글자는 ${josa(say(n.stemTenGod), "이고", "고")}, 아래 글자의 대표 글자는 ${ro(say(n.branchMainTenGod))} 읽어요.`,
    ...watched,
  ], POOL_S5, 520);
}

function section6(f: SajuTopicFactSet, say: Say): string {
  return [
    "계산 기준은 만세력마다 조금씩 다를 수 있어서, 이 풀이가 어떤 기준으로 읽었는지 밝혀 둘게요.",
    ...f.calculation.slice(0, 2).map((line) => glossText(`${line.replace(/[.。]$/, "")}.`, say)),
    ...f.limits,
    "태어난 시각을 알게 되면 내 정보에서 고칠 수 있고, 이 풀이도 그때 다시 계산할 수 있어요.",
  ].join(" ");
}

/** What the 한눈에 보기 of each 운 speaks about (owner 2026-10-07, e.g. 재물운: where money comes in, where it leaks). */
const TOPIC_GLANCE: Readonly<Record<SajuTopicId, { when: string; slip: string; scene: string; action: string }>> = {
  love: { when: "관계를 맺을 때", slip: "그 힘이 필요한 순간에 마음이 엇갈리기 쉬운 편이에요", scene: "관계를 맺는 일", action: "가까운 사람과 보내는 시간을 일정에 먼저 넣어 보세요." },
  reunion: { when: "마음을 추스를 때", slip: "그 힘이 필요할 때 같은 생각을 되풀이하기 쉬운 편이에요", scene: "마음을 추스르는 일", action: "하루 리듬을 지키는 작은 습관 하나를 정해 두세요." },
  money: { when: "돈을 다룰 때", slip: "그 힘이 필요한 자리에서 돈이 새기 쉬운 편이에요", scene: "쓰고 모으는 일", action: "고정으로 나가는 돈부터 한 번 점검해 보세요." },
  career: { when: "일할 때", slip: "그 힘이 필요한 일에서 무리하기 쉬운 편이에요", scene: "일하는 방식을 다지는 일", action: "올해 남은 기간에 다질 일 하나를 골라 마무리해 보세요." },
};

/** One everyday act for the group a chart has least of. */
const GROUP_REMEDY: Readonly<Record<GroupName, string>> = {
  비겁: "혼자 정하기 전에 믿을 만한 사람 한 명에게 의견을 물어보세요.",
  식상: "생각만 해 둔 것 하나를 짧은 말로 먼저 꺼내 보세요.",
  재성: "이번 주에 쓴 돈과 시간을 한 번 훑어보고 새는 곳을 찾아보세요.",
  관성: "하루에 꼭 지킬 기준 하나를 먼저 정해 두세요.",
  인성: "막힐 때 도움을 청할 곳 한 군데를 미리 알아 두세요.",
};

/** 한눈에 보기 for a 운: the group the chart has most and least of on the surface, this year's 세운 and its ten god. */
function topicGlance(f: SajuTopicFactSet, say: Say): SajuGlance {
  const most = f.groups.items.reduce((a, b) => (b.count > a.count ? b : a));
  const least = f.groups.items.filter((g) => g !== most).reduce((a, b) => (b.count < a.count ? b : a));
  const t = TOPIC_GLANCE[f.topic];
  return {
    goesWell: `${josa(say(most.name), "이", "가")} 겉에 ${most.count}개로 가장 많아, 그 힘을 살려 ${t.when} 잘 풀리는 편이에요.`,
    watchOut: `${josa(say(least.name), "은", "는")} ${least.count > 0 ? `겉에 ${least.count}개뿐이라` : "겉에 없어"}, ${t.slip}.`,
    remedy: GROUP_REMEDY[least.name],
    thisYear: mockThisYear(f, say, t.scene),
    thisYearAction: t.action,
  };
}

export function mockSajuTopicReading(f: SajuTopicFactSet): SajuReading {
  // Plain words first (owner 2026-10-07): each term glossed where it first appears, the card on top first.
  const say = glossOnce();
  const glance = topicGlance(f, say);
  const bodies = [section1(f, say), section2(f, say), section3(f, say), section4(f, say), section5(f, say), section6(f, say)];
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
      `${topicName(f.topic)}은 이 자리에서 먼저 읽어요. 이 결이 익숙한 장면이 많았다면 이 구조와 맞물리고, 낯설게 느껴졌다면 이 부분은 덜 맞는 풀이예요.`,
      f.situation ? `요즘 '${f.situation.label}'라고 골랐으니, 그 장면에서 이 자리가 어떻게 움직이는지부터 살펴볼게요.` : "",
      "이번 주에는 이 결이 보이는 장면 하나를 골라 평소와 다른 방식으로 해 보세요.",
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
