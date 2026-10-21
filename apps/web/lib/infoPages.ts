import { SITE } from "./config";
import { guideIndexPath } from "./guideMeta";

/**
 * The public pages that explain the service (reference study: docs/research/site-ia-references-2026-10-01.md).
 * One source for the footer labels, each page's metadata, and the sitemap test.
 */
export const INFO_PAGES = {
  about: {
    path: "/about",
    label: `${SITE.nameKo}란?`,
    title: `${SITE.nameKo}란?`,
    description: `${SITE.nameKo}는 지금 내 상황에 맞춘 타로와 사주 풀이를 보는 곳이에요. 타로는 고양이 점성술사 타로로가, 사주는 한복 입은 토끼 선생님 사주주가 읽어 줘요.`,
  },
  how: {
    path: "/how",
    label: "풀이는 이렇게 만들어져요",
    title: "풀이는 이렇게 만들어져요",
    description:
      "사주 명식은 만세력 계산으로 먼저 세우고, 타로는 원판 그림에 실제로 그려진 것을 근거로 삼아요. 그 위에서 AI가 내 질문에 맞춰 풀고, 보여 드리기 전에 한 번 더 살펴요.",
  },
  evidence: {
    path: "/evidence",
    label: `${SITE.nameKo}의 근거`,
    title: `${SITE.nameKo}의 근거`,
    description: `${SITE.nameKo}의 타로와 사주가 무엇에 기대는지 출처와 숫자로 모았어요. 1909년 원판 그림과 웨이트 원전, 한국천문연구원 음력, NASA JPL 절입 시각 검증까지 적었어요.`,
  },
  help: {
    path: "/help",
    label: "이용 가이드",
    title: "이용 가이드",
    description: `타로 보기와 사주 보기, 지금의 한 장, 오늘의 한 장, 이어서 물어보기, 내 기록과 공유까지. ${SITE.nameKo} 기능을 하나씩 펼쳐 보는 이용 가이드예요.`,
  },
  faq: {
    path: "/faq",
    label: "자주 묻는 질문",
    title: "자주 묻는 질문",
    description: `무료인지, 열기 전에 무엇을 볼 수 있는지, AI 챗봇과 무엇이 다른지, 입력한 정보가 저장되는지. ${SITE.nameKo}를 처음 쓰기 전에 많이 묻는 질문을 모았어요.`,
  },
} as const;

export type InfoPageId = keyof typeof INFO_PAGES;

/**
 * Footer's first row, in order: what the service is, how it works and what it rests on, how to use
 * it, then the guide articles (straight to the first tab, as the tab bar does; `/guide` itself only
 * redirects there).
 */
export const SERVICE_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: INFO_PAGES.about.path, label: INFO_PAGES.about.label },
  { href: INFO_PAGES.how.path, label: INFO_PAGES.how.label },
  { href: INFO_PAGES.evidence.path, label: INFO_PAGES.evidence.label },
  { href: INFO_PAGES.help.path, label: INFO_PAGES.help.label },
  { href: INFO_PAGES.faq.path, label: INFO_PAGES.faq.label },
  { href: guideIndexPath("tarot"), label: "가이드 글" },
];
