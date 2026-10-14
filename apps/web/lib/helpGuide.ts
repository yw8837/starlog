import { OPENING_LAST_DAY, SITE, won } from "./config";
import { approxCharsText } from "./pricing";

/**
 * 이용 가이드 (/help): category chips over accordion cards (the 사주핑 user-guide pattern, see
 * docs/research/site-ia-references-2026-10-01.md). Only features that work today; every number comes
 * from SITE so the guide cannot drift from the product.
 */

export type HelpIcon =
  | "compass"
  | "device"
  | "question"
  | "pencil"
  | "cards"
  | "shuffle"
  | "open"
  | "spark"
  | "cookie"
  | "calendar"
  | "clock"
  | "chips"
  | "chat"
  | "book"
  | "check"
  | "share"
  | "gift"
  | "tag";

export interface HelpItem {
  id: string;
  icon: HelpIcon;
  title: string;
  /** One line under the title, visible while the card is closed. */
  sub: string;
  /** Opening paragraph. */
  body?: string;
  /** Numbered how-to steps. */
  steps?: string[];
  tip?: string;
  link?: { href: string; label: string };
  /** Ends with the helplines (components/ui/CrisisContacts). */
  crisis?: boolean;
}

export interface HelpGroup {
  id: string;
  /** Chip label. */
  label: string;
  /** One line under the group heading. */
  sub: string;
  items: HelpItem[];
}

const num = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

/** "한 번", "두 번", "세 번", then "4번". */
export const times = (n: number) => (["한 번", "두 번", "세 번"][n - 1] ?? `${num(n)}번`);

/** Said once on a 오픈 기념 무료 record, and by the follow-up and share routes when they refuse one. */
export const OPENING_KEEP_ONLY = "오픈 기념 무료 풀이는 이 기기에서 보고 보관만 할 수 있어요. 이어서 물어보기와 공유는 결제한 풀이에서 할 수 있어요.";

/**
 * 오픈 기념 무료 as screens describe it (owner 2026-10-14 evening): one tarot full reading per device until
 * its last day, read and kept on that device only. Worded with the date, so it stays true once it ends.
 */
export const openingFreeText = (count: number = SITE.beta.firstFreeTarot) =>
  `${OPENING_LAST_DAY}까지 기기마다 타로 전체 풀이 ${times(count)}을 무료로 열 수 있어요(오픈 기념 무료). 이 기기에서 보고 보관만 할 수 있어요(이어서 물어보기·공유 제외).`;

export function helpGroups(site: typeof SITE = SITE): HelpGroup[] {
  const { followUps, approxChars } = site.reading;
  const { firstFreeTarot, teaserPerDay } = site.beta;
  // Widened to number: SITE is `as const`, and literal prices that differ fail the comparison below.
  const { tarotStandardKrw, sajuStandardKrw }: { tarotStandardKrw: number; sajuStandardKrw: number } = site.price;
  // 주제별 사주 (saju-topics spec §5.4, owner cut §0): the 운 help from the `on` build only.
  const topics = site.features.sajuTopics === "on";
  const topicItem: HelpItem = {
    id: "saju-topics",
    icon: "compass",
    title: "다른 운 보기",
    sub: "연애운, 재회운, 재물운, 직장운",
    steps: [
      "명식 화면의 첫 장 아래 ‘다른 운도 볼 수 있어요’에서 연애운, 재회운, 재물운, 직장운 가운데 하나를 눌러요.",
      "그 운의 맛보기가 같은 자리에 바로 나와요. ‘사주팔자로 돌아가기’를 누르면 첫 장으로 돌아와요.",
      "전체 풀이는 지금 보고 있는 풀이 하나가 열려요. 다른 운은 따로 열어요.",
    ],
    tip: `새로 여는 맛보기는 하루 ${times(teaserPerDay)}까지예요. 이 기기에서 이미 본 맛보기는 다시 봐도 횟수를 쓰지 않아요.`,
  };
  const prices =
    tarotStandardKrw === sajuStandardKrw
      ? `타로 전체 풀이와 사주 전체 풀이 모두 한 번에 ${won(tarotStandardKrw)}이에요.`
      : `타로 전체 풀이는 한 번에 ${won(tarotStandardKrw)}, 사주 전체 풀이는 ${won(sajuStandardKrw)}이에요.`;

  return [
    {
      id: "start",
      label: "시작하기",
      sub: "처음이라면 여기부터 보세요",
      items: [
        {
          id: "overview",
          icon: "compass",
          title: `${site.nameKo} 한눈에 보기`,
          sub: "홈과 메뉴 탭",
          steps: [
            "홈에서 타로 보기, 사주 보기, 지금의 한 장, 오늘의 한 장 중 하나를 골라요.",
            "메뉴 탭으로 홈, 내 기록, 가이드, 내 정보를 오가요. 휴대폰에서는 화면 아래, 컴퓨터에서는 오른쪽 위에 있어요.",
            "가이드 탭에는 카드 읽는 법과 명식 읽는 법을 다룬 글이 모여 있어요.",
          ],
        },
        {
          id: "no-login",
          icon: "device",
          title: "로그인 없이 쓰기",
          sub: "기록은 이 기기에 남아요",
          body: "로그인하지 않아도 질문 만들기, 카드 뽑기, 무료로 열리는 풀이를 쓸 수 있어요. 연 풀이와 입력한 정보는 지금 쓰는 브라우저에 보관되고, 로그인하지 않고 연 풀이는 스타로그 서버에 저장하지 않아요.",
          tip: "로그인해 결제하고 연 풀이는 계정에도 보관돼 다른 기기에서 볼 수 있어요. 로그인하지 않고 연 풀이는 다른 기기나 다른 브라우저에서 보이지 않고, 브라우저의 사이트 데이터를 지우면 이 기기의 기록도 함께 지워져요.",
        },
        {
          id: "care",
          icon: "chat",
          title: "마음이 힘든 날",
          sub: "풀이보다 사람과 먼저",
          body: "풀이는 재미와 자기 성찰을 위한 참고용이에요. 무거운 마음을 혼자 풀이에만 기대지 않아도 돼요.",
          crisis: true,
        },
      ],
    },
    {
      id: "tarot",
      label: "타로",
      sub: "질문을 만들고 카드 세 장을 골라요",
      items: [
        {
          id: "question",
          icon: "question",
          title: "질문 만들기",
          sub: "누구, 무엇, 언제를 고르면 완성돼요",
          steps: [
            "타로 보기를 누르고 누구에 관한 이야기인지 먼저 골라요. 누구를 고르면 거기에 맞는 주제가 보여요.",
            "무엇과 언제까지 고르면 질문 한 줄이 완성돼요.",
            "다음 화면에서 지금 상황을 골라요. 해당하는 것만 골라도 되고, 건너뛰어도 괜찮아요.",
          ],
          tip: "상황을 고를수록 풀이가 내 이야기에 가까워져요.",
        },
        {
          id: "custom",
          icon: "pencil",
          title: "직접 쓰기 칸",
          sub: "고를 게 없으면 내 말로 적어요",
          body: "누구, 무엇, 언제마다 직접 쓰기 칸이 있어요. ‘팀장님’, ‘다음 주 금요일 면접’처럼 짧게 적으면 그 말이 질문에 그대로 들어가요.",
          tip: "다른 사람의 이름이나 연락처처럼 그 사람을 알아볼 수 있는 정보는 적지 않는 게 좋아요.",
        },
        {
          id: "pick",
          icon: "cards",
          title: "카드 고르기",
          sub: "펼쳐진 카드에서 마음 가는 세 장",
          steps: [
            "카드가 섞인 뒤 부채꼴로 펼쳐져요. 섞는 장면을 건너뛰려면 바로 펼치기를 눌러요.",
            "마음이 가는 카드를 세 장 골라요. 잘못 골랐다면 방금 고른 카드 빼기로 되돌려요.",
            "세 장을 다 고르면 카드가 뒤집히고, 결과 보기를 누르면 풀이로 넘어가요.",
          ],
        },
        {
          id: "reshuffle",
          icon: "shuffle",
          title: "다시 섞기",
          sub: "새 덱으로 처음부터 고르고 싶을 때",
          body: "부채꼴 가운데의 다시 섞기를 누르면 덱을 새로 섞어 다시 펼쳐요. 그때까지 고른 카드는 빠지고 처음부터 골라요.",
        },
        {
          id: "tarot-open",
          icon: "open",
          title: "첫 풀이와 전체 풀이",
          sub: "먼저 읽어 보고 열지 정해요",
          body: `결과 화면에서 첫 풀이를 먼저 무료로 읽어요. 그 아래에 이어지는 풀이의 소제목과 분량(약 ${approxCharsText(approxChars.tarot)}자)이 보여요.`,
          steps: [
            "더 보고 싶으면 전체 풀이 보기를 눌러요.",
            `전체 풀이와 함께 이어서 물어보기 ${followUps}번이 열리고, 풀이는 이 기기에 보관돼요.`,
          ],
        },
        {
          id: "now",
          icon: "spark",
          title: "지금의 한 장",
          sub: "고민 하나에 카드 한 장, 바로 답",
          steps: [
            "고민을 떠올려요. 적어 두고 싶으면 칸에 한 줄 적어도 돼요.",
            "숨을 한 번 고르고 마음이 가는 카드를 한 장 골라요.",
            "카드가 건네는 한 문장과 그렇게 읽은 이유, 오늘 해 볼 일이 바로 나와요.",
          ],
          tip: "횟수 제한 없이 무료예요. 같은 카드라도 뽑을 때마다 다른 문장이 나올 수 있어요.",
        },
        {
          id: "today",
          icon: "cards",
          title: "오늘의 한 장",
          sub: "카드로 보는 오늘의 운세",
          steps: [
            "섞은 카드 세 장 가운데 마음이 가는 한 장을 골라요.",
            "고른 카드가 뒤집히면서 오늘의 한마디와 애정, 금전, 일 이야기, 오늘의 색과 숫자가 나와요.",
          ],
          tip: "하루에 한 번 무료예요. 같은 날 다시 들어오면 고른 카드와 운세를 그대로 보여 드리고, 다음 날 새 카드가 기다려요.",
        },
      ],
    },
    {
      id: "saju",
      label: "사주",
      sub: "태어난 날로 명식을 세우고 읽어요",
      items: [
        {
          id: "saju-start",
          icon: "calendar",
          title: "사주 보기",
          sub: "태어난 날과 곳으로 명식 세우기",
          steps: [
            "사주 보기를 누르고 태어난 날을 양력이나 음력으로 적어요.",
            "태어난 시를 알면 ‘알아요’를, 모르면 ‘몰라요’를 골라요.",
            "성별과 태어난 곳을 고르고 출생 정보를 풀이에 쓰는 데 동의하면 명식이 세워져요.",
          ],
          tip: "성별은 대운이 흐르는 방향을 계산하는 데만 써요.",
        },
        ...(topics ? [topicItem] : []),
        {
          id: "unknown-time",
          icon: "clock",
          title: "시간 몰라도 돼요",
          sub: "시주를 비워 두고 여섯 글자로 읽어요",
          body: "태어난 시를 모르면 시주 자리에 ‘모름’이 표시되고, 나머지 여섯 글자로 풀이해요. 시간을 짐작해서 채우지 않아요.",
          tip: "명식 아래 적용한 기준을 펼치면 보정한 시각과, 태어난 시각에 따라 달라질 수 있는 점이 보여요.",
        },
        {
          id: "status",
          icon: "chips",
          title: "상태 칩",
          sub: "요즘 상황을 알려 주면 더 구체적으로",
          body: "요즘 상황도 알려 주기에서 연애 상태와 일 상태를 하나씩 고를 수 있어요.",
          tip: "고르지 않아도 풀이는 열려요. 고른 상태는 다음에도 쓰도록 이 기기에 저장돼요.",
        },
        topics
          ? {
              id: "saju-open",
              icon: "open",
              title: "맛보기와 전체 풀이",
              sub: "명식과 맛보기는 먼저 무료로",
              body: `명식(네 기둥, 오행, 일간)과 첫 장 요약, 그리고 보고 싶은 운의 맛보기를 먼저 무료로 봐요. 전체 풀이는 약 ${approxCharsText(approxChars.saju)}자예요. 결제 한 번에 지금 보는 풀이 하나가 열리고, 이어서 물어보기 ${followUps}번이 함께 열려요.`,
            }
          : {
              id: "saju-open",
              icon: "open",
              title: "첫 장과 전체 풀이",
              sub: "명식과 요약은 먼저 무료로",
              body: `명식(네 기둥, 오행, 일간)과 첫 장 요약을 먼저 무료로 봐요. 전체 풀이는 약 ${approxCharsText(approxChars.saju)}자이고, 열면 이어서 물어보기 ${followUps}번이 함께 열려요.`,
            },
      ],
    },
    {
      id: "records",
      label: "기록과 공유",
      sub: "연 풀이를 다시 보고, 나누고, 돌아봐요",
      items: [
        {
          id: "followup",
          icon: "chat",
          title: "이어서 물어보기",
          sub: `풀이 하나에 ${followUps}번`,
          steps: [
            "전체 풀이 맨 아래 칸에 더 궁금한 걸 적어요.",
            "답은 앞의 풀이와 같은 카드, 같은 명식을 이어받아 나와요.",
            `풀이 하나에 ${followUps}번까지 물을 수 있고, 남은 횟수는 칸 옆에 보여요.`,
          ],
          tip: "같은 질문으로 카드를 다시 뽑기보다, 받은 풀이에서 궁금한 점을 좁혀 묻는 쪽이 답이 깊어요.",
        },
        {
          id: "records",
          icon: "book",
          title: "내 기록",
          sub: "연 풀이는 이 기기에 그대로",
          steps: [
            "메뉴의 내 기록에서 지금까지 연 풀이를 최근 것부터 봐요.",
            "다시 열어도 새로 만들지 않고 저장된 풀이를 그대로 보여 드려요.",
            "내 정보에서 이 기기에 저장된 기록을 한 번에 지울 수 있어요. 지운 기록은 되돌릴 수 없어요.",
          ],
        },
        {
          id: "checkin",
          icon: "check",
          title: "돌아보기",
          sub: "며칠 뒤, 풀이가 맞았는지 한 번 눌러요",
          body: "풀이에는 며칠 안에 확인해 볼 수 있는 작은 관찰이 하나 들어 있어요. 풀이를 연 지 사흘이 지나면 홈에 지난 풀이 돌아보기가 떠요.",
          steps: [
            "맞았어요, 아직이에요, 다르게 흘렀어요 중 하나를 눌러요.",
            "고른 답은 그 풀이와 함께 이 기기에 남고, 다음 풀이를 쓸 때 참고해요.",
          ],
        },
        {
          id: "share",
          icon: "share",
          title: "공유하기",
          sub: "카드 이름과 링크만 보내요",
          steps: [
            "풀이 화면에서 공유하기를 눌러요.",
            "휴대폰에서는 공유 창이 열리고, 컴퓨터에서는 링크가 복사돼요.",
          ],
          tip: `공유에는 뽑은 카드 이름과 ${site.nameKo} 링크만 담겨요. 질문, 메모, 생년월일은 보내지 않아요.`,
        },
      ],
    },
    {
      id: "benefits",
      label: "혜택",
      sub: "지금 무료로 쓸 수 있는 것",
      items: [
        {
          id: "beta",
          icon: "gift",
          title: "오픈 기념 무료",
          sub: `타로 전체 풀이 ${times(firstFreeTarot)} · ${OPENING_LAST_DAY}까지`,
          body: `${openingFreeText(firstFreeTarot)} 사주 전체 풀이는 결제하고 열어요. 먼저 읽는 첫 풀이는 하루 ${times(teaserPerDay)}까지 볼 수 있고, 한국 시간 0시에 다시 채워져요.`,
          tip: "전체 풀이 보기 버튼에 오픈 기념 무료가 보이면 아직 무료로 열 수 있어요.",
        },
        {
          id: "daily-free",
          icon: "spark",
          title: "매일 무료로 보는 것",
          sub: "지금의 한 장, 오늘의 한 장",
          body: "지금의 한 장은 횟수 제한 없이, 오늘의 한 장은 하루 한 번 무료로 볼 수 있어요.",
        },
        {
          id: "pricing",
          icon: "tag",
          title: "가격과 무료 범위",
          sub: "풀이 한 번의 가격",
          body: prices,
          tip: "무료로 볼 수 있는 부분과 환불 기준은 가격 안내와 환불 정책에 먼저 적어 둬요.",
          link: { href: "/pricing", label: "가격 안내 보기" },
        },
      ],
    },
  ];
}
