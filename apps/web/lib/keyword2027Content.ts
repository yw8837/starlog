import { BRANCHES, BRANCHES_KO, STEMS, STEMS_KO, branchElement, stemElement } from "@starlog/core";
import { PLAIN_WORDS } from "./ai/plainWords";
import type { Branch, Ilju, Stem } from "./keyword2027";
import { particle } from "./korean";

/**
 * 2027년 나의 키워드: how a 일주 meets 2027 (丁未), and the fixed words for each of the 60. Read by the result pages
 * and the share image on the server; no AI call, nothing personal.
 *
 * The mapping, so the free test never says what the paid 2027 신년운세 would not (its facts come from
 * lib/ai/prompts/saju.ts, and lib/keyword2027Content.test.ts checks every row below against those functions):
 *
 * 1. The year's two glyphs as ten gods of the day stem, the paid reading's "천간 X · 지지 Y" line: 丁 (tenGod(일간, 丁))
 *    and 未 by its 본기 己 (tenGod(일간, 己)). Ten outcomes, one per day stem, and they set the year's theme:
 *
 *    일간 | 丁 (위 글자) | 未 (아래 글자, 본기 己) | theme
 *    甲   | 상관        | 정재                  | 재주를 드러내 실속으로 잇는 해
 *    乙   | 식신        | 편재                  | 즐겨 만든 것이 판을 넓히는 해
 *    丙   | 겁재        | 상관                  | 사람 사이에서 겨루고 드러내는 해
 *    丁   | 비견        | 식신                  | 같은 불이 하나 더: 나다움과 동료
 *    戊   | 정인        | 겁재                  | 도움과 배움을 받고 몫을 나누는 해
 *    己   | 편인        | 비견                  | 혼자 파고들어 내 방식을 굳히는 해
 *    庚   | 정관        | 정인                  | 맡은 자리와 인정, 배움이 받쳐 주는 해
 *    辛   | 편관        | 편인                  | 압박 속에서 깊어지는 해
 *    壬   | 정재        | 정관                  | 살림과 약속을 챙기는 해 (+ 丁壬 천간합)
 *    癸   | 편재        | 편관                  | 크게 굴리되 부딪힘을 살피는 해 (+ 丁癸 천간충)
 *
 * 2. How 未 meets the day branch, by the paid reading's branch relations (a 세운 glyph against the natal 일지):
 *    子 해(害) · 丑 충(沖)+형(刑) · 卯 반합(半合, 나무 기운) · 午 육합(六合) · 未 같은 글자 (丁未 일주: 같은 간지) ·
 *    戌 파(破)+형(刑) · 寅 辰 巳 申 酉 亥: none. 원진 is not named: the paid reading's table has no 원진, and the only
 *    원진 partner of 未 (子) is already 해 there. Where there is no relation, the 일지's own 오행 against 未's 흙
 *    sets the tone (寅 나무 roots in it, 巳 불 warms it, 辰 흙 is alike, 申 酉 쇠 is fed by it, 亥 물 is held by it).
 *
 * Every day stem pairs with six branches of its own polarity, so (1) × (2) names each of the 60 once: the keyword,
 * what 2027 brings, what to watch and one small action were written for that pair. Lines are plain 해요체 under 40
 * characters, no scores, no promises; the terms appear only in the reason under them (reasonLines).
 */

export const YEAR_GZ = "丁未";

export type TenGod = "비견" | "겁재" | "식신" | "상관" | "편재" | "정재" | "편관" | "정관" | "편인" | "정인";

/** Table 1: 丁 and 未 (본기 己) as ten gods of each day stem. */
export const STEM_GODS: Readonly<Record<Stem, { stemGod: TenGod; branchGod: TenGod }>> = {
  甲: { stemGod: "상관", branchGod: "정재" },
  乙: { stemGod: "식신", branchGod: "편재" },
  丙: { stemGod: "겁재", branchGod: "상관" },
  丁: { stemGod: "비견", branchGod: "식신" },
  戊: { stemGod: "정인", branchGod: "겁재" },
  己: { stemGod: "편인", branchGod: "비견" },
  庚: { stemGod: "정관", branchGod: "정인" },
  辛: { stemGod: "편관", branchGod: "편인" },
  壬: { stemGod: "정재", branchGod: "정관" },
  癸: { stemGod: "편재", branchGod: "편관" },
};

/** How 丁 meets the day stem, in the paid reading's words (stemRelations); the other seven stems meet it with none. */
export const STEM_MEETING: Readonly<Partial<Record<Stem, string>>> = { 丁: "같은 글자", 壬: "천간합(天干合)", 癸: "천간충(天干沖)" };

/** Table 2: how 未 meets each day branch, in the paid reading's words (branchRelations, a 세운 glyph against the 일지). */
export const BRANCH_MEETING: Readonly<Record<Branch, readonly string[]>> = {
  子: ["해(害)"],
  丑: ["충(沖)", "형(刑)"],
  寅: [],
  卯: ["반합(半合, 나무 기운)"],
  辰: [],
  巳: [],
  午: ["육합(六合)"],
  未: ["같은 글자"],
  申: [],
  酉: [],
  戌: ["파(破)", "형(刑)"],
  亥: [],
};

const SAME_PILLAR = "같은 간지";

/** What 2027 meets in this 일주's day branch; a 丁未 일주 meets the whole year as one 같은 간지 (pillarRelations). */
export function meetingOf(ilju: Ilju): readonly string[] {
  return ilju.hanja === YEAR_GZ ? [SAME_PILLAR] : BRANCH_MEETING[ilju.branch];
}

// ---- the reason under each keyword ----

const stemKo = (stem: Stem) => STEMS_KO[STEMS.indexOf(stem)]!;
const branchKo = (branch: Branch) => BRANCHES_KO[BRANCHES.indexOf(branch)]!;
/** "子(자)는", "丑(축)은": the particle follows the glyph's hangul reading. */
const glyph = (hanja: string, ko: string, pair: "은/는" | "과/와") => `${hanja}(${ko})${particle(ko, pair)}`;
const copula = (word: string) => (particle(word, "이/가") === "이" ? "이에요" : "예요");

/** Plain words for the relations, the term in brackets after them (형 is named as the paid reading notes it: by 유파). */
const RELATION_PLAIN: Readonly<Record<string, string>> = {
  "해(害)": "은근히 어긋나는 짝(해)",
  "충(沖)": "정면으로 맞서는 짝(충)",
  "파(破)": "서로의 틀을 흔드는 짝(파)",
  "육합(六合)": "서로 묶이려는 짝(육합)",
  "반합(半合, 나무 기운)": "亥卯未 세 글자 가운데 둘이라 나무 기운으로 손잡는 짝(반합)",
};
const PUNISH_NOTE = "丑戌未 세 글자 가운데 둘이라 유파에 따라 서로 다그치는 짝(형)으로도 봐요.";

/** With no relation: what 未's 흙 and the day branch's 오행 do to each other. */
function toneOf(branch: Branch): string {
  const ko = branchKo(branch);
  const element = branchElement(branch);
  if (element === "목") return `${branch}(${ko})의 나무가 未의 흙에 뿌리를 내리는 결이에요.`;
  if (element === "화") return `${branch}(${ko})의 불이 未의 흙을 데워 주는 결이에요.`;
  if (element === "토") return `${glyph(branch, ko, "과/와")} 未가 같은 흙이라 결이 닮았어요.`;
  if (element === "금") return `未의 흙이 ${branch}(${ko})의 쇠를 품어 길러 주는 결이에요.`;
  return `未의 흙이 ${branch}(${ko})의 물길을 다잡는 결이에요.`;
}

/** Two or three sentences: the year's ten gods for this day stem, then how 未 meets the day branch. */
export function reasonLines(ilju: Ilju): string[] {
  const { stemGod, branchGod } = STEM_GODS[ilju.stem];
  const me = `${stemKo(ilju.stem)}${stemElement(ilju.stem)}`;
  const lines = [
    `2027년 정미년의 위 글자 丁(정)은 ${me}인 나에게 ${PLAIN_WORDS[stemGod]}(${stemGod})이고, 아래 글자 未(미)는 ${PLAIN_WORDS[branchGod]}(${branchGod})${copula(PLAIN_WORDS[branchGod]!)}.`,
  ];
  const meeting = meetingOf(ilju);
  if (meeting[0] === SAME_PILLAR) {
    lines.push(`올해의 丁未와 내 일주가 같은 간지예요. 같은 기운이 한 해 내내 겹쳐요.`);
    return lines;
  }
  const stemMeeting = STEM_MEETING[ilju.stem];
  if (stemMeeting === "같은 글자") lines.push("올해의 丁은 나를 나타내는 글자(일간)와 같은 글자예요.");
  else if (stemMeeting) {
    const plain = stemMeeting.startsWith("천간합") ? "위 글자끼리 묶이려는 짝(천간합)" : "위 글자끼리 맞서는 짝(천간충)";
    lines.push(`丁과 내 일간 ${glyph(ilju.stem, stemKo(ilju.stem), "은/는")} ${plain}이기도 해요.`);
  }
  const ko = branchKo(ilju.branch);
  const day = `未와 태어난 날의 아래 글자(일지) ${glyph(ilju.branch, ko, "은/는")}`;
  if (meeting.length === 0) lines.push(`未와 태어난 날의 아래 글자(일지) ${ilju.branch}(${ko}) 사이에는 이 테스트에서 따로 보는 관계가 없어요. ${toneOf(ilju.branch)}`);
  else if (meeting[0] === "같은 글자") lines.push(`올해의 未와 내 일지 ${glyph(ilju.branch, ko, "은/는")} 같은 글자예요.`);
  else lines.push(`${day} ${RELATION_PLAIN[meeting[0]!]}${copula("짝")}.${meeting.includes("형(刑)") ? ` ${PUNISH_NOTE}` : ""}`);
  return lines;
}

// ---- the notes under the form and each result ----

/** What the test is and is not, in the app's plain words: under the form and under every result. */
export const KEYWORD_NOTES = [
  "재미로 보는 테스트예요. 2027 신년운세나 사주 풀이처럼 내 명식 전체를 읽지는 않아요.",
  "태어난 시는 쓰지 않고 날짜로 일주를 찾아요. 자정을 막 넘겨 태어났다면 전날 일주로 보기도 해서, 정확한 일주는 사주 명식에서 확인해 주세요.",
  "생일은 이 화면에서만 쓰고 저장하지 않아요. 결과 주소에는 일주 이름만 남아요.",
] as const;

// ---- the 60 texts ----

export interface KeywordContent {
  /** 2–6 Hangul syllables, the share card's headline */
  keyword: string;
  /** what 2027 brings, one line */
  brings: string;
  /** one thing to watch out for */
  watch: string;
  /** one small everyday action */
  action: string;
}

/** Keyed by the 일주's hanja; written per (table 1 × table 2) pair, in the order of the table above. */
export const KEYWORD_CONTENT: Readonly<Record<string, KeywordContent>> = {
  // 甲 · 상관/정재: 재주를 드러내 실속으로
  甲子: { keyword: "꺼내 보이기", brings: "드러낸 솜씨가 일감으로 이어지기 쉬운 해예요.", watch: "믿던 도움이 은근히 엇갈려 서운함이 쌓이기 쉬워요.", action: "고마운 사람에게 먼저 짧은 안부를 보내 봐요." },
  甲寅: { keyword: "내 이름 걸기", brings: "내 이름을 걸고 직접 꾸린 일에 힘이 실리기 쉬워요.", watch: "혼자 다 하려다 손이 모자라 일정이 밀릴 수 있어요.", action: "할 일 목록에서 남에게 맡길 것 하나를 골라요." },
  甲辰: { keyword: "밭 일구기", brings: "말보다 손으로 보여 주는 쪽이 잘 통하는 해예요.", watch: "벌여 둔 일이 많으면 마무리가 흐려져요.", action: "이번 주에 끝낼 일 하나만 정해 끝까지 가요." },
  甲午: { keyword: "무대 체질", brings: "함께하는 자리에서 재주가 더 잘 드러나는 편이에요.", watch: "신나서 한 말이 약속으로 굳지 않게 살펴요.", action: "말로 한 약속은 그날 바로 메모에 적어 둬요." },
  甲申: { keyword: "할 말은 하기", brings: "참던 의견을 꺼낼수록 일이 제자리를 찾아가요.", watch: "윗사람 앞에서는 말투가 날카롭게 들리기 쉬워요.", action: "불편한 말은 하루 묵혔다가 글로 정리해 봐요." },
  甲戌: { keyword: "판 다시 짜기", brings: "익숙한 방식을 고쳐 짜면 일이 한결 가벼워져요.", watch: "세워 둔 계획이 중간에 틀어져 다시 짜야 할 수 있어요.", action: "계획을 세울 때 두 번째 길도 한 줄 적어 둬요." },
  // 乙 · 식신/편재: 즐겨 만든 것이 판을 넓힘
  乙丑: { keyword: "익숙함 벗기", brings: "익숙한 방식을 벗어날수록 재주가 살아나는 편이에요.", watch: "바꾸고 싶은 일이 한꺼번에 몰려 마음이 바빠질 때가 있어요.", action: "늘 다니던 길 대신 다른 길로 한 번 가 봐요." },
  乙卯: { keyword: "같이 만들기", brings: "뜻 맞는 사람과 손잡고 만들 때 힘이 나는 해예요.", watch: "어울리다 보면 내 몫을 말 못 하고 넘기기 쉬워요.", action: "함께하는 일은 시작할 때 나눌 몫부터 정해요." },
  乙巳: { keyword: "솜씨 자랑", brings: "좋아서 하던 일이 남들 눈에 띄기 쉬워요.", watch: "재미에 빠지면 쉬는 시간을 자꾸 미루게 돼요.", action: "만든 것 하나를 사진으로 남겨 모아 둬요." },
  乙未: { keyword: "내 밭 넓히기", brings: "늘 하던 일의 범위를 조금씩 넓혀 보기 좋은 때예요.", watch: "익숙한 방식만 고집하면 새 길이 안 보여요.", action: "안 해 본 방법 하나를 작게 시험해 봐요." },
  乙酉: { keyword: "다듬어 내놓기", brings: "꼼꼼히 손본 결과물로 인정받기 쉬워요.", watch: "남의 평가 한마디에 마음이 크게 출렁이기도 해요.", action: "내 기준 세 가지를 적고 그걸로 먼저 점검해요." },
  乙亥: { keyword: "혼자 서기", brings: "기대던 데서 한 발 떼면 내 재주가 또렷해져요.", watch: "도와주던 사람의 사정이 바뀌어 기댈 곳이 줄 수 있어요.", action: "남에게 묻기 전에 내 답을 먼저 적어 봐요." },
  // 丙 · 겁재/상관: 사람 사이에서 겨루고 드러냄
  丙子: { keyword: "선 지키기", brings: "사람들 사이에서 내 몫을 분명히 말할 때예요.", watch: "규칙을 가볍게 넘기면 뒤늦게 탈이 나요.", action: "맡은 일의 마감과 범위를 글로 확인해 둬요." },
  丙寅: { keyword: "먼저 나서기", brings: "남보다 한발 먼저 손든 일이 내 자리가 되기 쉬워요.", watch: "경쟁심에 덥석 한 약속이 발목을 잡을 때가 있어요.", action: "대답하기 전에 하루만 생각할 시간을 달라고 해요." },
  丙辰: { keyword: "판 깔아 주기", brings: "사람을 모으고 자리를 만드는 일이 손에 맞아요.", watch: "남 챙기느라 내 일은 뒤로 밀리기 쉬워요.", action: "모임을 열기 전에 내 일정부터 달력에 막아 둬요." },
  丙午: { keyword: "한편 만들기", brings: "겨루던 사람과도 한편이 되기 쉬운 해예요.", watch: "같이 쓰는 돈과 물건의 경계가 흐려지지 않게 살펴요.", action: "함께 쓰는 비용은 그때그때 기록해 나눠요." },
  丙申: { keyword: "발 넓히기", brings: "낯선 사람과 나눈 대화가 새 일로 이어지기 쉬워요.", watch: "이것저것 벌이다 정작 중요한 일이 늦어질 수 있어요.", action: "새로 만난 사람 이름과 한 줄 메모를 남겨요." },
  丙戌: { keyword: "방식 바꾸기", brings: "늘 하던 방식을 바꾸면 숨은 재주가 드러나요.", watch: "함께 짠 계획이 어그러지면 서로 탓하기 쉬워요.", action: "일이 틀어지면 탓하기 전에 다음 할 일부터 적어요." },
  // 丁 · 비견/식신: 같은 불이 하나 더
  丁丑: { keyword: "틀 깨고 서기", brings: "답답하던 틀을 벗어나 내 방식을 찾아가는 해예요.", watch: "바꾸고 싶은 마음에 일을 한꺼번에 엎을 수 있어요.", action: "바꿀 것 하나, 지킬 것 하나를 나눠 적어 봐요." },
  丁卯: { keyword: "든든한 동료", brings: "비슷한 꿈을 가진 사람과 서로 끌어 주는 해예요.", watch: "닮은 사람끼리 고집을 세우면 좀처럼 안 풀려요.", action: "같이 하는 사람에게 고마운 점을 말로 전해요." },
  丁巳: { keyword: "불씨 나누기", brings: "아는 것을 나눌수록 곁에 사람이 모이는 편이에요.", watch: "열정이 넘쳐 내 시간과 힘을 다 내주기 쉬워요.", action: "도와줄 수 있는 시간을 미리 정해 두고 지켜요." },
  丁未: { keyword: "나답게 한 해", brings: "올해 기운이 내 일주와 같아 내 색이 드러나기 쉬워요.", watch: "늘 하던 대로만 하면 같은 고민을 또 하게 돼요.", action: "작년과 다르게 해 볼 일 하나를 정해요." },
  丁酉: { keyword: "꾸준히 굴리기", brings: "작게라도 꾸준히 하던 일이 자라나는 해예요.", watch: "자잘한 지출이 잦아져 모르는 새 새어 나갈 수 있어요.", action: "한 달에 한 번 쓴 돈을 쭉 훑어보는 날을 정해요." },
  丁亥: { keyword: "내 원칙 세우기", brings: "남의 기준보다 내 원칙으로 고른 일이 오래가는 편이에요.", watch: "맡은 자리의 규칙과 내 생각이 어긋날 때가 있어요.", action: "지키고 싶은 원칙 한 줄을 메모 맨 위에 둬요." },
  // 戊 · 정인/겁재: 도움과 배움, 몫 나누기
  戊子: { keyword: "배워서 채우기", brings: "새로 배운 것을 일과 살림에 바로 써먹는 해예요.", watch: "가까운 사람과 돈 이야기에서 오해가 생기기 쉬워요.", action: "빌려주고 받은 것은 그때그때 적어 둬요." },
  戊寅: { keyword: "도움 청하기", brings: "혼자 버티기보다 도움을 청할 때 일이 풀리기 쉬워요.", watch: "책임을 혼자 짊어지다 마음이 무거워질 수 있어요.", action: "막히는 일은 믿는 사람에게 한 번 물어봐요." },
  戊辰: { keyword: "터 다지기", brings: "서두르지 않고 기초를 다질수록 마음이 놓여요.", watch: "고집이 세져 남의 제안을 흘려듣기 쉬워요.", action: "들은 제안 하나는 받아 적고 나중에 다시 읽어요." },
  戊午: { keyword: "곁에서 배우기", brings: "배울 만한 사람과 가까워지기 쉬운 해예요.", watch: "고마운 마음에 무리한 부탁까지 들어주지 않게 살펴요.", action: "도움받은 일은 짧게라도 고마움을 꼭 전해요." },
  戊申: { keyword: "알려 주기", brings: "아는 걸 알려 줄 때 오히려 더 많이 배우는 해예요.", watch: "말이 길어지면 듣는 사람이 먼저 지쳐요.", action: "설명할 것은 세 줄로 줄여 미리 적어 봐요." },
  戊戌: { keyword: "울타리 고치기", brings: "오래 둔 관계와 습관에 손이 가는 때예요.", watch: "가까운 사이일수록 몫을 두고 다투기 쉬워요.", action: "안 쓰는 물건 하나를 정리하며 시작해 봐요." },
  // 己 · 편인/비견: 혼자 파고들어 내 방식으로
  己丑: { keyword: "밭갈이", brings: "익숙한 터를 갈아엎고 새로 심을 자리를 고르는 때예요.", watch: "고집끼리 부딪혀 가까운 사람과 맞서기도 해요.", action: "말다툼이 길어지면 10분 걷고 돌아와요." },
  己卯: { keyword: "연구 모임", brings: "같은 걸 파는 사람들과 모일수록 깊이가 생겨요.", watch: "모임에서 맡은 일이 생각보다 무거워질 때가 있어요.", action: "맡기 전에 할 수 있는 만큼을 먼저 말해요." },
  己巳: { keyword: "깊이 파기", brings: "한 가지를 오래 파고들면 나만의 무기가 돼요.", watch: "생각이 많아져 시작을 자꾸 미루기 쉬워요.", action: "공부할 것 하나를 정해 매일 15분씩 해요." },
  己未: { keyword: "내 방식대로", brings: "남 눈치 덜 보고 내 속도로 가도 괜찮은 해예요.", watch: "혼자 정한 기준이 남에게 벽처럼 느껴질 수 있어요.", action: "내 계획을 한 사람에게 들려주고 의견을 들어요." },
  己酉: { keyword: "기록 쌓기", brings: "파고든 것을 글이나 결과물로 남기면 쓸모가 커져요.", watch: "완벽하게 하려다 내놓을 때를 놓치기 쉬워요.", action: "덜 다듬었어도 하나를 먼저 보여 줘요." },
  己亥: { keyword: "살림 다잡기", brings: "흩어진 돈과 시간을 한곳으로 모아 정리하는 해예요.", watch: "같이 쓰는 돈에서 서로 기준이 달라 부딪힐 수 있어요.", action: "고정으로 나가는 돈을 한 장에 정리해 봐요." },
  // 庚 · 정관/정인: 맡은 자리와 인정
  庚子: { keyword: "말의 무게", brings: "맡은 자리에서 내 말에 무게가 실리기 쉬워요.", watch: "솔직한 한마디가 규칙을 건드려 오해를 사기도 해요.", action: "중요한 말은 보내기 전에 소리 내 읽어 봐요." },
  庚寅: { keyword: "책임 맡기", brings: "맡은 일을 끝까지 챙기면 다음 자리가 열리기 쉬워요.", watch: "일이 몰려 가족과 보내는 시간이 줄어들기 쉬워요.", action: "일주일에 한 번은 일 없는 저녁을 정해 둬요." },
  庚辰: { keyword: "자격 갖추기", brings: "배워 둔 것을 자격이나 기록으로 정리해 보기 좋은 때예요.", watch: "준비만 길어지고 써먹을 때를 놓칠 수 있어요.", action: "배운 것을 써 볼 자리를 하나 먼저 잡아요." },
  庚午: { keyword: "자리 잡기", brings: "나를 믿고 맡겨 주는 곳과 손발이 잘 맞는 편이에요.", watch: "기대에 맞추려다 내 속도를 잃기 쉬워요.", action: "맡은 일의 우선순위 세 개를 매주 다시 정해요." },
  庚申: { keyword: "단단해지기", brings: "까다로운 일을 거칠수록 실력이 여물어요.", watch: "자존심에 도움을 마다하는 걸 조심해요.", action: "힘든 일 하나는 같이 할 사람을 먼저 찾아요." },
  庚戌: { keyword: "다시 세우기", brings: "계획을 다시 세우며 내 기준이 또렷해지는 해예요.", watch: "기준이 흔들릴 때 서둘러 정하려는 마음을 살펴요.", action: "바뀐 일은 정리해서 한 번 더 확인받아요." },
  // 辛 · 편관/편인: 압박 속에서 깊어짐
  辛丑: { keyword: "시험대 넘기", brings: "까다로운 과제를 넘기며 나만의 요령을 얻는 해예요.", watch: "계획이 틀어질 때 스스로를 몰아세우지 않게 살펴요.", action: "급한 일과 중요한 일을 나눠 적고 하나씩 해요." },
  辛卯: { keyword: "짐 나눠 들기", brings: "부담스러운 일도 사람들과 나누면 수월해져요.", watch: "남 일까지 떠안아 내 몫이 버거워질 수 있어요.", action: "거절할 일 하나를 정중한 문장으로 미리 써 둬요." },
  辛巳: { keyword: "버티는 힘", brings: "끝까지 버틴 일은 실력으로 남는 편이에요.", watch: "책임감이 지나쳐 쉬는 법을 잊기 쉬워요.", action: "하루 끝에 잘한 일 하나를 적고 잠들어요." },
  辛未: { keyword: "혼자 깊어지기", brings: "혼자 보내는 시간 속에서 생각이 깊어지는 해예요.", watch: "속마음을 숨기면 작은 오해가 길게 가요.", action: "고민 하나는 믿는 사람에게 털어놓아 봐요." },
  辛酉: { keyword: "다시 빛나기", brings: "다듬어 온 재주가 까다로운 자리에서 빛나기 쉬워요.", watch: "남과 견주다 보면 나를 깎아내리게 돼요.", action: "남 대신 작년의 나와 견줘 봐요." },
  辛亥: { keyword: "말 아끼기", brings: "하고 싶은 말을 골라서 할 때 힘이 실려요.", watch: "답답한 마음에 날 선 말이 먼저 나갈 수 있어요.", action: "화가 날 땐 답장을 한 시간 뒤에 보내요." },
  // 壬 · 정재/정관 + 丁壬 천간합: 살림과 약속
  壬子: { keyword: "약속 챙기기", brings: "흩어진 일과 약속을 하나로 묶어 챙기는 해예요.", watch: "가까운 사람과 돈을 섞으면 서운함이 남기 쉬워요.", action: "함께 쓰는 돈은 쓰는 곳을 따로 나눠 적어요." },
  壬寅: { keyword: "일 굴리기", brings: "일과 살림을 함께 챙기는 감각이 살아나기 쉬워요.", watch: "일을 넓히다 맺은 약속을 깜빡할 때가 있어요.", action: "주간 일정표에 약속부터 적고 일을 채워요." },
  壬辰: { keyword: "큰물 다스리기", brings: "책임이 커져도 나눠 맡으면 길이 잡히는 편이에요.", watch: "맡은 일이 넘치면 마감끼리 부딪쳐요.", action: "마감이 겹치는 주는 한 가지를 미리 미뤄 둬요." },
  壬午: { keyword: "손잡기", brings: "일을 함께할 사람과 조건을 맞춰 보기 좋은 때예요.", watch: "정에 끌려 따져 봐야 할 조건을 넘길 수 있어요.", action: "중요한 약속은 조건을 글로 한 번 정리해요." },
  壬申: { keyword: "뒤에서 챙기기", brings: "앞에 나서기보다 뒤에서 챙기는 쪽이 편한 해예요.", watch: "생각만 하다 정해야 할 때를 놓치기 쉬워요.", action: "고민하는 일은 마감을 정하고 그날 결정해요." },
  壬戌: { keyword: "계약 다시 보기", brings: "맺어 둔 약속과 조건을 다시 들여다보기 좋은 때예요.", watch: "고친 약속을 말로만 두면 서로 다르게 기억할 수 있어요.", action: "서명하기 전에 바뀐 부분만 따로 표시해 읽어요." },
  // 癸 · 편재/편관 + 丁癸 천간충: 크게 굴리되 부딪힘을 살핌
  癸丑: { keyword: "정면 돌파", brings: "미뤄 둔 문제를 마주하고 매듭짓는 해예요.", watch: "부딪힘이 위아래로 겹쳐 쉽게 지칠 수 있어요.", action: "큰 결정은 하루 자고 나서 다시 보고 정해요." },
  癸卯: { keyword: "재주로 넓히기", brings: "가볍게 시작한 재주가 사람을 타고 퍼지기 쉬워요.", watch: "기회가 많아 보여도 다 잡으려다 흩어지기 쉬워요.", action: "올해 키울 것 딱 두 가지만 골라 적어요." },
  癸巳: { keyword: "크게 굴리기", brings: "움직이는 만큼 일과 사람이 넓게 굴러가는 해예요.", watch: "씀씀이가 커져도 정작 잘 모르고 지나가게 돼요.", action: "결제 알림을 켜 두고 큰 지출만 짚어 봐요." },
  癸未: { keyword: "버팀목 찾기", brings: "무거운 일이 겹쳐도 기댈 곳을 찾으면 길이 보여요.", watch: "혼자 감당하려다 마음이 먼저 지치기 쉬워요.", action: "도움이 필요한 일을 한 줄로 적어 부탁해요." },
  癸酉: { keyword: "빗물 모으기", brings: "흩어진 정보와 기회를 모아 내 것으로 만드는 해예요.", watch: "새 소식에 휩쓸려 결정을 자주 뒤집기도 해요.", action: "정보는 한곳에 모으고 주말에 한 번만 봐요." },
  癸亥: { keyword: "물길 내기", brings: "막힌 흐름에 새 길을 내면 움직임이 커져요.", watch: "남과 겨루다 무리하게 일을 벌이기 쉬워요.", action: "새 일을 벌이기 전 지금 하는 일 하나를 마쳐요." },
};

/** The 60 texts for one 일주 (every 일주 has one; lib/keyword2027Content.test.ts). */
export const contentOf = (ilju: Ilju): KeywordContent => KEYWORD_CONTENT[ilju.hanja]!;

