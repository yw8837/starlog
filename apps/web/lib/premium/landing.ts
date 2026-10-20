import { TEMPLATES } from "@starlog/core";
import { won } from "@/lib/config";
import { DEEP_TAROT_HREF } from "@/lib/freshStart";
import { PREMIUM, PREMIUM_IDS, premiumPath, type PremiumId } from "./products";

/**
 * What each product page says (plan-reconciled §4.6; owner: every premium explains how it reads and links its guide
 * article, in Starlog's own words, never claiming accuracy or a secret tradition). Names and prices come from SITE
 * through PREMIUM. 해요체.
 */

export interface LandingCopy {
  /** <title>: the product's name */
  title: string;
  /** meta description: ≤155 characters with the price */
  description: string;
  /** 이렇게 읽어요: what is read and with what */
  method: string;
  /** the three steps from start to the finished reading */
  steps: readonly [string, string, string];
  faqs: ReadonlyArray<{ q: string; a: string }>;
  /** the guide article it links (lib/guide) */
  guide: string;
  /** where 시작하기 goes: 켈틱 크로스 10장 skips the 다리 화면 into its builder */
  start: string;
}

const REOPEN = "다 받기 전에 화면을 닫거나 연결이 끊겨도 3번까지 다시 열어 끝까지 받을 수 있어요.";
const minutes = (id: PremiumId) => `보통 ${PREMIUM[id].approxMinutes}분쯤 걸려요`;
/** "2026년 11월 15일" (Korean time). */
const kstDate = (ms: number) => {
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};
const year = PREMIUM["newyear-2027"];
/** The 2027 신년운세 window from SITE: on sale now (owner 2026-10-20) until the last day before it closes; an opening date only if one is set again. */
const yearUntil = year.closesAt !== undefined ? `${kstDate(year.closesAt - 1)}까지` : "";
const yearWindow = year.opensAt !== undefined && year.closesAt !== undefined ? `${kstDate(year.opensAt)} 0시부터 ${yearUntil}` : yearUntil || "판매 기간 동안";

export const LANDING: Readonly<Record<PremiumId, LandingCopy>> = {
  "tarot-deep": {
    title: PREMIUM["tarot-deep"].name,
    description: `고민 하나를 카드 10장, 열 자리로 나눠 깊게 읽는 타로예요. 자리마다의 풀이와 열 장을 엮어 읽는 풀이, 이어서 물어보기 ${PREMIUM["tarot-deep"].followUps}번을 담아 ${won(PREMIUM["tarot-deep"].krw)}이에요.`,
    method: `고민 하나를 카드 10장으로 봐요. 카드마다 자리가 정해져 있어요(${TEMPLATES["deep-tarot"].positions.join(", ")}). 자리마다 한 장씩 읽은 다음, 열 장이 서로 어떻게 이어지는지 엮어 읽어요.`,
    steps: [
      "질문을 만들고 카드 10장을 뽑아요",
      "열 장의 키워드와 '지금의 나' 풀이를 먼저 무료로 봐요",
      `열면 자리별 풀이와 엮어 읽기를 차례로 적어 드려요(${minutes("tarot-deep")})`,
    ],
    faqs: [
      { q: "일반 타로와 무엇이 달라요?", a: "일반 타로는 카드 3장으로 지금을 짧게 봐요. 켈틱 크로스 10장은 같은 고민을 열 자리로 나눠 지나온 것과 다가올 것, 나의 태도와 주변까지 함께 읽어요." },
      { q: "풀이는 어떻게 만들어져요?", a: "뽑은 카드와 자리, 고른 상황을 바탕으로 AI가 풀이를 써요. 카드 그림에 없는 내용이나 결과를 장담하는 말은 자동 검사로 걸러요." },
      { q: "받다가 화면을 닫으면 어떻게 돼요?", a: REOPEN },
    ],
    guide: "celtic-cross-spread",
    start: DEEP_TAROT_HREF,
  },
  // saju only (owner 2026-10-17): the two people, then the year ahead and how to treat each other
  match: {
    title: PREMIUM.match.name,
    description: `나와 그 사람의 사주로 두 사람의 결과 앞으로 1년을 함께 읽는 궁합이에요. 사주로 본 두 사람, 앞으로 1년과 서로에게 맞는 말과 행동, 이어서 물어보기 ${PREMIUM.match.followUps}번을 담아 ${won(PREMIUM.match.krw)}이에요.`,
    method: "두 사람의 생년월일로 각자의 명식을 세우고, 두 일간과 오행, 두 일지 사이의 관계, 지금 지나는 10년을 나란히 놓고 읽어요. 그 사람 쪽은 일간과 오행의 기울기, 관계 이름으로만 말해요. 이어서 앞으로 1년을 석 달씩 나눠 두 사람의 흐름을 보고, 서로에게 맞는 말과 행동, 피하면 좋은 말과 행동을 생활의 말로 적어요.",
    steps: [
      "나와 그 사람의 생년월일과 관계를 적어요",
      "두 사람의 명식과 한눈에 보는 요약을 먼저 무료로 봐요",
      `열면 '${PREMIUM.match.parts[0]}'과 '${PREMIUM.match.parts[1]}'을 차례로 적어 드려요(${minutes("match")})`,
    ],
    faqs: [
      { q: "그 사람의 정보는 어디에 남아요?", a: "그 사람의 생년월일과 태어난 시는 스타로그 서버에 남기지 않아요. 계정에는 관계, 부르는 말, 고민과 풀이 글이 남아요. 이어서 물어보기를 위해 이 기기에만 잠근 채로 30일 동안 뒀다가, 30일이 지난 뒤 앱을 처음 열 때 지워요. 풀이에는 그 사람의 일간 한 글자와 오행의 기울기, 관계 이름만 쓰고, 생년이나 다른 기둥 글자는 쓰지 않아요." },
      { q: "궁합을 점수로 매기나요?", a: "점수나 좋고 나쁨은 매기지 않아요. 두 사람의 힘이 어디서 나기 쉽고 어디서 엇갈리기 쉬운지, 앞으로 1년을 석 달씩 어떻게 보내면 좋을지, 서로에게 맞는 말과 행동을 함께 적어요." },
      { q: "그 사람에게 물어봐야 해요?", a: "다른 사람의 생년월일은 그 사람이 괜찮다고 한 경우에만 적어 주세요. 적기 전에 한 번 더 확인해요." },
    ],
    guide: "saju-compatibility",
    start: `${premiumPath("match")}/new`,
  },
  "newyear-2027": {
    title: PREMIUM["newyear-2027"].name,
    description: `내 명식에 2027년의 흐름과 열두 달을 겹쳐 읽는 신년운세예요. 한 해의 큰 흐름과 달마다의 풀이, 이어서 물어보기 ${PREMIUM["newyear-2027"].followUps}번을 담아 ${won(PREMIUM["newyear-2027"].krw)}이에요.`,
    method: "내 생년월일로 세운 명식에 2027년(정미년)의 기운과 그해에 지나는 10년, 열두 달의 흐름을 겹쳐 읽어요. 일, 돈, 관계, 몸과 생활 리듬을 나눠 보고 1월부터 12월까지 달마다 풀이해요.",
    steps: [
      "생년월일과 지금 상태를 골라요",
      "2027년의 제목과 한 해 요약을 먼저 무료로 봐요",
      `열면 한 해의 큰 흐름, 1월~6월, 7월~12월을 차례로 적어 드려요(${minutes("newyear-2027")})`,
    ],
    faqs: [
      { q: "언제 볼 수 있어요?", a: `${yearWindow} 열 수 있어요. 늦게 열어도 지난 달까지 열두 달이 모두 담겨요.` },
      { q: "사주 풀이와 무엇이 달라요?", a: "사주 풀이는 타고난 결과 지금의 흐름을 봐요. 2027 신년운세는 2027년 한 해에 집중해 달마다 나눠 읽어요." },
      { q: "받다가 화면을 닫으면 어떻게 돼요?", a: REOPEN },
    ],
    guide: "new-year-fortune",
    start: `${premiumPath("newyear-2027")}/new`,
  },
};

/** The product a guide article belongs to (its link under the article), or null for every other article. */
export const premiumForGuide = (slug: string): PremiumId | null => PREMIUM_IDS.find((id) => LANDING[id].guide === slug) ?? null;
