import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/layout/Footer";
import { NightSky } from "@/components/sky/NightSky";
import { SITE } from "@/lib/config";
import { normalizeCode } from "@/lib/bonds/text";
import { JoinFlow } from "./JoinFlow";
import { loadInvite } from "./loadInvite";
import s from "./JoinFlow.module.css";

type Props = { params: Promise<{ code: string }> };

// The title stays generic (no lookup here, so a link preview never spends the visitor's code lookups).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const clean = normalizeCode(decodeURIComponent(code));
  return {
    title: "별자리 인연 초대",
    description: "친구의 별자리에 별이 되어 주세요. 생년월일로 두 사람의 인연 점수를 바로 볼 수 있어요.",
    robots: { index: false, follow: false },
    openGraph: clean ? { title: "별자리 인연 초대", description: "친구의 별자리에 별이 되어 주세요" } : undefined,
  };
}

export default async function InviteCodePage({ params }: Props) {
  if (!SITE.features.bonds) notFound();
  const { code } = await params;
  const state = await loadInvite(code);
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
