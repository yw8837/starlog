import { SITE, won } from "./config";
import { faqGroups } from "./faq";
import { GUIDE_ARTICLES, GUIDE_CATEGORIES, GUIDE_CATEGORY_LABEL, articlesIn, guideIndexPath, guideSectionText, type GuideArticle } from "./guide";
import { times } from "./helpGuide";
import { absoluteUrl } from "./hosts";
import { INFO_PAGES } from "./infoPages";
import { SITE_SUMMARY } from "./jsonld";
import { withParticle } from "./korean";

/**
 * /llms.txt and /llms-full.txt (llmstxt.org): what 스타로그 is, in plain citable statements, and where
 * each topic lives. Built from the same data as the pages (SITE, the guide, the FAQ), so a price or
 * a free count changes here when it changes there. Never names the model or vendor behind readings.
 */

type Site = typeof SITE;

const link = (label: string, path: string, note: string) => `- [${label}](${absoluteUrl(path)}): ${note}`;

/** Short statements a language model can quote as they are. */
export function serviceFacts(site: Site = SITE): string[] {
  const { nameKo, name, business, price, beta } = site;
  return [
    `${nameKo}(${name})는 ${withParticle(business.name, "이/가")} 만들고 운영하는 한국어 타로·사주 웹 서비스예요. 주소는 ${site.url} 이에요.`,
    "로그인 없이 써요. 연 풀이와 입력한 정보는 지금 쓰는 기기의 브라우저에 보관되고, 서버에는 풀이 기록을 쌓지 않아요.",
    "타로 보기: 누구의 일인지, 무엇이 궁금한지, 언제까지인지 골라 질문을 만들고 카드 3장을 뽑아요. 고른 주제(연락, 연애, 직업·이직, 이사·선택 등)에 따라 세 자리가 정해져 있어요.",
    "타로 카드는 1909년 라이더-웨이트-스미스 덱의 원판 그림 78장을 써요. 카드마다 그림에 실제로 그려진 것을 정리해 두고, 그 사실을 풀이의 바탕으로 삼아요.",
    "사주 보기: 태어난 날과 시, 태어난 곳으로 만세력에 따라 네 기둥(여덟 글자)을 세우고, 타고난 결과 지금 지나는 10년(대운)의 흐름을 읽어요.",
    "사주 계산 기준: 연주는 입춘, 월주는 절기로 바뀌고, 일주와 시주는 태어난 곳의 경도로 보정한 시각으로 정해요(지금의 표준시로 서울은 약 32분을 빼요). 밤 11시부터 자정 사이는 일주를 그날로 두고 시주만 다음 날 기준으로 봐요. 태어난 시를 모르면 시주를 비워 두고 여섯 글자로 읽어요.",
    "풀이가 만들어지는 방식: 명식 계산과 카드 그림의 사실을 먼저 세우고, 그 위에서 AI가 내 질문에 맞춰 해요체로 풀이를 써요. 보여 드리기 전에 그림이나 명식에 없는 이야기, 결과를 약속하는 말이 있는지 한 번 더 살피고, 기준에 맞지 않으면 다시 쓰거나 보여 드리지 않아요.",
    "지금의 한 장: 고민 하나를 떠올리고 카드 한 장을 고르면 한 문장의 답과 그 이유, 오늘 해 볼 일이 나와요. 78장의 정방향·역방향마다 미리 써 둔 문장 가운데 하나를 보여 주고, 횟수 제한 없이 무료예요.",
    "오늘의 한 장: 하루에 한 번, 섞은 카드 세 장 가운데 한 장을 골라 오늘의 운세(오늘의 한마디, 애정·금전·일, 오늘의 색과 숫자)를 봐요. 무료예요.",
    ...(site.features.bonds
      ? ["별자리 인연: 친구들이 별이 되어 내 별자리를 채우고, 사주로 본 인연 점수로 열두 별자리 랭킹에 올라요. 이번 주 행운 번호는 생년월일의 오행과 이번 주 카드로 고른 번호 6개를 재미로 보여 줘요."]
      : []),
    `가격: 타로 전체 풀이 ${won(price.tarotStandardKrw)}, 사주 프롤로그 ${won(price.sajuStandardKrw)}이에요. 오픈 기념으로 타로와 사주 전체 풀이를 합쳐 하루 ${times(beta.fullPerDay)} 무료로 열 수 있고, 한국 시간 0시에 다시 채워져요.${site.features.payments ? "" : " 결제 기능은 준비 중이에요."}`,
    `전체 풀이를 연 뒤에는 같은 풀이를 두고 이어서 물어보기를 ${site.reading.followUps}번 할 수 있어요.`,
    "하지 않는 것: 합격, 재회, 수익 같은 결과를 약속하지 않아요. 다른 사람의 마음을 사실처럼 말하지 않고, 병이나 수명, 사고를 점치지 않아요. 풀이는 재미와 자기 성찰을 위한 참고용이고, 의료·법률·투자처럼 중요한 결정은 전문가와 상의하도록 안내해요.",
  ];
}

const articleLine = (article: GuideArticle) => link(article.title, `/guide/${article.slug}`, article.description);

/** llms.txt: the summary, the facts, and links to every public page and guide article. */
export function llmsTxt(site: Site = SITE): string {
  const pages = [
    link("타로 보기", "/tarot/new", "질문을 만들고 카드 3장을 뽑아 내 상황에 맞춘 타로 풀이를 봐요."),
    link("사주 보기", "/saju/new", "태어난 날과 시, 태어난 곳으로 만세력 명식을 세우고 풀이를 봐요."),
    link("지금의 한 장", "/now", "고민 하나에 카드 한 장으로 짧은 답을 듣는 무료 원카드 타로예요."),
    link("오늘의 한 장", "/today", "하루 한 번 카드 한 장으로 오늘의 운세를 보는 무료 메뉴예요."),
    ...(site.features.bonds
      ? [
          link("이번 주 행운 번호", "/lucky", "생년월일의 오행과 이번 주 카드로 고른 번호 6개예요."),
          link("별자리 인연 랭킹", "/ranking", "열두 별자리의 인연 점수 순위예요."),
        ]
      : []),
    link(INFO_PAGES.about.title, INFO_PAGES.about.path, "서비스 소개, 두 안내자, 하지 않는 것, 운영사."),
    link(INFO_PAGES.how.title, INFO_PAGES.how.path, "계산, 풀이, 검수, 보관 순서와 어디까지 믿으면 되는지."),
    link(INFO_PAGES.evidence.title, INFO_PAGES.evidence.path, "타로 원전·Book T·현대 해석 대조, 사주 음력·절입 시각 검증의 출처와 숫자."),
    link(INFO_PAGES.help.title, INFO_PAGES.help.path, "기능별 쓰는 법."),
    link(INFO_PAGES.faq.title, INFO_PAGES.faq.path, "무료 범위, 저장, 결제 전 많이 묻는 질문."),
    link("가격 안내", "/pricing", "풀이 가격, 무료로 볼 수 있는 부분, 준비 중인 풀이."),
  ];
  const guides = GUIDE_CATEGORIES.flatMap((category) => [
    "",
    `## ${GUIDE_CATEGORY_LABEL[category]} 가이드`,
    "",
    link(`${GUIDE_CATEGORY_LABEL[category]} 가이드 목록`, guideIndexPath(category), "이 분류의 글 전체 목록이에요."),
    ...articlesIn(category).map(articleLine),
  ]);
  return [
    `# ${site.nameKo} (${site.name})`,
    "",
    `> ${SITE_SUMMARY}`,
    "",
    ...serviceFacts(site).map((fact) => `- ${fact}`),
    "",
    "## 주요 페이지",
    "",
    ...pages,
    ...guides,
    "",
    "## Optional",
    "",
    link("전체 글 모음", "/llms-full.txt", "서비스 설명, 가이드 글 전문, 자주 묻는 질문을 한 파일에 모았어요."),
    link("이용약관", "/terms", "서비스 이용 조건."),
    link("개인정보처리방침", "/privacy", "처리하는 개인정보와 보관 기간."),
    link("환불 정책", "/refund", "청약철회와 환불 기준."),
    "",
  ].join("\n");
}

/** One guide article in full: the 요약 and 한눈에 보기 first, then every section with its blocks' text. */
function articleText(article: GuideArticle): string {
  return [
    `### ${article.title}`,
    "",
    `주소: ${absoluteUrl(`/guide/${article.slug}`)}${article.updated ? ` (업데이트 ${article.updated})` : ""}`,
    "",
    ...(article.summary ? [`요약: ${article.summary}`, ""] : []),
    ...(article.keyPoints?.length ? ["한눈에 보기:", ...article.keyPoints.map((point) => `- ${point}`), ""] : []),
    ...article.sections.flatMap((section) => [`#### ${section.heading}`, "", guideSectionText(section), ""]),
  ].join("\n");
}

/** llms-full.txt: the facts, every guide article in full and the FAQ, as plain Markdown. */
export function llmsFullTxt(site: Site = SITE): string {
  const faq = faqGroups({ site }).flatMap((group) => [
    `### ${group.label}`,
    "",
    ...group.entries.flatMap((entry) => [`#### ${entry.q}`, "", ...entry.a, ""]),
  ]);
  return [
    `# ${site.nameKo} (${site.name}) 전체 글 모음`,
    "",
    `> ${SITE_SUMMARY}`,
    "",
    "## 서비스 사실",
    "",
    ...serviceFacts(site).map((fact) => `- ${fact}`),
    "",
    "## 가이드 글",
    "",
    ...GUIDE_ARTICLES.map(articleText),
    "## 자주 묻는 질문",
    "",
    ...faq,
  ].join("\n");
}
