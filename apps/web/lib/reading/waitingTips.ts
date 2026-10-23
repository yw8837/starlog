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
    "갑목은 천간 맨 앞의 양의 나무로, 곧게 선 큰 나무에 빗대요.",
    "길을 내는 추진력이 강점이고, 혼자 다 짊어지는 습관은 살펴볼 점이에요.",
    "기토와는 천간합, 경금과는 천간충을 이루는 일간이에요.",
  ],
  을목: [
    "을목은 풀과 덩굴처럼 기대고 휘감으며 자라는 음의 나무예요.",
    "휘어도 다시 일어서는 적응력이 을목의 강점으로 꼽혀요.",
    "곁에 갑목이 있으면 덩굴이 큰 나무를 타는 등라계갑으로 봐요.",
  ],
  병화: [
    "해가 온 땅을 비추듯 숨김없이 드러나는 불이 병화예요.",
    "분위기를 띄우는 활기 뒤에는 빨리 식는 흐름도 따라와요.",
    "임수와는 천간충이지만 강 위의 해처럼 반기는 전통도 있어요.",
  ],
  정화: [
    "작은 등불 하나가 방 안을 밝히듯, 정화는 가까운 곳을 비춰요.",
    "한 사람, 한 가지 일에 오래 마음을 쏟는 편으로 봐요.",
    "밤에 더 강하다는 말은 등불 비유에서 나온 이야기예요.",
  ],
  무토: [
    "무토는 바람이 불어도 자리를 지키는 산 같은 흙이에요.",
    "다들 흔들릴 때 끝까지 남아 판을 정리하는 쪽으로 봐요.",
    "천간충의 짝이 없고, 빗물인 계수와 천간합을 이뤄요.",
  ],
  기토: [
    "씨앗을 받아 싹을 틔우는 밭의 흙, 그게 기토예요.",
    "꼼꼼함은 힘이 되지만 준비가 길어지면 시작이 늦어져요.",
    "갑목과 천간합을 이루고, 천간충의 짝은 없어요.",
  ],
  경금: [
    "아직 연장이 되기 전의 무쇠 덩어리가 경금의 모습이에요.",
    "결론부터 말하는 습관 때문에 말이 차갑다는 오해를 사기도 해요.",
    "불을 만나 날이 선다는 비유가 경금에게 자주 붙어요.",
  ],
  신금: [
    "깎고 다듬은 보석처럼 신금은 작은 흠도 놓치지 않는 쇠예요.",
    "그 감각을 예민함으로 볼지 정교함으로 볼지는 쓰는 자리에 달려요.",
    "흙이 겹치면 묻히고 물이 넉넉하면 빛난다는 비유가 따라다녀요.",
  ],
  임수: [
    "막히면 돌아가며 멀리 흐르는 큰 강이 임수예요.",
    "판을 넓게 보지만 관심이 옮겨 다니면 마무리가 흐려지기 쉬워요.",
    "물길을 잡아 주는 흙이 있는지도 함께 봐요.",
  ],
  계수: [
    "소리 없이 땅에 스며드는 빗물, 천간의 마지막 글자 계수예요.",
    "말하지 않은 마음을 먼저 알아채고 혼자 걱정을 삭이기도 해요.",
    "무토와는 합으로 묶이고 정화와는 충으로 맞서요.",
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
  "완드는 의욕과 시작, 밀고 나가는 기세를 다루는 불의 벌이에요.",
  "잔에 무엇이 담겼는지 보듯, 컵은 마음의 상태를 읽어요.",
  "검은 생각과 말, 결정과 갈등을 다루는 공기의 벌이에요.",
  "펜타클은 시간을 들여 쌓는 돈과 생활, 기술의 벌이에요.",
  "펜타클이 많다고 돈이 들어온다는 뜻은 아니에요.",
  "검을 읽은 날엔 미뤄 둔 결정 하나를 작게 정해요.",
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
