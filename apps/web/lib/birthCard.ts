import { CARDS, computeChart } from "@starlog/core";

/**
 * 나를 닮은 타로 카드 (the tarot birth card, free test ①): a birth date → one of the 22 major arcana.
 *
 * The rule: add every digit of the solar date written YYYYMMDD; while the sum is over 22, add its digits
 * again; 22 is 0, 바보 (so all of 0–21 have a number to land on). 1990-05-15 → 1+9+9+0+0+5+1+5 = 30 → 3,
 * 여황제. The digits of a date add up to at least 4, and 10, 11, 19 and 20 stay as they are, so I 마법사 and
 * II 여사제 never come out of the sum: their pages exist (the list of 22, a shared link) for anyone to read.
 *
 * The date is used in the browser and dropped: it is never in an address, a link, a share, storage or an
 * analytics hit. Every address carries the card's slug only (/birth-card/hermit).
 *
 * The lines are fixed text (no AI call), drawn from the card knowledge base the readings use
 * (lib/kb/cards.generated.json: keywordsKo, core.upright, core.shadow); `basis` names the phrases each
 * card's lines come from, and birthCard.test.ts checks they are that card's own.
 */

export const BIRTH_CARD_PATH = "/birth-card";
export const birthCardPath = (slug: string): string => `${BIRTH_CARD_PATH}/${slug}`;
/** The card's 1200×630 link preview (app/api/og/birth-card/[card]/route.tsx). */
export const birthCardOgPath = (slug: string): string => `/api/og/birth-card/${slug}`;

/** The test's name, as the pages, the share text and the preview image say it. */
export const BIRTH_CARD_TITLE = "나를 닮은 타로 카드";

export interface BirthCard {
  /** The card id without "major-NN-": "hermit" for major-09-hermit. */
  slug: string;
  cardId: string;
  /** 0–21 */
  number: number;
  roman: string;
  /** The deck's Korean name: "은둔자" */
  name: string;
  /** 이런 사람이에요: three short lines, 해요체. */
  traits: readonly [string, string, string];
  /** 요즘 이 카드가 묻는 것 */
  asks: string;
  /** One line toward a reading, above 이 카드로 지금 고민 보기. */
  nudge: string;
  /** The knowledge base phrases the lines above are drawn from. */
  basis: readonly string[];
}

type Lines = Pick<BirthCard, "traits" | "asks" | "nudge" | "basis">;

const LINES: Record<string, Lines> = {
  fool: {
    traits: ["궁금하면 일단 해 보고 생각해요", "처음 가는 길에도 발걸음이 가벼워요", "짐은 적게, 마음은 가볍게 떠나요"],
    asks: "요즘 망설이기만 한 첫걸음이 있나요?",
    nudge: "떼고 싶은 첫걸음이 있다면 카드에 물어보세요.",
    basis: ["호기심", "가벼운 첫걸음", "짐 적게 떠나기"],
  },
  magician: {
    traits: ["있는 재료로 뚝딱 만들어 내요", "마음먹으면 말과 손이 같이 움직여요", "한번 꽂히면 집중력이 대단해요"],
    asks: "갖고 있으면서 아직 안 쓴 재주는 뭘까요?",
    nudge: "미뤄 둔 일을 시작할 때인지 카드로 살펴보세요.",
    basis: ["가진 것으로 시작", "말과 기술로 풀기", "집중"],
  },
  "high-priestess": {
    traits: ["말보다 먼저 분위기를 읽어요", "이유는 몰라도 느낌이 먼저 와요", "다 알아도 서두르지 않고 기다려요"],
    asks: "알면서도 아직 말하지 않은 게 있나요?",
    nudge: "마음속 느낌이 맞는지 카드 세 장으로 견줘 보세요.",
    basis: ["조용한 관찰", "직감", "말하지 않은 앎", "기다림"],
  },
  empress: {
    traits: ["곁에 있는 사람을 살뜰히 챙겨요", "맛있는 것, 예쁜 것에서 힘을 얻어요", "천천히 키우고 가꾸는 일을 좋아해요"],
    asks: "남을 챙기는 만큼 나도 챙기고 있나요?",
    nudge: "가꾸고 있는 관계가 궁금하다면 카드로 들여다보세요.",
    basis: ["돌봄", "감각과 즐거움", "편안하게 키우기"],
  },
  emperor: {
    traits: ["한번 한 약속은 끝까지 지켜요", "내 기준이 분명한 편이에요", "일이 흐트러지면 먼저 정리에 나서요"],
    asks: "지금 내가 책임질 범위는 어디까지일까요?",
    nudge: "정해야 할 기준이 있다면 카드 세 장으로 정리해 보세요.",
    basis: ["약속 지키기", "기준 세우기", "책임"],
  },
  hierophant: {
    traits: ["검증된 방법을 믿고 차근차근 가요", "고민 상담을 자주 부탁받아요", "함께 정한 규칙을 소중히 여겨요"],
    asks: "이 고민을 먼저 겪어 본 사람에게 물어봤나요?",
    nudge: "누구 말을 따를지 고민이라면 카드에 물어보세요.",
    basis: ["배움과 전통", "믿을 만한 조언", "함께 지키는 규칙"],
  },
  lovers: {
    traits: ["끌리는 마음을 솔직하게 인정해요", "가치가 맞는 사람과 오래 가요", "중요한 이야기는 마주 보고 해요"],
    asks: "지금 고르는 것이 내가 아끼는 것과 맞나요?",
    nudge: "두 갈래 사이에서 고민이라면 카드 세 장으로 견줘 보세요.",
    basis: ["끌림", "가치가 맞는 관계", "솔직하게 마주 봄", "마음이 향하는 선택"],
  },
  chariot: {
    traits: ["목표가 생기면 앞만 보고 달려요", "흩어진 힘을 한 방향으로 모아요", "흔들려도 고삐를 놓지 않아요"],
    asks: "달리는 동안 몸과 마음은 잘 챙기고 있나요?",
    nudge: "밀고 나갈지 멈출지 카드 세 장으로 확인해 보세요.",
    basis: ["의지로 밀고 나가기", "방향 잡기", "자기 통제", "이기려는 마음이 관계나 몸을 돌보지 않는 것"],
  },
  strength: {
    traits: ["부드럽게 말해도 뜻은 단단해요", "센 감정도 차분히 다독여요", "까다로운 일도 끈기 있게 붙잡아요"],
    asks: "참느라 미뤄 둔 내 마음은 없나요?",
    nudge: "참을지 말할지 고민이라면 카드로 마음을 정리해 보세요.",
    basis: ["다정한 단호함", "감정 다스리기", "인내", "참는 것을 다정함으로 착각해 내 감정을 계속 미루는 것"],
  },
  hermit: {
    traits: ["혼자 있는 시간에 힘을 채워요", "남의 말보다 내 기준을 먼저 봐요", "한발 물러서서 보면 답이 보여요"],
    asks: "혼자 정리하던 시간이 고립이 되진 않았나요?",
    nudge: "혼자 고르던 답을 카드 세 장으로 비춰 보세요.",
    basis: ["혼자 정리하는 시간", "내 기준 세우기", "한발 물러서기", "정리가 고립으로 굳는 것"],
  },
  "wheel-of-fortune": {
    traits: ["흐름이 바뀌는 때를 잘 알아채요", "변화가 와도 금방 올라타요", "오는 기회를 알아보는 눈이 있어요"],
    asks: "운에 맡긴 채 미뤄 둔 선택이 있나요?",
    nudge: "지금이 움직일 때인지 카드 세 장으로 살펴보세요.",
    basis: ["흐름의 전환", "기회의 순간", "모든 걸 운에 맡기고 내 몫의 선택을 놓는 것"],
  },
  justice: {
    traits: ["감정보다 사실을 먼저 따져요", "누구에게나 공평하려고 애써요", "내 선택의 결과는 내가 책임져요"],
    asks: "옳고 그름을 따지다 놓친 마음은 없나요?",
    nudge: "공정하게 정하고 싶은 일이 있다면 카드로 따져 보세요.",
    basis: ["사실대로 보기", "공정한 판단", "책임", "옳고 그름을 따지다 관계의 온기를 잃는 것"],
  },
  "hanged-man": {
    traits: ["남들과 다른 각도로 보는 눈이 있어요", "필요하면 기꺼이 멈추고 기다려요", "움켜쥐기보다 내려놓을 줄 알아요"],
    asks: "기다림이 길어져 고르지 못한 일이 있나요?",
    nudge: "막힌 고민을 다른 각도로 보고 싶다면 카드를 펼쳐 보세요.",
    basis: ["관점 전환", "기꺼이 기다림", "내려놓기", "기다림을 핑계로 아무것도 고르지 않는 것"],
  },
  death: {
    traits: ["끝난 일은 깔끔하게 정리해요", "비워야 새로 채워진다고 믿어요", "큰 변화 앞에서도 담담한 편이에요"],
    asks: "이미 끝났는데 붙잡고 있는 것이 있나요?",
    nudge: "정리할지 이어 갈지 고민이라면 카드 세 장으로 물어보세요.",
    basis: ["정리", "비워 내기", "변화 받아들이기"],
  },
  temperance: {
    traits: ["다른 의견 사이에서 중간을 찾아요", "무엇이든 알맞은 정도를 알아요", "서두르지 않고 천천히 맞춰 가요"],
    asks: "모두에게 맞추다 내 입장이 흐려지진 않았나요?",
    nudge: "어느 쪽에 맞출지 고민이라면 카드로 견줘 보세요.",
    basis: ["중간 지점", "알맞게 섞기", "천천히 맞추기", "모두를 맞추려다 내 입장이 흐려지는 것"],
  },
  devil: {
    traits: ["좋아하는 것에 깊이 빠져드는 편이에요", "내 욕심을 솔직하게 인정할 줄 알아요", "한번 붙잡은 건 쉽게 놓지 않아요"],
    asks: "알면서도 끊지 못한 습관이 있나요?",
    nudge: "놓고 싶은데 못 놓는 것이 있다면 카드로 들여다보세요.",
    basis: ["집착과 습관", "욕망 인정하기", "끊기 어려운 매임"],
  },
  tower: {
    traits: ["아닌 건 아니라고 분명히 말해요", "무너져도 다시 세우는 힘이 있어요", "겉치레보다 진짜를 보고 싶어 해요"],
    asks: "금 간 것을 덧칠하며 버티고 있진 않나요?",
    nudge: "흔들리는 일이 있다면 카드 세 장으로 차분히 짚어 보세요.",
    basis: ["드러나는 진실", "강제 재정비", "깨지는 착각", "흔들림이 무서워 이미 금 간 것을 계속 덧칠하는 것"],
  },
  star: {
    traits: ["힘든 뒤에도 조용히 다시 일어나요", "작은 희망을 잘 찾아내요", "가진 것을 아낌없이 나눠요"],
    asks: "기대만 품고 미뤄 둔 작은 행동이 있나요?",
    nudge: "바라는 일이 있다면 무엇부터 할지 카드에 물어보세요.",
    basis: ["조용한 회복", "희망", "나눠 붓기", "막연한 기대만 품고 현실의 작은 행동을 미루는 것"],
  },
  moon: {
    traits: ["상상력이 풍부하고 감수성이 깊어요", "남들이 못 본 작은 변화도 느껴요", "흐릿할수록 하나씩 확인하며 가요"],
    asks: "짐작을 사실처럼 믿고 있는 일은 없나요?",
    nudge: "흐릿한 고민이 있다면 카드 세 장으로 하나씩 짚어 보세요.",
    basis: ["불안과 상상", "직감 살피기", "흐릿한 길", "막연한 불안을 사실처럼 믿고 움직이는 것"],
  },
  sun: {
    traits: ["기쁜 일은 숨기지 않고 나눠요", "있는 그대로 솔직한 게 매력이에요", "곁에 있으면 분위기가 밝아져요"],
    asks: "밝은 쪽만 보느라 건너뛴 확인은 없나요?",
    nudge: "좋은 흐름을 어떻게 이어 갈지 카드에 물어보세요.",
    basis: ["솔직한 기쁨", "드러내기", "활력", "밝음만 보려다 확인할 것을 건너뛰는 것"],
  },
  judgement: {
    traits: ["넘어져도 다시 일어나는 힘이 있어요", "지난 일을 돌아보고 배울 줄 알아요", "마음이 부르는 쪽으로 결심해요"],
    asks: "나를 너무 가혹하게 평가하고 있진 않나요?",
    nudge: "다시 시작할지 고민이라면 카드 세 장으로 물어보세요.",
    basis: ["다시 일어섬", "돌아보고 정리", "부름에 응답하기", "스스로를 심판하듯 가혹하게 평가하는 것"],
  },
  world: {
    traits: ["시작한 일은 끝까지 마무리해요", "여러 일을 하나로 잘 엮어 내요", "어디서든 금방 제자리를 찾아요"],
    asks: "다 이룬 자리에서 다음 걸음을 망설이나요?",
    nudge: "다음 문을 열 때인지 카드 세 장으로 살펴보세요.",
    basis: ["마무리와 다음 문", "통합", "제자리 찾기", "완성에 머물러 다음 걸음을 두려워하는 것"],
  },
};

/** The 22 major arcana in number order, each with its lines. */
export const BIRTH_CARDS: readonly BirthCard[] = CARDS.filter((card) => card.arcana === "major").map((card) => {
  const slug = card.id.replace(/^major-\d{2}-/, "");
  const lines = LINES[slug];
  if (!lines) throw new Error(`birthCard: no lines for ${card.id}`);
  return { slug, cardId: card.id, number: card.number, roman: card.roman ?? "", name: card.names.ko, ...lines };
});

const BY_SLUG: ReadonlyMap<string, BirthCard> = new Map(BIRTH_CARDS.map((card) => [card.slug, card]));

export const findBirthCard = (slug: string): BirthCard | undefined => BY_SLUG.get(slug);

const digitSum = (digits: string): number => [...digits].reduce((sum, digit) => sum + Number(digit), 0);

/** The birth card's number (0–21) for a solar date: see the rule above. */
export function birthCardNumber(year: number, month: number, day: number): number {
  let sum = digitSum(`${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`);
  while (sum > 22) sum = digitSum(String(sum));
  return sum === 22 ? 0 : sum;
}

export function birthCardFor(year: number, month: number, day: number): BirthCard {
  return BIRTH_CARDS[birthCardNumber(year, month, day)]!;
}

/** What the date fields hold (components/bonds/BirthFields): a part stays null until it is picked. */
export interface BirthDateInput {
  calendar: "solar" | "lunar";
  year: number | null;
  month: number | null;
  day: number | null;
  isLeapMonth: boolean;
}

export interface SolarDate {
  year: number;
  month: number;
  day: number;
}

/** The solar date to add up: a solar date as it is, a lunar one through the 만세력 engine; null while incomplete or for a day that does not exist. */
export function solarBirthDate(input: BirthDateInput): SolarDate | null {
  const { calendar, year, month, day } = input;
  if (year === null || month === null || day === null) return null;
  try {
    // The engine checks the date and, for a lunar one, finds its solar day; the time and place play no part in the date.
    const chart = computeChart({
      calendar,
      year,
      month,
      day,
      ...(calendar === "lunar" ? { isLeapMonth: input.isLeapMonth } : {}),
      time: null,
      gender: "female",
      place: { name: "서울", longitude: 126.978 },
    });
    const [y, m, d] = chart.solarDate.split("-").map(Number) as [number, number, number];
    return { year: y, month: m, day: d };
  } catch {
    return null;
  }
}
