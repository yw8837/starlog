import { getCard, getConstellation } from "@starlog/core";
import type { BondsShareView } from "@/lib/bonds/share";
import { SITE } from "@/lib/config";
import type { ShareOgData } from "@/lib/og/cardsImage";
import { PREMIUM } from "@/lib/premium/products";
import { topicLabel } from "@/lib/sajuTopics";
import type { SharePayload } from "./payload";
import { firstSentence, fitList } from "./preview";

/** The longest saju conclusion the preview prints (about three lines). */
const BODY_MAX = 72;

const clip = (text: string) => (text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text);

/** What the link preview of a shared reading shows: the cards drawn (오늘의 한 장: its card and line), or the saju's short conclusion. */
export function shareOgData(share: SharePayload, origin: string, live: BondsShareView | null = null): ShareOgData {
  const host = new URL(SITE.url).host;
  const face = (deck: string, card: { cardId: string; orientation: string }) => ({ cardId: card.cardId, src: `${origin}/cards/og/${deck}/${card.cardId}.jpg`, reversed: card.orientation === "reversed" });
  const name = (card: { cardId: string; orientation: string }) => `${getCard(card.cardId).names.ko}${card.orientation === "reversed" ? "(역)" : ""}`;
  if (share.kind === "now") {
    return { label: "친구가 뽑은 지금의 한 장", headline: name(share.card), body: clip(share.answer), cards: [face(share.deck, share.card)], host };
  }
  if (share.kind === "tarot-free") {
    return { label: "친구가 공유한 무료 타로 풀이", headline: share.cards.map(name).join(" · "), cards: share.cards.map((card) => face(share.deck, card)), host };
  }
  if (share.kind === "saju-free") {
    return { label: `친구가 공유한 ${share.topic ? `${topicLabel(share.topic)} ` : "사주 "}맛보기`, headline: share.title, body: clip(share.summary), elements: true, host };
  }
  if (share.kind === "premium") {
    const product = PREMIUM[share.product];
    return {
      label: `친구가 연 ${product.name}`,
      headline: share.title ? `2027년, ${share.title}` : product.name,
      body: product.sub,
      ...(share.cards?.length ? { cards: share.cards.slice(0, 3).map((card) => face(share.deck ?? "rws1909", card)) } : {}),
      host,
    };
  }
  if (live?.kind === "bonds") {
    // The constellation with its stars where they are; each friend's score, whole stars only, and the total, big, where
    // the constellation's scores show (lib/bonds/share.ts).
    const shown = live.members.some((m) => m.score !== null);
    return {
      label: live.complete ? "완성한 별자리 인연" : `친구들이 채우는 별자리 인연 · 별 ${live.members.length}/${live.slots}`,
      headline: `${live.ownerNickname}님의 ${getConstellation(live.sign).ko}`,
      ...(live.total !== null ? { big: `인연 ${live.total}점` } : {}),
      body: shown ? fitList(live.members.map((m) => (m.score === null ? m.nickname : `${m.nickname} ${m.score}점`)), " · ", BODY_MAX) : `별 ${live.members.length}/${live.slots}`,
      sign: live.sign,
      lit: live.members.map((member) => member.slot),
      host,
    };
  }
  if (live?.kind === "bond") {
    return {
      label: `${live.ownerNickname}님의 ${getConstellation(live.sign).ko} · 별자리 인연`,
      headline: `${live.friendNickname}님과 ${live.ownerNickname}님`,
      big: `인연 ${live.score}점`,
      sign: live.sign,
      host,
    };
  }
  if (share.kind === "bonds" || share.kind === "bond") {
    return { label: "별자리 인연", headline: "친구의 별자리 인연", host };
  }
  if (share.kind === "daily") {
    const { card } = share.reading;
    return {
      label: "친구가 공유한 오늘의 한 장",
      headline: `${getCard(card.cardId).names.ko}${card.orientation === "reversed" ? "(역)" : ""}`,
      body: clip(share.reading.summary),
      cards: [{ cardId: card.cardId, src: `${origin}/cards/og/${share.deck}/${card.cardId}.jpg`, reversed: card.orientation === "reversed" }],
      host,
    };
  }
  if (share.kind === "tarot") {
    const verdict = firstSentence(share.reading.verdict);
    return {
      label: "친구가 공유한 타로 풀이",
      headline: share.cards.map((card) => `${getCard(card.cardId).names.ko}${card.orientation === "reversed" ? "(역)" : ""}`).join(" · "),
      ...(verdict ? { body: clip(verdict) } : {}),
      cards: share.cards.map((card) => ({ cardId: card.cardId, src: `${origin}/cards/og/${share.deck}/${card.cardId}.jpg`, reversed: card.orientation === "reversed" })),
      host,
    };
  }
  const glance = share.reading.glance;
  return {
    label: "친구가 공유한 사주 풀이",
    headline: `${topicLabel(share.topic ?? "overall")} 풀이`,
    body: clip(glance?.thisYear ?? share.reading.sections[0]?.body.split(/(?<=[.?!요])\s+/)[0] ?? ""),
    elements: true,
    host,
  };
}


/** An image as a data URI, so the renderer needs no fetch of its own; undefined when it cannot be read. */
export async function inline(src: string, fetchImpl: typeof fetch): Promise<string | undefined> {
  try {
    const response = await fetchImpl(src);
    if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/jpeg")) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch {
    return undefined;
  }
}

/** The preview's card faces inlined; a face that cannot be read falls back to its name plate. */
export async function withInlineFaces(data: ShareOgData, fetchImpl: typeof fetch = fetch): Promise<ShareOgData> {
  if (!data.cards) return data;
  const cards = await Promise.all(data.cards.map(async (card) => ({ ...card, src: card.src ? await inline(card.src, fetchImpl) : undefined })));
  return { ...data, cards };
}
