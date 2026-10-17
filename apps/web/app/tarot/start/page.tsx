import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NightSky } from "@/components/sky/NightSky";
import { NEW_TAROT_HREF } from "@/lib/freshStart";
import { premiumVisibleHere } from "@/lib/premium/pageGate";
import { NOINDEX } from "@/lib/seo";
import { TarotBridge } from "./TarotBridge";

export const metadata: Metadata = { title: "타로 보기 · 어떤 타로를 볼까요?", robots: NOINDEX };

/**
 * The 다리 화면 before the question builder (owner 2026-10-16), only where premium is visible
 * (plan-reconciled §4.7): anywhere else it does not exist and sends on to today's builder.
 */
export default async function TarotStartPage() {
  if (!(await premiumVisibleHere("tarot-deep"))) redirect(NEW_TAROT_HREF);
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col page-wide">
        <TarotBridge />
      </main>
    </div>
  );
}
