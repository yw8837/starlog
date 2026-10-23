import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getConstellation } from "@starlog/core";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { JoinFlow } from "./JoinFlow";
import { codeFromSegment, loadInvite } from "./loadInvite";
import s from "./JoinFlow.module.css";

type Props = { params: Promise<{ code: string }> };

/** One lookup per request, shared by the metadata and the page, so a link preview spends no more lookups than a visit. */
const load = cache(loadInvite);

// The preview says what the KakaoTalk invite says (owner 2026-10-23): "용우님의 양자리에 별이 되어 주세요", over the OG
// image of that constellation; a code that opens nothing to join stays generic.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const clean = codeFromSegment(code);
  // A lookup that cannot run (outside a request, the store unreachable) leaves the generic title.
  const state = clean ? await load(code).catch(() => null) : null;
  const title = state?.status === "open" ? `${state.ownerNickname}님의 ${getConstellation(state.sign).ko}에 별이 되어 주세요` : "별자리 인연 초대";
  return {
    title,
    description: "친구의 별자리에 별이 되어 주세요. 생년월일로 두 사람의 인연 점수를 바로 볼 수 있어요.",
    robots: { index: false, follow: false },
    openGraph: clean
      ? {
          title,
          description: "생년월일과 카드 한 장이면 두 사람의 인연 점수가 나와요",
          images: [{ url: `/api/og/invite/${clean}`, width: 1200, height: 630, alt: title }],
        }
      : undefined,
  };
}

export default async function InviteCodePage({ params }: Props) {
  if (!SITE.features.bonds) notFound();
  const { code } = await params;
  const state = await load(code);
  return (
    <div className="page-shell">
      <NightSky fixed glow="center" seed={17} moon={false} />
      <main className={`page-col ${s.screen}`}>
        <JoinFlow state={state} />
      </main>
      <Footer />
    </div>
  );
}
