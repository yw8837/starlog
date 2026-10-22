import { getCard } from "@starlog/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Footer } from "@/components/layout/Footer";
import { TabBar } from "@/components/layout/TabBar";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { accountDb } from "@/lib/db";
import type { SharePayload } from "@/lib/share/payload";
import { SHARE_ID, findShare } from "@/lib/share/store";
import { NOT_FOUND_METADATA } from "@/lib/seo";
import { PREMIUM } from "@/lib/premium/products";
import { SharedReading, sajuShareTitle } from "./SharedReading";
import { shortCardName } from "./SharedKinds";

/** One lookup per request, shared by the metadata and the page. */
const load = cache(async (id: string) => {
  const db = accountDb();
  return SHARE_ID.test(id) && db ? findShare(db, id) : null;
});

const firstSentence = (text: string) => text.trim().split(/(?<=[.?!요])\s+/)[0] ?? text.trim();

/** The link preview: what was drawn (오늘의 한 장: its card and line, or the saju's short conclusion), never the question or birth data. */
function preview(share: SharePayload): { title: string; description: string } {
  if (share.kind === "now") {
    return { title: `친구가 뽑은 지금의 한 장 · ${shortCardName(share.card)}`, description: share.answer };
  }
  if (share.kind === "tarot-free") {
    return { title: `친구가 뽑은 카드 · ${share.cards.map(shortCardName).join(" · ")}`, description: `${SITE.nameKo}에서 카드로 본 무료 타로 풀이예요. 나도 카드를 뽑아 볼 수 있어요.` };
  }
  if (share.kind === "saju-free") {
    return { title: `친구의 사주 맛보기 · ${share.title}`, description: share.summary };
  }
  if (share.kind === "premium") {
    return { title: `친구가 연 ${PREMIUM[share.product].name}`, description: PREMIUM[share.product].sub };
  }
  if (share.kind === "bonds" || share.kind === "bond") {
    return { title: `친구의 별자리 인연`, description: `${SITE.nameKo} 별자리 인연이에요. 나도 친구들과 별자리를 채워 볼 수 있어요.` };
  }
  if (share.kind === "daily") {
    const { card } = share.reading;
    return { title: `친구가 뽑은 오늘의 한 장 · ${getCard(card.cardId).names.ko}${card.orientation === "reversed" ? "(역)" : ""}`, description: share.reading.summary };
  }
  if (share.kind === "tarot") {
    const names = share.cards.map((card) => `${getCard(card.cardId).names.ko}${card.orientation === "reversed" ? "(역)" : ""}`).join(" · ");
    return { title: `친구가 뽑은 카드 · ${names}`, description: `${SITE.nameKo}에서 카드로 본 타로 풀이예요. 나도 카드를 뽑아 볼 수 있어요.` };
  }
  const conclusion = share.reading.glance?.thisYear ?? firstSentence(share.reading.sections[0]?.body ?? "");
  return { title: `친구의 ${sajuShareTitle(share)}`, description: conclusion || `${SITE.nameKo}에서 만세력으로 본 사주 풀이예요.` };
}

// A shared reading is personal: out of search, while its link preview still shows (robots noindex only).
export async function generateMetadata({ params }: PageProps<"/s/[id]">): Promise<Metadata> {
  const { id } = await params;
  const share = await load(id);
  if (!share) return NOT_FOUND_METADATA;
  const { title, description } = preview(share.payload);
  const image = { url: `/api/og/share/${share.id}`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, images: [image], type: "website", url: `/s/${share.id}` },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function SharePage({ params }: PageProps<"/s/[id]">) {
  const { id } = await params;
  const share = await load(id);
  if (!share) notFound();
  return (
    <div className="page-shell with-tabbar">
      <NightSky fixed moon={false} />
      <TabBar />
      <main className="page-col page-wide">
        <SharedReading share={share.payload} />
      </main>
      <Footer />
    </div>
  );
}
