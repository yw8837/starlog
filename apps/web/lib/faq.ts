import { adsConfig } from "./ads";
import { SITE } from "./config";
import { times } from "./helpGuide";
import { contactChannels } from "./legal";

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
}

export interface FaqGroup {
  id: string;
  label: string;
  entries: FaqEntry[];
}

const num = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

type FaqOptions = { site?: typeof SITE; ads?: boolean };

export function faqGroups({ site = SITE, ads = adsConfig() !== null }: FaqOptions = {}): FaqGroup[] {
  const { nameKo } = site;
  const { paid, free } = site.currency;
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
        {
          id: "free",
          q: `${nameKo}는 무료인가요?`,
          a: [
            `베타 기간에는 모든 풀이가 무료예요. 타로와 사주 전체 풀이는 합쳐서 하루 ${times(fullPerDay)}, 먼저 읽는 첫 풀이는 하루 ${times(teaserPerDay)}까지 열 수 있고, 한국 시간 0시에 다시 채워져요.`,
            "지금의 한 장은 횟수 제한 없이, 오늘의 한 장은 하루 한 번 무료예요. 결제는 아직 열리지 않았고, 열리기 전에 가격 안내에 먼저 알려 드려요.",
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
            `타로는 뽑은 카드 세 장과 첫 풀이를 먼저 무료로 읽어요. 이어지는 풀이의 소제목과 분량(약 ${num(approxChars.tarot)}자)도 미리 보여 드려요.`,
            `사주는 명식(네 기둥, 오행, 일간)과 첫 장 요약을 먼저 봐요. 전체 풀이는 약 ${num(approxChars.saju)}자예요. 무엇이 담기는지 보고 나서 열지 정하면 돼요.`,
          ],
        },
        {
          id: "chatgpt",
          q: "ChatGPT에 직접 묻는 것과 뭐가 달라요?",
          a: [
            `${nameKo} 풀이도 AI가 써요. 다른 점은 글을 쓰기 전과 쓴 뒤에 하는 일이에요.`,
            "사주 명식은 AI에게 맡기지 않고 만세력 계산 엔진이 먼저 세워요. 타로는 1909년 원판 그림에서 확인한 사실을 카드마다 정리해 두고, 그 사실을 근거로 넘겨요. 다 쓴 풀이는 지어낸 그림이나 질문에서 벗어난 이야기, 결과를 약속하는 말이 없는지 자동으로 검사한 뒤에 보여 드려요.",
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
            `${nameKo} 서버에는 저장하지 않아요. 풀이를 만드는 동안 질문, 고른 상황, 메모, 출생 정보를 암호화된 연결로 AI 사업자 Anthropic(미국)에 보내고, 풀이가 끝나면 서버에서 바로 지워요. Anthropic 쪽 보관 기간은 그 회사의 정책을 따라요.`,
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
            "베타 기간에는 결제가 없어서 환불할 일이 생기지 않아요. 풀이가 제대로 만들어지지 않으면 오늘 열 수 있는 횟수도 줄지 않아요.",
            `결제가 열린 뒤에는 풀이를 열기 전이면 전액 취소할 수 있어요. 풀이가 만들어지지 않았거나 오류로 끝까지 나오지 않았다면 쓴 ${paid}·${free}을 되돌리거나 결제 금액을 환불해 드려요. 충전한 ${paid}은 7일 안에 하나도 쓰지 않았다면 전액, 일부를 썼다면 남은 만큼 환불해요.`,
          ],
          link: { href: "/refund", label: "환불 정책" },
        },
        {
          id: "minors",
          q: "미성년자도 이용할 수 있나요?",
          a: [
            `만 14세 이상이면 이용할 수 있어요. 만 14세 미만은 ${nameKo}를 이용할 수 없고, 그 개인정보를 받지 않아요.`,
            "결제가 열린 뒤 만 19세 미만이 법정대리인 동의 없이 결제했다면, 본인이나 법정대리인이 결제를 취소할 수 있어요.",
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
        acceptedAnswer: { "@type": "Answer", text: entry.a.join(" ") },
      })),
    ),
  };
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so no text can close the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
