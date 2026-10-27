import { getCard } from "@starlog/core";
import { SITE } from "@/lib/config";
import { PREMIUM, premiumShareHref } from "@/lib/premium/products";
import { topicLabel } from "@/lib/sajuTopics";
import { HIDDEN, type SharePayload } from "./payload";

/**
 * What a share says beside its link (owner 2026-10-23: "결과공유하면 텍스트만 날라간다"): the Kakao feed message's
 * title, description and second button, the phone share sheet's text, and the /s page's og:title and og:description.
 * Built on the server from the stored payload, which is already cleaned (lib/share/payload.ts: no question, no typed
 * words, no names, no birth), and a sentence that still holds a hidden word (○○) is never used.
 */
export interface SharePreview {
  title: string;
  description: string;
  /** The Kakao message's second button: the visitor's own try. */
  try: { label: string; path: string };
}

/** What a 별자리 인연 link shows, read live from the bonds store (app/s/[id]/bondsShare.ts). */
export type BondsPreviewData =
  /**
   * `members[].score`, `total` and `average`: only where the constellation's scores show (lib/bonds/share.ts).
   */
  | {
      kind: "bonds"; signKo: string; ownerNickname: string; stars: number; slots: number; total: number | null; average: number | null; complete: boolean;
      members: Array<{ nickname: string; score: number | null }>;
    }
  | { kind: "bond"; signKo: string; ownerNickname: string; friendNickname: string; score: number };

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 90;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * As many whole items as fit in `max` with `suffix`, the rest counted ("하늘 · 인연 87점, 바다 · 인연 69점 외 2명 · 평균 78점"):
 * never cut inside an item, so no score is left half shown (review 2026-10-23).
 */
export function fitList(items: readonly string[], separator: string, max: number, suffix = ""): string {
  for (let fit = items.length; fit > 0; fit--) {
    const rest = items.length - fit;
    const text = `${items.slice(0, fit).join(separator)}${rest ? ` 외 ${rest}명` : ""}${suffix}`;
    if (text.length <= max) return text;
  }
  return `친구 ${items.length}명${suffix}`;
}

/** Plain words: no bold marks, one line. */
const plain = (text: string) => text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

/** The first sentence, or "" when there is none or it still holds a hidden word. */
export function firstSentence(text: string | undefined): string {
  const sentence = plain(text ?? "").split(/(?<=[.?!…]|요\.|다\.)\s+/)[0] ?? "";
  return sentence.includes(HIDDEN) ? "" : sentence;
}

const cardName = (card: { cardId: string; orientation: string }) => `${getCard(card.cardId).names.ko}${card.orientation === "reversed" ? "(역)" : ""}`;

/** "제목 · 한 줄", or the title alone when there is no line to add. */
const titled = (head: string, line: string) => clip(line ? `${head} · ${line}` : head, TITLE_MAX);

export function sharePreview(share: SharePayload, live?: BondsPreviewData | null): SharePreview {
  const tarotTry = { label: "나도 뽑아 보기", path: "/tarot/start" };
  switch (share.kind) {
    case "tarot":
      return {
        title: titled(share.cards.map(cardName).join(" · "), firstSentence(share.reading.verdict)),
        description: clip(firstSentence(share.reading.cards[0]?.body) || "뽑은 카드와 풀이 전체를 볼 수 있어요.", DESCRIPTION_MAX),
        try: tarotTry,
      };
    case "tarot-free":
      return {
        title: titled(share.cards.map(cardName).join(" · "), firstSentence(share.first.heading)),
        description: clip(firstSentence(share.first.body) || "뽑은 카드와 무료로 본 첫 풀이를 볼 수 있어요.", DESCRIPTION_MAX),
        try: tarotTry,
      };
    case "saju": {
      const label = `${topicLabel(share.topic ?? "overall")} 풀이`;
      const line = firstSentence(share.reading.glance?.thisYear) || firstSentence(share.reading.sections[0]?.body);
      return {
        title: titled(`친구의 ${label}`, firstSentence(share.reading.glance?.goesWell)),
        description: clip(line || `${SITE.nameKo}에서 만세력으로 본 사주 풀이예요.`, DESCRIPTION_MAX),
        try: { label: "나도 사주 보기", path: "/saju/start" },
      };
    }
    case "saju-free":
      return {
        title: titled(`친구의 ${share.topic ? topicLabel(share.topic) : "사주"} 맛보기`, firstSentence(share.title)),
        description: clip(firstSentence(share.summary) || "사주 맛보기의 제목과 요약을 볼 수 있어요.", DESCRIPTION_MAX),
        try: { label: "나도 사주 보기", path: "/saju/start" },
      };
    case "daily":
      return {
        title: titled(`오늘의 한 장 · ${cardName(share.reading.card)}`, firstSentence(share.reading.summary)),
        description: clip(firstSentence(share.reading.body) || "오늘 뽑은 카드와 풀이를 볼 수 있어요.", DESCRIPTION_MAX),
        try: { label: "나도 뽑아 보기", path: "/today" },
      };
    case "now":
      return {
        title: titled(`지금의 한 장 · ${cardName(share.card)}`, firstSentence(share.answer)),
        description: clip(firstSentence(share.why) || "카드가 건넨 한 문장과 그렇게 읽은 이유를 볼 수 있어요.", DESCRIPTION_MAX),
        try: { label: "나도 뽑아 보기", path: "/now" },
      };
    case "premium": {
      const product = PREMIUM[share.product];
      return {
        title: clip(share.title ? `${product.name} · 2027년, ${share.title}` : `친구가 연 ${product.name}`, TITLE_MAX),
        description: clip(share.cards?.length ? `${share.cards.map(cardName).slice(0, 3).join(" · ")} 외 ${Math.max(0, share.cards.length - 3)}장 · ${product.sub}` : product.sub, DESCRIPTION_MAX),
        // The product page, or the home where premium is not offered (premiumShareHref), never a 404.
        try: { label: "나도 보기", path: premiumShareHref(share.product) },
      };
    }
    case "bonds":
    case "bond": {
      const build = { label: "내 별자리 만들기", path: "/bonds" };
      if (live?.kind === "bonds") {
        // Each friend's score where the scores show ("하늘 · 인연 87점, 바다 · 인연 69점"), whole stars only.
        const head = `${live.ownerNickname}님의 ${live.signKo}${live.complete ? " 완성" : ""}`;
        const shown = live.members.some((m) => m.score !== null);
        const items = live.members.map((m) => (m.score === null ? m.nickname : `${m.nickname} · 인연 ${m.score}점`));
        return {
          title: clip(live.total !== null ? `${head} · 인연 ${live.total}점` : `${head} · 별 ${live.stars}/${live.slots}`, TITLE_MAX),
          description: shown
            ? fitList(items, ", ", DESCRIPTION_MAX, live.average === null ? "" : ` · 평균 ${live.average}점`)
            : clip(`친구 ${live.stars}명이 별이 되어 ${live.slots}칸 가운데 ${live.stars}칸을 채웠어요`, DESCRIPTION_MAX),
          try: build,
        };
      }
      if (live?.kind === "bond") {
        return {
          title: clip(`${live.friendNickname}님과 ${live.ownerNickname}님의 인연 ${live.score}점`, TITLE_MAX),
          description: clip(`${live.ownerNickname}님의 ${live.signKo}에 별이 되었어요.`, DESCRIPTION_MAX),
          try: build,
        };
      }
      return { title: "친구의 별자리 인연", description: `${SITE.nameKo} 별자리 인연이에요. 나도 친구들과 별자리를 채워 볼 수 있어요.`, try: build };
    }
  }
}
