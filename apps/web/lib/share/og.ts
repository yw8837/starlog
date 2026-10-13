import { getCard } from "@starlog/core";
import { SITE } from "@/lib/config";
import type { ShareOgData } from "@/lib/og/cardsImage";
import { topicLabel } from "@/lib/sajuTopics";
import type { SharePayload } from "./payload";

/** The longest saju conclusion the preview prints (about three lines). */
const BODY_MAX = 90;

const clip = (text: string) => (text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text);

/** What the link preview of a shared reading shows: the cards drawn, or the saju's short conclusion. */
export function shareOgData(share: SharePayload, origin: string): ShareOgData {
  const host = new URL(SITE.url).host;
  if (share.kind === "tarot") {
    return {
      label: "친구가 공유한 타로 풀이",
      headline: share.cards.map((card) => `${getCard(card.cardId).names.ko}${card.orientation === "reversed" ? "(역)" : ""}`).join(" · "),
      cards: share.cards.map((card) => ({ cardId: card.cardId, src: `${origin}/cards/og/${share.deck}/${card.cardId}.jpg`, reversed: card.orientation === "reversed" })),
      host,
    };
  }
  const glance = share.reading.glance;
  return {
    label: "친구가 공유한 사주 풀이",
    headline: `${topicLabel(share.topic ?? "overall")} 풀이`,
    body: clip(glance?.thisYear ?? share.reading.sections[0]?.body.split(/(?<=[.?!요])\s+/)[0] ?? ""),
    host,
  };
}


/** An image as a data URI, so the renderer needs no fetch of its own; undefined when it cannot be read. */
async function inline(src: string, fetchImpl: typeof fetch): Promise<string | undefined> {
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
