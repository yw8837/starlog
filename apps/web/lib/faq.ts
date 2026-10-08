import { adsConfig } from "./ads";
import { SITE } from "./config";
import { approxCharsText } from "./pricing";
import { times } from "./helpGuide";
import { crisisLines } from "./crisis";
import { INFO_PAGES } from "./infoPages";
import { contactChannels } from "./legal";
import { REFUND_DAYS } from "./pay/catalog";

/**
 * 자주 묻는 질문 (/faq). Answers are plain text so the page and its FAQPage JSON-LD say exactly the
 * same thing; every number comes from SITE, and every policy statement matches /privacy, /terms and
 * /refund. Pre-payment doubts first (reference study: docs/research/site-ia-references-2026-10-01.md).
 */

export interface FaqEntry {
  id: string;
  q: string;
  /** Paragraphs, plain text. */
  a: string[];
  link?: { href: string; label: string };
  /** Ends with the helplines (components/ui/CrisisContacts). */
  crisis?: boolean;
}

export interface FaqGroup {
  id: string;
  label: string;
  entries: FaqEntry[];
}

type FaqOptions = { site?: typeof SITE; ads?: boolean };

export function faqGroups({ site = SITE, ads = adsConfig() !== null }: FaqOptions = {}): FaqGroup[] {
  const { nameKo } = site;
  const { fullPerDay, teaserPerDay } = site.beta;
  const { approxChars } = site.reading;
  const contacts = contactChannels(site.business);
  const email = contacts.find(([label]) => label === "이메일")?.[1];
  const phone = contacts.find(([label]) => label === "전화")?.[1];

  return [
    {
      id: "start",
      label: "시작하기",
      entries: [
        // The four trust answers (owner copy, 2026-10-06). 78장, 1만 4천여 건 (14,539 birth inputs, 9,743 distinct dates) and 1분 are facts of the deck
        // (content/kb/README.md) and of docs/research/saju-calendar-crosscheck-2026-10.md, not SITE settings.
        {
          id: "how-made",
          q: "풀이는 어떻게 만들어지나요?",
          a: [
            "타로는 원본 카드와 공식 해설서, 요즘 해석을 바탕으로 78장을 한 장씩 정리한 카드 데이터로 읽어요. 사주는 만세력으로 명식을 계산해요. 풀이 문장은 AI가 이 근거 안에서만 내 질문과 상황에 맞춰 쓰고, 내보내기 전에 정해 둔 규칙으로 한 번 더 검사해요.",
          ],
          link: { href: INFO_PAGES.evidence.path, label: INFO_PAGES.evidence.title },
        },
        {
          id: "birth-saved",
          q: "내 생년월일은 어디에 저장되나요?",
          a: [
            [
              "생년월일은 이 기기(브라우저)에만 저장되고, 내 정보에서 언제든 지울 수 있어요.",
              site.features.bonds ? "별자리 인연에 넣은 친구의 생년월일은 점수를 계산할 때만 쓰고 저장하지 않아요." : "",
              "비밀번호는 받지 않아요.",
            ]
              .filter(Boolean)
              .join(" "),
          ],
        },
        {
          id: "saju-calc",
          q: "사주 계산은 믿을 수 있나요?",
          a: [
            "해와 달이 바뀌는 기준은 달력의 1일이 아니라 절기라서, 절기가 바뀌는 시각까지 계산해요. 출생 정보 1만 4천여 건을 다른 만세력 계산과 대조했고, 절기 시각은 독립적인 천문 계산과 따로 비교해 1분 안으로 맞는 것을 확인했어요. 절기가 바뀌는 시각 바로 앞뒤에 태어났다면 그 사실도 알려 드려요.",
          ],
          link: { href: `${INFO_PAGES.evidence.path}#saju`, label: "사주 계산의 근거" },
        },
        {
          id: "no-guarantee",
          q: "결과를 장담하나요?",
          a: [
            '아니요. "다시 만나요", "합격해요" 같은 장담이나 "그 사람도 같은 마음이에요" 같은 남의 마음 단정, 건강·투자 판단은 하지 않아요. 대신 지금의 흐름과 내가 해 볼 수 있는 것을 이야기해요.',
          ],
        },
        {
          id: "free",
          q: `${nameKo}는 무료인가요?`,
          a: [
            `오픈 기념으로 타로와 사주 전체 풀이를 합쳐 하루 ${times(fullPerDay)} 무료로 열어 드려요. 먼저 읽는 첫 풀이는 하루 ${times(teaserPerDay)}까지 열 수 있고, 모두 한국 시간 0시에 다시 채워져요.`,
            "지금의 한 장은 횟수 제한 없이, 오늘의 한 장은 하루 한 번 무료예요. 풀이 가격은 가격 안내에서 볼 수 있어요.",
          ],
          link: { href: "/pricing", label: "가격 안내" },
        },
        {
          id: "login",
          q: "가입하거나 로그인해야 하나요?",
          a: ["아니요. 지금은 로그인 없이 모든 기능을 쓸 수 있어요. 연 풀이는 지금 쓰는 기기의 브라우저에 보관돼요."],
        },
        {
          id: "birth-time",
          q: "태어난 시간을 몰라도 사주를 볼 수 있나요?",
          a: [
            "네. 태어난 시에서 ‘몰라요’를 고르면 시주를 비워 두고 나머지 여섯 글자로 풀이해요. 시간을 짐작해서 채우지 않아요.",
            "그래서 자녀나 말년처럼 시주가 맡는 이야기와 정밀한 시기는 다루지 않아요. 태어난 시각에 따라 기둥이 달라질 수 있는 날이라면 명식 아래 적용한 기준에서 알려 드려요.",
          ],
        },
        {
          // Owner-approved 2026-10-07 (docs/research/manseryeok-references-2026-10.md §7-5): the rules saju-policy@2 applies.
          // 2026-10-08 review: the hour comes off only inside a DST period; UTC+8:30 eras move Seoul by about 2 minutes.
          id: "saju-differs",
          q: "다른 앱과 사주(명식)가 다르게 나와요",
          a: [
            "만세력마다 태어난 시각을 다루는 기준이 조금씩 달라서 그래요. 스타로그가 따르는 기준은 이래요.",
            "1948~51년, 1955~60년, 1987~88년에는 해마다 몇 달씩 서머타임이 있었어요. 그 기간에 태어났다면 시계를 앞당긴 1시간을 빼고 계산해요. 한국 시계는 실제 해의 움직임보다 30분쯤 앞서 있어서, 태어난 곳의 경도만큼 시각도 보정하죠. 서울에서 태어났다면 32분쯤 당겨져요. 다만 표준시가 지금보다 30분 늦던 1908년 4월~1911년, 1954년 3월 21일~1961년 8월 9일에 태어났다면 서울도 2분쯤만 당겨져요.",
            "밤 11시대에 태어났다면 일주는 그날로 두고 시주만 다음 날 기준으로 봐요. 밤 11시에 날을 바꾸는 앱과는 일주가 하루 달라지는데, 그런 날은 다른 기준의 일주도 함께 적어 둬요.",
            "달이 바뀌는 절기도 날짜가 아니라 분 단위 시각까지 맞춰 봐요. 절기가 든 날에 태어났다면 몇 시 몇 분이냐에 따라 월주가 갈리거든요.",
            "명식 아래 ‘적용한 기준’을 열면 보정 시각과 이 명식에 적용한 규칙이 그대로 나와요. 다른 앱과 다른 기둥이 있다면 거기서 어느 기준이 달랐는지 맞춰 볼 수 있어요.",
          ],
          link: { href: `${INFO_PAGES.evidence.path}#saju`, label: "사주 계산의 근거" },
        },
      ],
    },
    {
      id: "reading",
      label: "풀이",
      entries: [
        {
          id: "preview",
          q: "풀이를 열기 전에 무엇을 볼 수 있나요?",
          a: [
            `타로는 뽑은 카드 세 장과 첫 풀이를 먼저 무료로 읽어요. 이어지는 풀이의 소제목과 분량(약 ${approxCharsText(approxChars.tarot)}자)도 미리 보여 드려요.`,
            `사주는 명식(네 기둥, 오행, 일간)과 첫 장 요약을 먼저 봐요. 전체 풀이는 약 ${approxCharsText(approxChars.saju)}자예요. 무엇이 담기는지 보고 나서 열지 정하면 돼요.`,
          ],
        },
        {
          id: "chatgpt",
          q: "AI 챗봇에 직접 묻는 것과 뭐가 달라요?",
          a: [
            `${nameKo}는 직접 만든 만세력 계산과 카드 지식 위에서 AI가 내 질문에 맞춰 풀어요.`,
            "사주 명식은 AI에게 맡기지 않고 계산으로 먼저 세워요. 타로는 1909년 원판 그림에 실제로 그려진 것을 근거로 삼아요. 다 쓴 풀이는 한 번 더 살핀 뒤에 보여 드려요.",
            "어느 쪽이 더 잘 맞는지 숫자로 비교한 적은 없어서, 정확도 수치는 적지 않았어요.",
          ],
          link: { href: "/how", label: "풀이가 만들어지는 과정" },
        },
        {
          id: "same-question",
          q: "같은 질문이면 풀이가 매번 다른가요?",
          a: [
            "한 번 연 풀이는 이 기기에 저장돼서 다시 열면 같은 글이 나와요. 사주 명식도 출생 정보가 같으면 언제 계산해도 같아요.",
            "새로 카드를 뽑거나 새 풀이를 열면 AI가 새로 쓰기 때문에 표현과 초점이 달라질 수 있어요. 같은 질문으로 여러 번 뽑기보다 이어서 물어보기로 궁금한 점을 좁혀 보길 권해요.",
          ],
        },
        {
          id: "trust",
          q: "AI가 쓴 풀이를 믿어도 되나요?",
          a: [
            "풀이는 AI가 만든 글이고, 재미와 자기 성찰을 위한 참고용이에요. 틀리거나 내 상황과 맞지 않는 내용이 들어 있을 수 있어요.",
            "합격, 재회, 수익 같은 결과를 약속하지 않고, 다른 사람의 마음을 사실처럼 말하지 않아요. 의료, 법률, 투자, 진로처럼 중요한 결정은 그 분야 전문가와 꼭 상의해 주세요.",
          ],
          crisis: true,
        },
      ],
    },
    {
      id: "privacy",
      label: "기록과 개인정보",
      entries: [
        {
          id: "stored",
          q: "생년월일과 질문이 서버에 저장되나요?",
          a: [
            `${nameKo} 서버에는 저장하지 않아요. 풀이를 만드는 동안 질문, 고른 상황, 메모, 출생 정보를 암호화된 연결로 미국의 AI 서비스 사업자에게 보내고, 풀이가 끝나면 서버에서 바로 지워요. 그 사업자 쪽 보관 기간과 국외 이전은 개인정보처리방침에 적어 두었어요.`,
            "입력한 내용과 연 풀이는 이 기기의 브라우저에 남아요.",
          ],
          link: { href: "/privacy", label: "개인정보처리방침" },
        },
        {
          id: "records",
          q: "기록은 어디에 남나요? 다른 기기에서도 볼 수 있나요?",
          a: [
            "지금 쓰는 기기의 브라우저에 남아요. 로그인이 없어서 다른 기기나 다른 브라우저에서는 보이지 않아요.",
            "브라우저의 사이트 데이터를 지우면 기록도 함께 지워지고, 내 정보에서 한 번에 지울 수도 있어요. 지운 기록은 되돌릴 수 없어요.",
          ],
        },
        {
          id: "others",
          q: "다른 사람의 사주나 관계도 볼 수 있나요?",
          a: [
            "그 사람이 동의했다면 괜찮아요. 동의 없이 다른 사람의 생년월일이나 연락처를 적는 일은 이용약관에서 막고 있어요.",
            "관계를 묻는 타로는 상대의 마음을 대신 말해 주지 않아요. 두 사람 사이에서 내가 볼 수 있는 흐름과 내가 해 볼 일을 읽어 드려요.",
          ],
        },
      ],
    },
    {
      id: "service",
      label: "환불과 이용",
      entries: [
        {
          id: "refund",
          q: "환불은 어떻게 되나요?",
          a: [
            "오픈 기념 무료 풀이는 결제가 없어 환불할 일이 생기지 않아요. 풀이가 제대로 만들어지지 않으면 오늘 열 수 있는 횟수도 줄지 않아요.",
            `유료 풀이는 열기 전이면 결제일로부터 ${REFUND_DAYS}일 안에 전액 환불받을 수 있어요. 풀이가 만들어지지 않았거나 오류로 끝까지 나오지 않았다면 기간과 상관없이 결제한 풀이를 다시 열거나 결제 금액을 환불받을 수 있어요. 가입 선물로 열던 풀이라면 가입 선물을 그대로 돌려 드려요.`,
          ],
          link: { href: "/refund", label: "환불 정책" },
        },
        {
          id: "minors",
          q: "미성년자도 이용할 수 있나요?",
          a: [
            `만 14세 이상이면 이용할 수 있어요. 만 14세 미만은 ${nameKo}를 이용할 수 없고, 그 개인정보를 받지 않아요.`,
            "만 19세 미만이 법정대리인 동의 없이 결제했다면, 본인이나 법정대리인이 결제를 취소할 수 있어요.",
          ],
        },
        {
          id: "ads",
          q: "광고가 있나요?",
          a: ads
            ? [
                "가이드 글 페이지에만 광고가 실려요. 타로와 사주 풀이, 내 기록 화면에는 광고를 싣지 않아요.",
                "가이드 글의 광고는 Google이 쿠키를 써서 보여 줘요. 맞춤 광고를 끄는 방법은 개인정보처리방침에 적어 두었어요.",
              ]
            : ["지금은 광고가 없어요. 광고를 싣게 되면 가이드 글 페이지에만 싣고, 타로와 사주 풀이, 내 기록 화면에는 싣지 않아요."],
        },
        {
          id: "contact",
          q: "문의는 어디로 하나요?",
          a:
            email || phone
              ? [
                  [email ? `메일은 ${email}로 보내 주세요.` : "", phone ? `전화는 ${phone}로 받아요.` : ""].filter(Boolean).join(" "),
                  "풀이 오류, 개인정보, 이용 문의 모두 받아요.",
                ]
              : ["문의 연락처는 결제가 열리기 전에 이 자리에 안내해 드려요."],
        },
      ],
    },
  ];
}

/** schema.org FAQPage for the same entries, answers as plain text. */
export function faqJsonLd(groups: FaqGroup[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((group) =>
      group.entries.map((entry) => ({
        "@type": "Question",
        name: entry.q,
        acceptedAnswer: { "@type": "Answer", text: [...entry.a, ...(entry.crisis ? crisisLines() : [])].join(" ") },
      })),
    ),
  };
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so no text can close the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
