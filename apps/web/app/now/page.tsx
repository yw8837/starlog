import type { Metadata } from "next";
import { NowGuide } from "@/components/seo/toolGuides";
import { NightSky } from "@/components/sky/NightSky";
import { pageMetadata } from "@/lib/seo";
import { NowOracle } from "./NowOracle";

export const metadata: Metadata = pageMetadata({
  title: "지금의 한 장 · 무료 원카드 타로",
  description: "고민 하나를 떠올리고 타로 카드 한 장을 골라요. 카드 그림에서 읽은 한 문장과 그 이유를 바로 보여 드려요. 횟수 제한 없이 무료예요.",
  path: "/now",
});

export default function NowPage() {
  return (
    <div className="page-shell">
      <NightSky fixed moon={false} />
      <main className="page-col">
        <NowOracle />
        <NowGuide />
      </main>
    </div>
  );
}
