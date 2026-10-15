/**
 * 기다리는 동안: cards the waiting screen turns through while a full reading is written. Each line is a
 * reviewed guide article's key point (핵심 정리), copied word for word so the client bundle does not carry
 * the guide library; waitingTips.test.ts keeps them equal to the articles. No new text is written here.
 */

/** One card: a small label, an optional big title, one line. */
export interface TipCard {
  label: string;
  title?: string;
  text: string;
}

/** lib/guide-articles/day-masters.ts: each 일간's three key points, by SajuChart.dayMaster.ko. */
export const DAY_MASTER_TIPS: Readonly<Record<string, readonly string[]>> = {
  갑목: [
    "갑목은 곧게 선 큰 나무에 빗대는 양의 나무예요.",
    "시작하는 힘이 강점이고, 혼자 짊어지는 습관은 살펴볼 점이에요.",
    "같은 갑목도 태어난 계절과 일지에 따라 결이 달라요.",
  ],
  을목: [
    "을목은 풀과 덩굴에 빗대는 음의 나무예요.",
    "상황에 맞춰 길을 찾는 힘이 강점이고, 내 뜻을 놓치기 쉬운 점은 살펴볼 만해요.",
    "같은 을목도 태어난 계절과 일지에 따라 결이 달라요.",
  ],
  병화: [
    "병화는 하늘의 해에 빗대는 양의 불이에요.",
    "분위기를 바꾸는 활기가 강점이고, 빨리 달아올랐다 식는 점은 살펴볼 점이에요.",
    "같은 병화도 태어난 계절과 일지에 따라 결이 달라요.",
  ],
  정화: [
    "정화는 촛불과 등불에 빗대는 음의 불이에요.",
    "한곳에 오래 마음을 쏟는 깊이가 강점이고, 서운함을 속으로 태우는 점은 살펴볼 만해요.",
    "같은 정화도 태어난 계절과 일지에 따라 빛의 세기가 달라요.",
  ],
  무토: [
    "무토는 산과 너른 땅에 빗대는 양의 흙이에요.",
    "자리를 지키는 힘이 강점이고, 움직이기까지 오래 걸리는 점은 살펴볼 만해요.",
    "같은 무토도 태어난 계절과 일지에 따라 결이 달라요.",
  ],
  기토: [
    "기토는 논밭의 흙에 빗대는 음의 흙이에요.",
    "차근차근 키워 내는 힘이 강점이고, 생각이 많아 결정을 미루는 점은 살펴볼 만해요.",
    "같은 기토도 태어난 계절과 일지에 따라 전혀 다른 밭이 돼요.",
  ],
  경금: [
    "경금은 바위와 무쇠에 빗대는 양의 쇠예요.",
    "먼저 정리하는 결단이 강점이고, 바른말이 차갑게 닿기 쉬운 점은 살펴볼 만해요.",
    "같은 경금도 태어난 계절과 일지에 따라 결이 달라요.",
  ],
  신금: [
    "신금은 다듬은 보석에 빗대는 음의 쇠예요.",
    "작은 차이를 알아보는 정교함이 강점이고, 높은 기준에 쉽게 지치는 점은 살펴볼 만해요.",
    "같은 신금도 태어난 계절과 일지에 따라 결이 달라요.",
  ],
  임수: [
    "임수는 큰 강과 바다에 빗대는 양의 물이에요.",
    "흐름을 넓게 보는 힘이 강점이고, 마무리가 흐려지기 쉬운 점은 살펴볼 만해요.",
    "같은 임수도 태어난 계절과 일지에 따라 결이 달라요.",
  ],
  계수: [
    "계수는 이슬과 빗물에 빗대는 음의 물이에요.",
    "말하지 않은 마음을 읽는 힘이 강점이고, 걱정을 혼자 삭이는 점은 살펴볼 만해요.",
    "같은 계수도 태어난 계절과 일지에 따라 결이 달라요.",
  ],
};

/**
 * lib/guide-articles/saju-concepts.ts: the key points that stand on their own while waiting (none about the
 * birth input, Starlog's own rules, 용신 the reading does not name, or 인연 점수). Eight, so the cards' dots
 * fit a phone.
 */
export const SAJU_CONCEPT_TIPS: readonly string[] = [
  "사주는 연주·월주·일주·시주 네 기둥, 여덟 글자로 읽어요.",
  "일간은 나 자신으로 놓는 글자, 대운은 10년마다 바뀌는 흐름이에요.",
  "기둥마다 맡는 자리가 있지만 앞날을 정해 주는 답은 아니에요.",
  "사주에서 해는 입춘에, 달은 절기가 들어오는 순간에 바뀌어요.",
  "오행의 균형은 개수를 똑같이 맞추는 일이 아니에요.",
  "합은 끌어당기는 관계, 충은 움직임과 긴장이 생기는 관계로 읽어요.",
  "12운성은 일간의 기운을 장생부터 양까지 한살이에 빗댄 이름이에요.",
  "운은 대운, 세운, 월운, 일진의 층으로 겹쳐 읽어요.",
];

/** lib/guide-articles/tarot-basics.ts: the key points that read on their own, without their article around them. */
export const TAROT_TIPS: readonly string[] = [
  "타로 78장은 메이저 22장과 마이너 56장으로 나뉘어요.",
  "메이저는 큰 흐름을, 마이너는 손에 잡히는 일상을 다뤄요.",
  "메이저 아르카나는 0번 바보부터 21번 세계까지 스물두 장이에요.",
  "이름이 무서운 카드도 부정적으로만 읽지는 않아요.",
  "완드는 잎이 돋은 지팡이를 그린 벌로, 불과 의욕을 다뤄요.",
  "컵은 금빛 잔을 그린 벌로, 물과 마음, 관계를 다뤄요.",
  "검은 양날 칼을 그린 벌로, 공기와 생각, 말을 다뤄요.",
  "펜타클은 별 모양 원반을 그린 벌로, 흙과 돈, 생활을 다뤄요.",
  "펜타클이 많다고 돈이 들어온다는 뜻으로 읽지는 않아요.",
  "걱정이 커질 때는 사실과 상상을 나눠 적어 보세요.",
  "라이더-웨이트-스미스 덱에서는 8번이 힘, 11번이 정의예요.",
];

/** The saju reading's cards: the user's own 일간 first (its stem as the title, a key point a card), then 사주 상식. */
export function sajuTipCards(dayMaster: { stem: string; ko: string } | undefined): TipCard[] {
  const own = dayMaster ? (DAY_MASTER_TIPS[dayMaster.ko] ?? []) : [];
  return [
    ...own.map((text) => ({ label: "내 일간", title: `${dayMaster!.stem} ${dayMaster!.ko}`, text })),
    ...SAJU_CONCEPT_TIPS.map((text) => ({ label: "사주 상식", text })),
  ];
}

/** The tarot reading's cards: 타로 상식, a line a card. */
export const TAROT_TIP_CARDS: readonly TipCard[] = TAROT_TIPS.map((text) => ({ label: "타로 상식", text }));
